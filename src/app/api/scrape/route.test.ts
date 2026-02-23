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
});
