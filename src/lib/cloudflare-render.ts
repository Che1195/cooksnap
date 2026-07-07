/**
 * Cloudflare Browser Rendering fallback for client-side rendered recipe sites.
 *
 * Uses Cloudflare's Browser Rendering API to render JavaScript-heavy pages
 * before parsing. Only called when the fast HTML parse returns null.
 *
 * Free tier: 10 min/day. Requires CLOUDFLARE_ACCOUNT_ID and
 * CLOUDFLARE_BR_API_TOKEN environment variables. The caller (scrape route)
 * is responsible for SSRF validation of the URL and for rate/budget limits;
 * this module enforces response-shape validation and a size cap so a hostile
 * page cannot OOM the serverless function via an inflated rendered DOM.
 */

const CF_RENDER_TIMEOUT_MS = 45_000;

/** Cap on the rendered HTML itself — matches the scrape route's 5 MB cap (M1). */
const MAX_RENDERED_BYTES = 5 * 1024 * 1024;

/** Cap on the raw API response; the JSON envelope escapes the HTML, so allow headroom. */
const MAX_API_RESPONSE_BYTES = MAX_RENDERED_BYTES * 2;

let warnedMissingEnv = false;

/**
 * Read a response body as text with a hard byte cap.
 * Returns null when the cap is exceeded.
 */
async function readTextWithLimit(
  response: Response,
  maxBytes: number
): Promise<string | null> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > maxBytes) {
    return null;
  }

  const reader = response.body?.getReader();
  if (!reader) return "";

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

   
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const decoder = new TextDecoder();
  return (
    chunks.map((c) => decoder.decode(c, { stream: true })).join("") +
    decoder.decode()
  );
}

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
    // Warn once per process so a renamed/missing var doesn't silently disable
    // the SPA-rendering feature in production.
    if (!warnedMissingEnv) {
      warnedMissingEnv = true;
      console.warn(
        "Cloudflare Browser Rendering disabled: CLOUDFLARE_ACCOUNT_ID and/or CLOUDFLARE_BR_API_TOKEN not set. SPA recipe sites will fail to scrape."
      );
    }
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

    const raw = await readTextWithLimit(response, MAX_API_RESPONSE_BYTES);
    if (raw === null) {
      console.error("Cloudflare Browser Rendering response exceeded size cap");
      return null;
    }

    const body = JSON.parse(raw) as { success?: unknown; result?: unknown };
    if (body?.success !== true || typeof body.result !== "string") {
      console.error(
        "Cloudflare Browser Rendering returned an unexpected response shape"
      );
      return null;
    }

    if (body.result.length > MAX_RENDERED_BYTES) {
      console.error("Cloudflare Browser Rendering rendered HTML exceeded size cap");
      return null;
    }

    return body.result;
  } catch (error) {
    console.error("Cloudflare Browser Rendering error:", error);
    return null;
  }
}
