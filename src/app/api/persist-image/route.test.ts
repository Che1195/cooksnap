/**
 * Tests for the image persistence route (POST /api/persist-image).
 * Copies a scraped recipe image into Convex storage so the recipe book
 * doesn't rot when origin sites reorganize their CDNs.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("convex/nextjs", () => ({ fetchMutation: vi.fn() }));
vi.mock("@/lib/convex/server", () => ({ getConvexToken: vi.fn() }));

vi.mock("node:dns/promises", () => ({
  default: {
    resolve4: vi.fn().mockResolvedValue(["93.184.216.34"]),
    resolve6: vi.fn().mockRejectedValue(new Error("No AAAA")),
  },
}));

import { NextRequest } from "next/server";
import { POST } from "./route";
import { fetchMutation } from "convex/nextjs";
import { ConvexError } from "convex/values";
import { api } from "@convex/_generated/api";
import { getConvexToken } from "@/lib/convex/server";

const uploadUrl = "https://project.convex.cloud/upload";
const imageUrl = "https://project.convex.cloud/api/storage/storage-1";
const dataUri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/persist-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchMutation).mockReset();
  vi.mocked(getConvexToken).mockResolvedValue("tok");
  vi.mocked(fetchMutation).mockResolvedValueOnce(uploadUrl).mockResolvedValue(imageUrl);
});

describe("POST /api/persist-image", () => {
  it("returns 401 for unauthenticated requests", async () => {
    vi.mocked(getConvexToken).mockResolvedValue(null);
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), {
        headers: { "Content-Type": "image/jpeg" },
      })
    );

    const res = await POST(createRequest({ recipeId: "recipe-1", imageUrl: "https://example.com/a.jpg" }));
    expect(res.status).toBe(401);
    expect(fetchMutation).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("returns 400 when recipeId or imageUrl is missing", async () => {
    expect((await POST(createRequest({ imageUrl: "https://example.com/a.jpg" }))).status).toBe(400);
    expect((await POST(createRequest({ recipeId: "recipe-1" }))).status).toBe(400);
  });

  it("returns 404 when the recipe doesn't belong to the user", async () => {
    vi.mocked(fetchMutation).mockReset()
      .mockResolvedValueOnce(uploadUrl)
      .mockRejectedValueOnce(new ConvexError("Recipe not found"));
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      Response.json({ storageId: "storage-1" })
    );

    const res = await POST(createRequest({ recipeId: "not-mine", imageUrl: dataUri }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Recipe not found" });
    fetchSpy.mockRestore();
  });

  it("blocks image hosts that resolve to private addresses", async () => {
    const dns = (await import("node:dns/promises")).default;
    vi.mocked(dns.resolve4).mockResolvedValueOnce(["10.0.0.1"]);

    const res = await POST(createRequest({ recipeId: "recipe-1", imageUrl: "https://internal.example/a.jpg" }));
    expect(res.status).toBe(400);
    expect(fetchMutation).not.toHaveBeenCalled();
  });

  it("rejects non-image content types", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("<html></html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      })
    );

    const res = await POST(createRequest({ recipeId: "recipe-1", imageUrl: "https://example.com/a.jpg" }));
    expect(res.status).toBe(422);
    expect(fetchMutation).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it("uploads the image and updates the recipe on success", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), {
        status: 200,
        headers: { "Content-Type": "image/jpeg" },
      })
    ).mockResolvedValueOnce(Response.json({ storageId: "storage-1" }));

    const res = await POST(createRequest({ recipeId: "recipe-1", imageUrl: "https://example.com/a.jpg" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.image).toBe(imageUrl);
    expect(fetchMutation).toHaveBeenNthCalledWith(1, api.images.generateUploadUrl, {}, { token: "tok" });
    expect(fetchSpy).toHaveBeenLastCalledWith(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": "image/jpeg" },
      body: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
    });
    expect(fetchMutation).toHaveBeenNthCalledWith(2, api.images.attach,
      { recipeId: "recipe-1", storageId: "storage-1" }, { token: "tok" });

    fetchSpy.mockRestore();
  });

  it("accepts data-URI images without fetching the source", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      Response.json({ storageId: "storage-1" })
    );

    const res = await POST(createRequest({ recipeId: "recipe-1", imageUrl: dataUri }));

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": "image/png" },
      body: expect.any(Uint8Array),
    });

    fetchSpy.mockRestore();
  });

  it("returns 502 when the storage upload fails", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status: 500 }));
    const res = await POST(createRequest({ recipeId: "recipe-1", imageUrl: dataUri }));
    expect(res.status).toBe(502);
    expect(fetchMutation).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });
});
