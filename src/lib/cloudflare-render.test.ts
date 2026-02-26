/**
 * Tests for the Cloudflare Browser Rendering fallback helper.
 *
 * Covers:
 *   - Returns null when env vars are missing
 *   - Returns rendered HTML on successful API response
 *   - Returns null on API error (never throws)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchRenderedHtml } from "./cloudflare-render";

describe("fetchRenderedHtml", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "test-account-id");
    vi.stubEnv("CLOUDFLARE_BR_API_TOKEN", "test-api-token");
    fetchSpy = vi.spyOn(global, "fetch");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fetchSpy.mockRestore();
  });

  it("returns null when CLOUDFLARE_ACCOUNT_ID is missing", async () => {
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "");

    const result = await fetchRenderedHtml("https://example.com");
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns null when CLOUDFLARE_BR_API_TOKEN is missing", async () => {
    vi.stubEnv("CLOUDFLARE_BR_API_TOKEN", "");

    const result = await fetchRenderedHtml("https://example.com");
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns rendered HTML on successful API response", async () => {
    const renderedHtml = "<html><body><h1>Rendered Recipe</h1></body></html>";
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ success: true, result: renderedHtml }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const result = await fetchRenderedHtml("https://spa-site.com/recipe");

    expect(result).toBe(renderedHtml);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/accounts/test-account-id/browser-rendering/content",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-api-token",
        }),
        body: JSON.stringify({
          url: "https://spa-site.com/recipe",
          rejectResourceTypes: ["image", "stylesheet"],
          gotoOptions: { waitUntil: "networkidle2" },
        }),
      })
    );
  });

  it("returns null on non-OK API response", async () => {
    fetchSpy.mockResolvedValue(
      new Response("Unauthorized", { status: 401, statusText: "Unauthorized" })
    );

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await fetchRenderedHtml("https://example.com");

    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Cloudflare Browser Rendering failed")
    );
    consoleSpy.mockRestore();
  });

  it("returns null on network error (never throws)", async () => {
    fetchSpy.mockRejectedValue(new Error("Network failure"));

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await fetchRenderedHtml("https://example.com");

    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(
      "Cloudflare Browser Rendering error:",
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });
});
