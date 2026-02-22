import { NextRequest, NextResponse } from "next/server";
import { scrapeRecipe } from "@/lib/scraper";

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
    if (error instanceof DOMException && error.name === "TimeoutError") {
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
