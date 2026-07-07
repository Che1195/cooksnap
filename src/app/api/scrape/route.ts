/**
 * POST /api/scrape — fetches a URL and extracts structured recipe data.
 *
 * Security hardening:
 *   - Supabase auth required (C1)
 *   - SSRF protection via DNS resolution + IP blocklist + manual redirects (C2)
 *   - 5 MB response size cap (M1)
 *   - In-memory rate limiting: 10 req/min/user (M2)
 *   - Content-Type validation (L10)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { scrapeRecipe } from "@/lib/scraper";
import { fetchRenderedHtml } from "@/lib/cloudflare-render";
import {
  SSRFError,
  PayloadTooLargeError,
  resolveAndValidateHost,
  safeFetch,
  readBodyWithLimit,
} from "@/lib/safe-fetch";

// Re-exported for tests and backwards compatibility; implementation moved to
// the shared SSRF module so other routes (image persistence) reuse it.
export { isBlockedIP } from "@/lib/safe-fetch";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Worst case: 15 s direct fetch + 45 s render fallback. Without this the
// platform default (15 s) kills the function mid-render with an opaque 504.
export const maxDuration = 60;

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5 MB — prevents memory exhaustion from huge pages
const FETCH_TIMEOUT_MS = 15_000; // 15 seconds — overall fetch timeout
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute sliding window
const RATE_LIMIT_MAX = 10; // Max requests per user within the window

// Cloudflare Browser Rendering is expensive (free tier: 10 browser-min/day,
// each render holds a session up to 45 s), so it gets its own budget on top
// of the request rate limit. In-memory per instance — best effort, same
// caveat as the M2 rate limiter.
const RENDER_LIMIT_WINDOW_MS = 10 * 60_000; // per-user sliding window
const RENDER_LIMIT_MAX = 3; // renders per user within the window
const RENDER_DAILY_MAX = 30; // global renders per day per instance

// ---------------------------------------------------------------------------
// Rate limiter (in-memory, per-user)
// ---------------------------------------------------------------------------

const rateLimitMap = new Map<string, number[]>();

/** Remove timestamps older than the window. Runs on every check. */
function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(userId) ?? [];
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  rateLimitMap.set(userId, recent);

  if (recent.length >= RATE_LIMIT_MAX) return false;

  recent.push(now);
  return true;
}

// Periodically prune stale entries so the maps don't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [userId, timestamps] of rateLimitMap) {
    const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (recent.length === 0) {
      rateLimitMap.delete(userId);
    } else {
      rateLimitMap.set(userId, recent);
    }
  }
  for (const [userId, timestamps] of renderLimitMap) {
    const recent = timestamps.filter((t) => now - t < RENDER_LIMIT_WINDOW_MS);
    if (recent.length === 0) {
      renderLimitMap.delete(userId);
    } else {
      renderLimitMap.set(userId, recent);
    }
  }
}, RATE_LIMIT_WINDOW_MS).unref();

// ---------------------------------------------------------------------------
// Render fallback budget (per-user window + global daily cap)
// ---------------------------------------------------------------------------

const renderLimitMap = new Map<string, number[]>();
let renderDayStart = Date.now();
let renderDayCount = 0;

/** Check and consume render budget. Returns false when exhausted. */
function checkRenderBudget(userId: string): boolean {
  const now = Date.now();

  if (now - renderDayStart >= 86_400_000) {
    renderDayStart = now;
    renderDayCount = 0;
  }
  if (renderDayCount >= RENDER_DAILY_MAX) return false;

  const recent = (renderLimitMap.get(userId) ?? []).filter(
    (t) => now - t < RENDER_LIMIT_WINDOW_MS
  );
  if (recent.length >= RENDER_LIMIT_MAX) {
    renderLimitMap.set(userId, recent);
    return false;
  }

  recent.push(now);
  renderLimitMap.set(userId, recent);
  renderDayCount++;
  return true;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    // --- Auth (C1) --------------------------------------------------------
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 }
      );
    }

    // --- Rate limiting (M2) -----------------------------------------------
    if (!checkRateLimit(user.id)) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a moment and try again." },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }

    // --- Input validation --------------------------------------------------
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid request body." },
        { status: 400 }
      );
    }
    const { url } = body as { url?: string };

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "URL is required" },
        { status: 400 }
      );
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        throw new Error("Invalid protocol");
      }
    } catch {
      return NextResponse.json(
        { error: "Invalid URL. Please enter a valid web address." },
        { status: 400 }
      );
    }

    // --- Port restriction (R5-11) -----------------------------------------
    if (parsedUrl.port && !["80", "443", ""].includes(parsedUrl.port)) {
      return NextResponse.json(
        { error: "Only standard HTTP ports (80, 443) are allowed." },
        { status: 400 }
      );
    }

    // --- Fetch with SSRF protection (C2) ----------------------------------
    const response = await safeFetch(
      parsedUrl,
      AbortSignal.timeout(FETCH_TIMEOUT_MS)
    );

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json(
          { error: "Page not found. Please check the URL and try again." },
          { status: 422 }
        );
      }
      if (response.status === 429) {
        return NextResponse.json(
          { error: "Rate limited. Please wait a moment and try again." },
          { status: 429 }
        );
      }
      if (response.status === 403) {
        return NextResponse.json(
          { error: "Access denied. The site does not allow scraping." },
          { status: 403 }
        );
      }
      return NextResponse.json(
        { error: `Failed to fetch page (${response.status})` },
        { status: 502 }
      );
    }

    // --- Content-Type validation (L10) ------------------------------------
    const contentType = response.headers.get("content-type") ?? "";
    if (
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml+xml")
    ) {
      return NextResponse.json(
        {
          error:
            "The URL did not return an HTML page. Only HTML recipe pages are supported.",
        },
        { status: 422 }
      );
    }

    // --- Read body with size cap (M1) -------------------------------------
    const html = await readBodyWithLimit(response, MAX_RESPONSE_BYTES);

    // --- Parse recipe ------------------------------------------------------
    const recipe = scrapeRecipe(html, url);

    if (!recipe) {
      // Fallback: try rendering with headless browser for SPA sites.
      // The render fetch happens on Cloudflare's side, outside safeFetch's
      // redirect/IP validation — re-check the host (DNS may have changed since
      // the initial check) and consume render budget before invoking it.
      let renderedHtml: string | null = null;
      if (checkRenderBudget(user.id)) {
        try {
          await resolveAndValidateHost(parsedUrl.hostname);
          renderedHtml = await fetchRenderedHtml(url);
        } catch {
          // Blocked or unresolvable host at render time — treat as unrenderable.
        }
      }
      if (renderedHtml) {
        const renderedRecipe = scrapeRecipe(renderedHtml, url);
        if (renderedRecipe) return NextResponse.json(renderedRecipe);
      }

      return NextResponse.json(
        {
          error:
            "Could not find recipe data on this page. The site may not use standard recipe markup.",
        },
        { status: 422 }
      );
    }

    return NextResponse.json(recipe);
  } catch (error) {
    if (error instanceof SSRFError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof PayloadTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }

    const err = error as { name?: string; message?: string };
    if (
      err.name === "TimeoutError" ||
      err.name === "AbortError" ||
      (err.message && err.message.toLowerCase().includes("timeout"))
    ) {
      return NextResponse.json(
        { error: "Request timed out. The site may be slow or unavailable." },
        { status: 504 }
      );
    }

    console.error("Scrape error:", error);
    return NextResponse.json(
      { error: "Something went wrong while scraping." },
      { status: 500 }
    );
  }
}
