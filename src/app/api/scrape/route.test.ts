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
});
