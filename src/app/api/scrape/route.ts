import { NextRequest, NextResponse } from "next/server";
import { scrapeRecipe } from "@/lib/scraper";

const BLOCKED_IP_PATTERNS = [
  /^127\.\d+\.\d+\.\d+$/, // 127.0.0.0/8
  /^10\.\d+\.\d+\.\d+$/, // 10.0.0.0/8
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/, // 172.16.0.0/12
  /^192\.168\.\d+\.\d+$/, // 192.168.0.0/16
  /^169\.254\.\d+\.\d+$/, // 169.254.0.0/16
  /^0\.0\.0\.0$/, // 0.0.0.0
];

const BLOCKED_HOSTNAMES = ["localhost", "[::1]"];

function isBlockedHost(hostname: string): boolean {
  const normalizedHostname = hostname.replace(/^\[|\]$/g, "");

  if (BLOCKED_HOSTNAMES.includes(hostname)) return true;

  for (const pattern of BLOCKED_IP_PATTERNS) {
    if (pattern.test(normalizedHostname)) return true;
  }

  // Block IPv6 private ranges: fc00::/7 (unique local) and fe80::/10 (link-local)
  if (
    /^fc/i.test(normalizedHostname) ||
    /^fd/i.test(normalizedHostname) ||
    /^fe[89ab]/i.test(normalizedHostname) ||
    normalizedHostname === "::1"
  ) {
    return true;
  }

  return false;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body as { url?: string };

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "URL is required" },
        { status: 400 }
      );
    }

    // Basic URL validation
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

    // SSRF protection: block requests to private/internal addresses
    if (isBlockedHost(parsedUrl.hostname)) {
      return NextResponse.json(
        { error: "Invalid URL. Requests to private addresses are not allowed." },
        { status: 400 }
      );
    }

    // Fetch the page
    const response = await fetch(parsedUrl.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; CookSnap/1.0; +https://cooksnap.app)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });

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

    const html = await response.text();
    const recipe = scrapeRecipe(html, url);

    if (!recipe) {
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
