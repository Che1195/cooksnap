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
import dns from "node:dns/promises";
import { createClient } from "@/lib/supabase/server";
import { scrapeRecipe } from "@/lib/scraper";
import { fetchRenderedHtml } from "@/lib/cloudflare-render";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5 MB — prevents memory exhaustion from huge pages
const MAX_REDIRECTS = 5; // Maximum redirect hops before aborting
const FETCH_TIMEOUT_MS = 15_000; // 15 seconds — overall fetch timeout
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute sliding window
const RATE_LIMIT_MAX = 10; // Max requests per user within the window

/** Regex patterns matching private / reserved IPv4 ranges. */
const BLOCKED_IPV4_PATTERNS = [
  /^0\.\d+\.\d+\.\d+$/, // 0.0.0.0/8
  /^127\.\d+\.\d+\.\d+$/, // 127.0.0.0/8
  /^10\.\d+\.\d+\.\d+$/, // 10.0.0.0/8
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/, // 172.16.0.0/12
  /^192\.168\.\d+\.\d+$/, // 192.168.0.0/16
  /^169\.254\.\d+\.\d+$/, // 169.254.0.0/16
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+$/, // 100.64.0.0/10 — CGNAT (RFC 6598), used by cloud providers for internal endpoints
  /^192\.0\.2\.\d+$/,     // 192.0.2.0/24 — TEST-NET-1 (RFC 5737)
  /^198\.51\.100\.\d+$/,  // 198.51.100.0/24 — TEST-NET-2 (RFC 5737)
  /^203\.0\.113\.\d+$/,   // 203.0.113.0/24 — TEST-NET-3 (RFC 5737)
  /^198\.1[89]\.\d+\.\d+$/,  // 198.18.0.0/15 — Benchmark testing (RFC 2544)
  /^(24\d|25[0-5])\.\d+\.\d+\.\d+$/, // 240.0.0.0/4 — Reserved (RFC 1112)
];

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

// Periodically prune stale entries so the map doesn't grow unbounded.
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
}, RATE_LIMIT_WINDOW_MS).unref();

// ---------------------------------------------------------------------------
// SSRF helpers
// ---------------------------------------------------------------------------

/** Check whether a single IP address falls in a blocked range. */
export function isBlockedIP(ip: string): boolean {
  // Strip IPv4-mapped IPv6 prefix (e.g. ::ffff:127.0.0.1 → 127.0.0.1)
  const normalized = ip.replace(/^::ffff:/i, "");

  // Check IPv4 blocked ranges
  for (const pattern of BLOCKED_IPV4_PATTERNS) {
    if (pattern.test(normalized)) return true;
  }

  // IPv6 loopback
  if (normalized === "::1" || ip === "::1") return true;

  // IPv6 private ranges: fc00::/7 (unique local) and fe80::/10 (link-local)
  if (
    /^fc/i.test(ip) ||
    /^fd/i.test(ip) ||
    /^fe[89abcdef]/i.test(ip)
  ) {
    return true;
  }

  return false;
}

/**
 * Resolve a hostname via DNS and validate that none of the resolved IPs
 * fall in a blocked range. Throws a user-facing message on failure.
 */
async function resolveAndValidateHost(hostname: string): Promise<void> {
  // Collect all resolved addresses (IPv4 + IPv6).
  const addresses: string[] = [];

  try {
    const ipv4 = await dns.resolve4(hostname);
    addresses.push(...ipv4);
  } catch {
    // No A records — not necessarily an error, could be IPv6-only.
  }

  try {
    const ipv6 = await dns.resolve6(hostname);
    addresses.push(...ipv6);
  } catch {
    // No AAAA records.
  }

  if (addresses.length === 0) {
    throw new SSRFError("Could not resolve hostname.");
  }

  for (const ip of addresses) {
    if (isBlockedIP(ip)) {
      throw new SSRFError(
        "Invalid URL. Requests to private addresses are not allowed."
      );
    }
  }
}

/** Sentinel error so we can distinguish SSRF blocks from other failures. */
class SSRFError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SSRFError";
  }
}

// ---------------------------------------------------------------------------
// Fetch with manual redirect validation
// ---------------------------------------------------------------------------

/**
 * Fetch a URL with manual redirect handling. Each redirect target is
 * re-validated through DNS resolution + IP blocklist before following.
 */
async function safeFetch(
  initialUrl: URL,
  signal: AbortSignal
): Promise<Response> {
  let currentUrl = initialUrl;

  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    await resolveAndValidateHost(currentUrl.hostname);

    const response = await fetch(currentUrl.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; CookSnap/1.0; +https://cooksnap.app)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "manual",
      signal,
    });

    // Not a redirect — return the final response.
    if (
      response.status < 300 ||
      response.status >= 400 ||
      !response.headers.get("location")
    ) {
      return response;
    }

    // Parse the redirect target.
    const location = response.headers.get("location")!;
    let nextUrl: URL;
    try {
      nextUrl = new URL(location, currentUrl);
    } catch {
      throw new SSRFError("Redirect contained an invalid URL.");
    }

    if (!["http:", "https:"].includes(nextUrl.protocol)) {
      throw new SSRFError("Redirect to a non-HTTP protocol is not allowed.");
    }

    if (nextUrl.port && !["80", "443", ""].includes(nextUrl.port)) {
      throw new SSRFError("Only standard HTTP ports (80, 443) are allowed.");
    }

    currentUrl = nextUrl;
  }

  throw new SSRFError("Too many redirects.");
}

// ---------------------------------------------------------------------------
// Response body helpers
// ---------------------------------------------------------------------------

/**
 * Read the response body as text, enforcing a maximum byte size.
 * Checks Content-Length first, then streams with a hard cap.
 */
async function readBodyWithLimit(
  response: Response,
  maxBytes: number
): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > maxBytes) {
    throw new PayloadTooLargeError();
  }

  const reader = response.body?.getReader();
  if (!reader) {
    return "";
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      reader.cancel();
      throw new PayloadTooLargeError();
    }
    chunks.push(value);
  }

  const decoder = new TextDecoder();
  return chunks.map((c) => decoder.decode(c, { stream: true })).join("") +
    decoder.decode();
}

class PayloadTooLargeError extends Error {
  constructor() {
    super("Response too large (max 5 MB).");
    this.name = "PayloadTooLargeError";
  }
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
      // Fallback: try rendering with headless browser for SPA sites
      const renderedHtml = await fetchRenderedHtml(url);
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
