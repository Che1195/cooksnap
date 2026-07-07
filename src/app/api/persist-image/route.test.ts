/**
 * Tests for the image persistence route (POST /api/persist-image).
 * Copies a scraped recipe image into Supabase Storage so the recipe book
 * doesn't rot when origin sites reorganize their CDNs.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetUser, mockUpload, mockGetPublicUrl, mockFrom } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockUpload: vi.fn(),
  mockGetPublicUrl: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
    from: mockFrom,
    storage: {
      from: vi.fn(() => ({
        upload: mockUpload,
        getPublicUrl: mockGetPublicUrl,
      })),
    },
  }),
}));

vi.mock("node:dns/promises", () => ({
  default: {
    resolve4: vi.fn().mockResolvedValue(["93.184.216.34"]),
    resolve6: vi.fn().mockRejectedValue(new Error("No AAAA")),
  },
}));

import { POST } from "./route";
import { NextRequest } from "next/server";

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/persist-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Chainable mock for the recipes table ownership check + image update. */
function recipesTableMock(owned: boolean) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = vi.fn(self);
  chain.update = vi.fn(self);
  chain.eq = vi.fn(self);
  chain.maybeSingle = vi.fn().mockResolvedValue({
    data: owned ? { id: "recipe-1" } : null,
    error: null,
  });
  chain.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFrom.mockImplementation(() => recipesTableMock(true));
  mockUpload.mockResolvedValue({ data: { path: "u1/recipe-1.jpg" }, error: null });
  mockGetPublicUrl.mockReturnValue({
    data: { publicUrl: "https://project.supabase.co/storage/v1/object/public/recipe-images/u1/recipe-1.jpg" },
  });
});

describe("POST /api/persist-image", () => {
  it("returns 401 for unauthenticated requests", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const res = await POST(createRequest({ recipeId: "recipe-1", imageUrl: "https://example.com/a.jpg" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when recipeId or imageUrl is missing", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });

    expect((await POST(createRequest({ imageUrl: "https://example.com/a.jpg" }))).status).toBe(400);
    expect((await POST(createRequest({ recipeId: "recipe-1" }))).status).toBe(400);
  });

  it("returns 404 when the recipe doesn't belong to the user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockFrom.mockImplementation(() => recipesTableMock(false));

    const res = await POST(createRequest({ recipeId: "not-mine", imageUrl: "https://example.com/a.jpg" }));
    expect(res.status).toBe(404);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("blocks image hosts that resolve to private addresses", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const dns = (await import("node:dns/promises")).default;
    vi.mocked(dns.resolve4).mockResolvedValueOnce(["10.0.0.1"]);

    const res = await POST(createRequest({ recipeId: "recipe-1", imageUrl: "https://internal.example/a.jpg" }));
    expect(res.status).toBe(400);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("rejects non-image content types", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("<html></html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      })
    );

    const res = await POST(createRequest({ recipeId: "recipe-1", imageUrl: "https://example.com/a.jpg" }));
    expect(res.status).toBe(422);
    expect(mockUpload).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it("uploads the image and updates the recipe on success", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), {
        status: 200,
        headers: { "Content-Type": "image/jpeg" },
      })
    );

    const res = await POST(createRequest({ recipeId: "recipe-1", imageUrl: "https://example.com/a.jpg" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.image).toContain("recipe-images");
    expect(mockUpload).toHaveBeenCalledWith(
      "u1/recipe-1.jpg",
      expect.anything(),
      expect.objectContaining({ contentType: "image/jpeg", upsert: true })
    );

    fetchSpy.mockRestore();
  });

  it("accepts data-URI images without fetching", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const fetchSpy = vi.spyOn(global, "fetch");
    // 1x1 transparent PNG
    const dataUri =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

    const res = await POST(createRequest({ recipeId: "recipe-1", imageUrl: dataUri }));

    expect(res.status).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockUpload).toHaveBeenCalledWith(
      "u1/recipe-1.png",
      expect.anything(),
      expect.objectContaining({ contentType: "image/png", upsert: true })
    );

    fetchSpy.mockRestore();
  });
});
