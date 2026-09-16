import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("convex/nextjs", () => ({ fetchMutation: vi.fn() }));
vi.mock("@/lib/recipe-capture-fetch", () => ({ pinnedRecipeFetch: vi.fn() }));
vi.mock("@/lib/recipe-capture-model", async () => {
  const actual = await vi.importActual<typeof import("@/lib/recipe-capture-model")>(
    "@/lib/recipe-capture-model",
  );
  return { ...actual, interpretCapture: vi.fn() };
});
vi.mock("@/lib/cloudflare-render", () => ({ fetchRenderedHtml: vi.fn() }));
import { auth } from "@clerk/nextjs/server";
import { fetchMutation } from "convex/nextjs";
import { pinnedRecipeFetch } from "@/lib/recipe-capture-fetch";
import { interpretCapture, CaptureError } from "@/lib/recipe-capture-model";
import { POST, isBlockedIP } from "./route";
const createRequest = (body: unknown) =>
  new NextRequest("http://localhost/api/scrape", {
    method: "POST",
    body: JSON.stringify(body),
  });
const body = {
  url: "https://example.com/recipe",
  importId: "abcdefghijklmnop",
};
const html =
  '<script type="application/ld+json">' +
  JSON.stringify({
    "@type": "Recipe",
    name: "Soup",
    recipeIngredient: ["1 cup water"],
    recipeInstructions: ["Boil water."],
  }) +
  "</script>";
afterEach(() => vi.restoreAllMocks());
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(auth).mockResolvedValue({
    userId: "alice",
    getToken: async () => "token",
  } as unknown as Awaited<ReturnType<typeof auth>>);
  vi.mocked(fetchMutation).mockResolvedValue({ allowed: true });
  vi.mocked(pinnedRecipeFetch).mockResolvedValue(
    new Response(html, { headers: { "content-type": "text/html" } }),
  );
  vi.mocked(interpretCapture).mockResolvedValue({
    title: "Soup",
    image: null,
    ingredients: ["1 cup water"],
    instructions: ["Boil water."],
    warnings: [],
    needsReview: false,
    telemetry: {},
  } as unknown as Awaited<ReturnType<typeof interpretCapture>>);
});
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
  it("passes the remaining import deadline to analysis after slow source fetching", async () => {
    let now = 100_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    vi.mocked(pinnedRecipeFetch).mockImplementationOnce(async () => {
      now += 9_000;
      return new Response(html, { headers: { "content-type": "text/html" } });
    });
    expect((await POST(createRequest(body))).status).toBe(200);
    expect(vi.mocked(interpretCapture).mock.calls[0][2]).toEqual({ deadlineAt: 153_000 });
  });
  it("requires authentication", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as Awaited<
      ReturnType<typeof auth>
    >);
    expect((await POST(createRequest(body))).status).toBe(401);
    expect(fetchMutation).not.toHaveBeenCalled();
  });
  it.each([
    null,
    {},
    { ...body, url: "file:///etc/passwd" },
    { ...body, url: "https://example.com:8080" },
    { ...body, url: "https://user:pass@example.com" },
    { ...body, importId: "bad" },
  ])("rejects malformed inputs %j", async (input) => {
    expect((await POST(createRequest(input))).status).toBe(400);
    expect(pinnedRecipeFetch).not.toHaveBeenCalled();
  });
  it("runs AI even for complete structured sources", async () => {
    const response = await POST(createRequest(body));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      title: "Soup",
      importId: body.importId,
    });
    expect(interpretCapture).toHaveBeenCalledOnce();
    expect(vi.mocked(interpretCapture).mock.calls[0][0].method).toBe(
      "structured",
    );
  });
  it("rejects duplicate inference before fetching", async () => {
    vi.mocked(fetchMutation).mockResolvedValue({
      allowed: false,
      reason: "duplicate",
    });
    expect((await POST(createRequest(body))).status).toBe(409);
    expect(pinnedRecipeFetch).not.toHaveBeenCalled();
  });
  it("does not analyze denied source pages", async () => {
    vi.mocked(pinnedRecipeFetch).mockResolvedValue(
      new Response("denied", { status: 403 }),
    );
    expect((await POST(createRequest(body))).status).toBe(403);
    expect(interpretCapture).not.toHaveBeenCalled();
  });
  it("does not silently return source data when AI fails", async () => {
    vi.mocked(interpretCapture).mockRejectedValue(
      new CaptureError("Analysis unavailable", 503, 60),
    );
    const response = await POST(createRequest(body));
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(await response.json()).not.toHaveProperty("ingredients");
  });
});
