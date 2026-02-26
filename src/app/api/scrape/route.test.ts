/**
 * Tests for the scrape API route handler (POST /api/scrape).
 *
 * Covers:
 *   - isBlockedIP: SSRF protection for private/reserved IP ranges
 *   - Route handler: auth, input validation, rate limiting
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// vi.hoisted — these run before vi.mock factories, which are hoisted to top.
// ---------------------------------------------------------------------------

const { mockGetUser } = vi.hoisted(() => {
  const mockGetUser = vi.fn();
  return { mockGetUser };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
  }),
}));

vi.mock("@/lib/scraper", () => ({
  scrapeRecipe: vi.fn(),
}));

vi.mock("@/lib/cloudflare-render", () => ({
  fetchRenderedHtml: vi.fn(),
}));

// Mock dns module to prevent actual DNS resolution in tests
vi.mock("node:dns/promises", () => ({
  default: {
    resolve4: vi.fn().mockResolvedValue(["93.184.216.34"]),
    resolve6: vi.fn().mockRejectedValue(new Error("No AAAA")),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { isBlockedIP, POST } from "./route";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Helper to create a NextRequest with JSON body
// ---------------------------------------------------------------------------

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/scrape", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// isBlockedIP tests — direct unit tests for the SSRF filter
// ---------------------------------------------------------------------------

describe("isBlockedIP", () => {
  it("blocks localhost (127.x.x.x)", () => {
    expect(isBlockedIP("127.0.0.1")).toBe(true);
    expect(isBlockedIP("127.255.255.255")).toBe(true);
  });

  it("blocks 10.x.x.x (private class A)", () => {
    expect(isBlockedIP("10.0.0.1")).toBe(true);
    expect(isBlockedIP("10.255.255.255")).toBe(true);
  });

  it("blocks 192.168.x.x (private class C)", () => {
    expect(isBlockedIP("192.168.1.1")).toBe(true);
    expect(isBlockedIP("192.168.0.0")).toBe(true);
  });

  it("blocks 172.16-31.x.x (private class B)", () => {
    expect(isBlockedIP("172.16.0.1")).toBe(true);
    expect(isBlockedIP("172.31.255.255")).toBe(true);
  });

  it("blocks 0.x.x.x", () => {
    expect(isBlockedIP("0.0.0.0")).toBe(true);
    expect(isBlockedIP("0.1.2.3")).toBe(true);
  });

  it("blocks IPv6 loopback (::1)", () => {
    expect(isBlockedIP("::1")).toBe(true);
  });

  it("blocks IPv4-mapped IPv6 addresses", () => {
    expect(isBlockedIP("::ffff:127.0.0.1")).toBe(true);
    expect(isBlockedIP("::ffff:10.0.0.1")).toBe(true);
    expect(isBlockedIP("::ffff:192.168.1.1")).toBe(true);
  });

  it("blocks IPv6 unique local (fc00::/7)", () => {
    expect(isBlockedIP("fc00::1")).toBe(true);
    expect(isBlockedIP("fd12::1")).toBe(true);
  });

  it("blocks link-local IPv6 (fe80::/10)", () => {
    expect(isBlockedIP("fe80::1")).toBe(true);
  });

  it("blocks 169.254.x.x (link-local IPv4)", () => {
    expect(isBlockedIP("169.254.1.1")).toBe(true);
    expect(isBlockedIP("169.254.0.0")).toBe(true);
  });

  it("blocks 100.64-127.x.x (CGNAT, RFC 6598)", () => {
    expect(isBlockedIP("100.64.0.1")).toBe(true);
    expect(isBlockedIP("100.100.100.100")).toBe(true);
    expect(isBlockedIP("100.127.255.255")).toBe(true);
    // Just outside CGNAT range — should be allowed
    expect(isBlockedIP("100.63.255.255")).toBe(false);
    expect(isBlockedIP("100.128.0.0")).toBe(false);
  });

  it("blocks TEST-NET ranges (RFC 5737)", () => {
    expect(isBlockedIP("192.0.2.1")).toBe(true);
    expect(isBlockedIP("198.51.100.1")).toBe(true);
    expect(isBlockedIP("203.0.113.1")).toBe(true);
  });

  it("blocks 198.18.x.x (benchmark testing, RFC 2544)", () => {
    expect(isBlockedIP("198.18.0.1")).toBe(true);
    expect(isBlockedIP("198.19.255.255")).toBe(true);
    // Just outside the range — should be allowed
    expect(isBlockedIP("198.17.255.255")).toBe(false);
    expect(isBlockedIP("198.20.0.1")).toBe(false);
  });

  it("blocks IPv6 site-local (fec0::/10)", () => {
    expect(isBlockedIP("fec0::1")).toBe(true);
    expect(isBlockedIP("fef0::1")).toBe(true);
  });

  it("blocks reserved 240.0.0.0/4 range", () => {
    expect(isBlockedIP("240.0.0.1")).toBe(true);
    expect(isBlockedIP("255.255.255.255")).toBe(true);
    // Just below reserved range — should be allowed
    expect(isBlockedIP("239.255.255.255")).toBe(false);
  });

  it("allows public IPs", () => {
    expect(isBlockedIP("8.8.8.8")).toBe(false);
    expect(isBlockedIP("1.1.1.1")).toBe(false);
    expect(isBlockedIP("93.184.216.34")).toBe(false);
  });

  it("allows 172.32+ (not in private 172.16-31 range)", () => {
    expect(isBlockedIP("172.32.0.1")).toBe(false);
    expect(isBlockedIP("172.15.255.255")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Route handler tests
// ---------------------------------------------------------------------------

describe("POST /api/scrape", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 for unauthenticated requests", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const req = createRequest({ url: "https://example.com/recipe" });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toMatch(/authentication/i);
  });

  it("returns 400 when URL is missing", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });

    const req = createRequest({});
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/url/i);
  });

  it("returns 400 when URL is not a string", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-2" } } });

    const req = createRequest({ url: 12345 });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/url/i);
  });

  it("returns 400 for non-http/https URLs", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-3" } } });

    const req = createRequest({ url: "ftp://example.com/recipe" });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/invalid url/i);
  });

  it("returns 400 for completely invalid URLs", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-4" } } });

    const req = createRequest({ url: "not a url at all" });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/invalid url/i);
  });

  it("returns 400 for malformed JSON body", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "malformed-json-user" } } });

    const req = new NextRequest("http://localhost:3000/api/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not valid json{{{",
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/invalid|body/i);
  });

  // R5-11: Port restriction — non-standard ports are rejected
  it("returns 400 for URLs with non-standard ports", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "port-test-user" } } });

    const req = createRequest({ url: "https://example.com:8080/recipe" });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/standard HTTP ports/i);
  });

  // R5-28: Retry-After header on 429 responses
  it("includes Retry-After header on 429 responses", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "retry-after-test-user" } },
    });

    const { scrapeRecipe } = await import("@/lib/scraper");
    const mockScrapeRecipe = vi.mocked(scrapeRecipe);
    mockScrapeRecipe.mockReturnValue({
      title: "Test",
      ingredients: [],
      instructions: [],
      image: null,
    });

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("<html></html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      })
    );

    // Exhaust rate limit (10 requests)
    for (let i = 0; i < 10; i++) {
      const req = createRequest({ url: "https://example.com/recipe" });
      await POST(req);
    }

    // 11th request triggers 429 with Retry-After header
    const req = createRequest({ url: "https://example.com/recipe" });
    const res = await POST(req);

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");

    fetchSpy.mockRestore();
  });

  // R3-7: Happy-path integration test — authenticated user scrapes a valid HTML page
  it("returns 200 with scraped recipe on success", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "happy-path-user" } },
    });

    const { scrapeRecipe } = await import("@/lib/scraper");
    const mockScrapeRecipe = vi.mocked(scrapeRecipe);
    mockScrapeRecipe.mockReturnValue({
      title: "Test Recipe",
      ingredients: ["1 cup flour"],
      instructions: ["Mix"],
      image: null,
    });

    const fakeHtml = "<html><body>recipe page</body></html>";
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(fakeHtml, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      })
    );

    const req = createRequest({ url: "https://example.com/recipe" });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.title).toBe("Test Recipe");
    expect(body.ingredients).toEqual(["1 cup flour"]);
    expect(body.instructions).toEqual(["Mix"]);

    fetchSpy.mockRestore();
  });

  // R3-12: Rate limiting — 11th request within window should be rejected
  it("returns 429 after exceeding rate limit", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "rate-limit-test-user" } },
    });

    const { scrapeRecipe } = await import("@/lib/scraper");
    const mockScrapeRecipe = vi.mocked(scrapeRecipe);
    mockScrapeRecipe.mockReturnValue({
      title: "Test",
      ingredients: [],
      instructions: [],
      image: null,
    });

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("<html></html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      })
    );

    // Fire 10 requests — all should succeed (not 429)
    for (let i = 0; i < 10; i++) {
      const req = createRequest({ url: "https://example.com/recipe" });
      const res = await POST(req);
      expect(res.status).not.toBe(429);
    }

    // 11th request should be rate-limited
    const req = createRequest({ url: "https://example.com/recipe" });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body.error).toMatch(/too many requests/i);

    fetchSpy.mockRestore();
  });

  // R3-13: Content-type validation — non-HTML responses are rejected
  it("returns 422 for non-HTML content-type", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "content-type-test-user" } },
    });

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response('{"key":"value"}', {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const req = createRequest({ url: "https://example.com/api/data" });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error).toMatch(/html/i);

    fetchSpy.mockRestore();
  });

  // R3-14: Payload size limit — responses exceeding 5 MB are rejected
  it("returns 422 for responses exceeding size limit", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "size-limit-test-user" } },
    });

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("<html></html>", {
        status: 200,
        headers: {
          "Content-Type": "text/html",
          "Content-Length": "10000000",
        },
      })
    );

    const req = createRequest({ url: "https://example.com/huge-page" });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error).toMatch(/too large|5 MB/i);

    fetchSpy.mockRestore();
  });

  // R3-15: Timeout handling — fetch timeouts return 504
  it("returns 504 when fetch times out", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "timeout-test-user" } },
    });

    const timeoutError = new Error("The operation was aborted due to timeout");
    timeoutError.name = "TimeoutError";

    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockRejectedValue(timeoutError);

    const req = createRequest({ url: "https://example.com/slow-page" });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(504);
    expect(body.error).toMatch(/timed out/i);

    fetchSpy.mockRestore();
  });

  // --- Cloudflare Browser Rendering fallback tests ---------------------------

  it("calls fallback when scrapeRecipe returns null on first pass", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "fallback-test-user" } },
    });

    const { scrapeRecipe } = await import("@/lib/scraper");
    const mockScrapeRecipe = vi.mocked(scrapeRecipe);
    // First call (raw HTML) → null, second call (rendered HTML) → recipe
    mockScrapeRecipe
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({
        title: "SPA Recipe",
        ingredients: ["1 avocado"],
        instructions: ["Mash it"],
        image: null,
      });

    const { fetchRenderedHtml } = await import("@/lib/cloudflare-render");
    const mockFetchRendered = vi.mocked(fetchRenderedHtml);
    mockFetchRendered.mockResolvedValue("<html><body>rendered</body></html>");

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("<html></html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      })
    );

    const req = createRequest({ url: "https://spa-site.com/recipe" });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.title).toBe("SPA Recipe");
    expect(mockFetchRendered).toHaveBeenCalledWith("https://spa-site.com/recipe");
    expect(mockScrapeRecipe).toHaveBeenCalledTimes(2);

    fetchSpy.mockRestore();
  });

  it("returns 422 when fallback also fails to find a recipe", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "fallback-fail-user" } },
    });

    const { scrapeRecipe } = await import("@/lib/scraper");
    const mockScrapeRecipe = vi.mocked(scrapeRecipe);
    mockScrapeRecipe.mockReturnValue(null);

    const { fetchRenderedHtml } = await import("@/lib/cloudflare-render");
    const mockFetchRendered = vi.mocked(fetchRenderedHtml);
    mockFetchRendered.mockResolvedValue("<html><body>still no recipe</body></html>");

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("<html></html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      })
    );

    const req = createRequest({ url: "https://spa-site.com/recipe" });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error).toMatch(/could not find recipe/i);

    fetchSpy.mockRestore();
  });

  it("returns 422 gracefully when fallback returns null", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "fallback-null-user" } },
    });

    const { scrapeRecipe } = await import("@/lib/scraper");
    const mockScrapeRecipe = vi.mocked(scrapeRecipe);
    mockScrapeRecipe.mockReturnValue(null);

    const { fetchRenderedHtml } = await import("@/lib/cloudflare-render");
    const mockFetchRendered = vi.mocked(fetchRenderedHtml);
    mockFetchRendered.mockResolvedValue(null);

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("<html></html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      })
    );

    const req = createRequest({ url: "https://spa-site.com/recipe" });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error).toMatch(/could not find recipe/i);
    expect(mockScrapeRecipe).toHaveBeenCalledTimes(1); // Not called again when rendered HTML is null

    fetchSpy.mockRestore();
  });

  it("does NOT call fallback when first parse succeeds", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "no-fallback-user" } },
    });

    const { scrapeRecipe } = await import("@/lib/scraper");
    const mockScrapeRecipe = vi.mocked(scrapeRecipe);
    mockScrapeRecipe.mockReturnValue({
      title: "Normal Recipe",
      ingredients: ["salt"],
      instructions: ["Season"],
      image: null,
    });

    const { fetchRenderedHtml } = await import("@/lib/cloudflare-render");
    const mockFetchRendered = vi.mocked(fetchRenderedHtml);

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("<html><script type='application/ld+json'>{}</script></html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      })
    );

    const req = createRequest({ url: "https://normal-site.com/recipe" });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.title).toBe("Normal Recipe");
    expect(mockFetchRendered).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });
});
