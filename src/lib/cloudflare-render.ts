/**
 * Cloudflare Browser Rendering fallback for client-side rendered recipe sites.
 *
 * Uses Cloudflare's Browser Rendering API to render JavaScript-heavy pages
 * before parsing. Only called when the fast HTML parse returns null.
 *
 * Free tier: 10 min/day. Requires CLOUDFLARE_ACCOUNT_ID and
 * CLOUDFLARE_BR_API_TOKEN environment variables.
 */

const CF_RENDER_TIMEOUT_MS = 45_000;

/**
 * Fetch fully-rendered HTML from a URL using Cloudflare Browser Rendering.
 * Returns the rendered HTML string, or null if env vars are missing or the
 * call fails. Never throws — errors are logged and swallowed so the main
 * scrape flow continues gracefully.
 */
export async function fetchRenderedHtml(
  url: string
): Promise<string | null> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_BR_API_TOKEN;

  if (!accountId || !apiToken) {
    return null;
  }

  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/content`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
          rejectResourceTypes: ["image", "stylesheet"],
          gotoOptions: {
            waitUntil: "networkidle2",
          },
        }),
        signal: AbortSignal.timeout(CF_RENDER_TIMEOUT_MS),
      }
    );

    if (!response.ok) {
      console.error(
        `Cloudflare Browser Rendering failed: ${response.status} ${response.statusText}`
      );
      return null;
    }

    const body = await response.json() as { success: boolean; result: string };
    return body.result ?? null;
  } catch (error) {
    console.error("Cloudflare Browser Rendering error:", error);
    return null;
  }
}
