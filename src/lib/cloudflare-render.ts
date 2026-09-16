/**
 * Render in a Cloudflare session with deny-all HTTP(S) egress guardrails.
 * Every permitted resource is fulfilled through our DNS-pinned transport.
 * The session policy is verified before any untrusted script executes.
 * https://developers.cloudflare.com/browser-run/features/guardrails/
 */
import { chromium, type Browser } from "playwright-core";
import { pinnedRecipeFetch } from "./recipe-capture-fetch";
import { readBytesWithLimit } from "./safe-fetch";

const TIMEOUT_MS = 15_000;
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 15 * 1024 * 1024;
const MAX_REQUESTS = 50;
const POLICY_PROBE = "https://cooksnap-renderer-policy.invalid/";
const CSP = "worker-src 'none'; frame-src 'none'; child-src 'none'; object-src 'none'; media-src 'none'; form-action 'none'";
let warnedMissingEnv = false;

interface RenderRoute {
  request(): { url(): string; method(): string; resourceType(): string; frame(): unknown };
  abort(): Promise<void>;
  fulfill(response: { status: number; headers: Record<string, string>; body: Buffer }): Promise<void>;
}

export async function fetchRenderedHtml(
  url: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_BR_API_TOKEN;
  if (!accountId || !apiToken) {
    if (!warnedMissingEnv) {
      warnedMissingEnv = true;
      console.warn("Cloudflare rendering credentials are missing.");
    }
    return null;
  }
  const deadline = AbortSignal.any([
    AbortSignal.timeout(TIMEOUT_MS),
    ...(signal ? [signal] : []),
  ]);
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/browser-rendering/devtools/browser`;
  const headers = { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" };
  let sessionId: string | undefined;
  let browser: Browser | undefined;
  let stage = "session";
  let closePromise: Promise<void> | undefined;
  const closeBrowser = () => {
    if (browser) closePromise ??= browser.close().catch(() => {});
    return closePromise ?? Promise.resolve();
  };
  const closeOnAbort = () => { void closeBrowser(); };
  try {
    deadline.throwIfAborted();
    const sessionResponse = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ guardrails: { allowedDomains: [] } }),
      redirect: "error",
      signal: deadline,
    });
    if (!sessionResponse.ok) return null;
    const session: unknown = JSON.parse(new TextDecoder().decode(await readBytesWithLimit(sessionResponse, 64 * 1024)));
    if (!session || typeof session !== "object" || !("sessionId" in session) || typeof session.sessionId !== "string") return null;
    sessionId = session.sessionId;
    // Construct the endpoint ourselves: never forward credentials to a returned URL.
    stage = "connect";
    browser = await chromium.connectOverCDP(`${endpoint.replace(/^https:/, "wss:")}/${encodeURIComponent(sessionId)}`, {
      headers: { Authorization: headers.Authorization },
      timeout: TIMEOUT_MS,
    });
    deadline.addEventListener("abort", closeOnAbort, { once: true });
    deadline.throwIfAborted();
    stage = "context";
    const context = await browser.newContext({ serviceWorkers: "block", acceptDownloads: false });
    const page = await context.newPage();
    page.setDefaultTimeout(TIMEOUT_MS);
    // Fail closed if the provider ignores or stops enforcing the session policy.
    stage = "policy";
    const probe = await page.goto(POLICY_PROBE, { waitUntil: "domcontentloaded" });
    const probeHeaders = await probe?.allHeaders();
    if (probe?.status() !== 403 || probeHeaders?.["cf-mitigated"] !== "guardrails" || probeHeaders["cf-brapi-guardrails-reason"] !== "not-in-allowlist") return null;

    await context.routeWebSocket("**/*", socket => socket.close());
    // These channels are not needed for recipe content. Guardrails document
    // HTTP(S); remove non-HTTP transports before page scripts execute too.
    await context.addInitScript(() => {
      for (const name of ["RTCPeerConnection", "webkitRTCPeerConnection", "WebTransport", "Worker", "SharedWorker"]) {
        Object.defineProperty(globalThis, name, { value: undefined, configurable: false, writable: false });
      }
    });
    context.on("page", popup => { if (popup !== page) void popup.close().catch(() => {}); });
    let requests = 0;
    let totalBytes = 0;
    const readResource = async (response: Response) => {
      const reader = response.body?.getReader();
      if (!reader) return Buffer.alloc(0);
      const chunks: Uint8Array[] = [];
      let resourceBytes = 0;
      try {
        while (true) {
          deadline.throwIfAborted();
          const { done, value } = await reader.read();
          if (done) return Buffer.concat(chunks);
          resourceBytes += value.byteLength;
          totalBytes += value.byteLength;
          if (resourceBytes > MAX_BYTES || totalBytes > MAX_TOTAL_BYTES) {
            throw new Error("Renderer resource byte budget exceeded");
          }
          chunks.push(value);
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
    };
    const fulfill = async (route: RenderRoute) => {
      const request = route.request();
      if (++requests > MAX_REQUESTS || request.method() !== "GET" || !["document", "script", "xhr", "fetch", "stylesheet"].includes(request.resourceType()) || request.frame() !== page.mainFrame()) {
        await route.abort();
        return;
      }
      if (totalBytes >= MAX_TOTAL_BYTES) {
        await route.abort();
        return;
      }
      try {
        const response = await pinnedRecipeFetch(new URL(request.url()), deadline, { redirect: "manual" });
        const bytes = await readResource(response);
        await route.fulfill({
          status: response.status,
          headers: {
            "content-type": response.headers.get("content-type") ?? "application/octet-stream",
            ...(response.headers.has("location") ? { location: response.headers.get("location")! } : {}),
            "content-security-policy": CSP,
            "access-control-allow-origin": "*",
          },
          body: Buffer.from(bytes),
        });
      } catch {
        await route.abort().catch(() => {});
      }
    };
    // Playwright route() skips subsequent redirect URLs. CDP Fetch pauses
    // every hop, so redirected destinations receive the same DNS validation.
    const cdp = await context.newCDPSession(page);
    const { frameTree } = await cdp.send("Page.getFrameTree");
    cdp.on("Fetch.requestPaused", event => {
      const request = event.request;
      void fulfill({
        request: () => ({
          url: () => request.url,
          method: () => request.method,
          resourceType: () => event.resourceType.toLowerCase(),
          frame: () => event.frameId === frameTree.frame.id ? page.mainFrame() : undefined,
        }),
        abort: async () => { await cdp.send("Fetch.failRequest", { requestId: event.requestId, errorReason: "BlockedByClient" }); },
        fulfill: async response => {
          await cdp.send("Fetch.fulfillRequest", {
            requestId: event.requestId,
            responseCode: response.status,
            responseHeaders: Object.entries(response.headers).map(([name, value]) => ({ name, value })),
            body: response.body.toString("base64"),
          });
        },
      }).catch(() => {});
    });
    await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
    stage = "render";
    await page.goto(url, { waitUntil: "networkidle" });
    const html = await page.content();
    return Buffer.byteLength(html, "utf8") <= MAX_BYTES ? html : null;
  } catch {
    // CDP errors may contain authenticated connection details; never log them.
    console.error(`Cloudflare rendering failed or timed out (${stage}).`);
    return null;
  } finally {
    deadline.removeEventListener("abort", closeOnAbort);
    // DELETE runs independently, even when the CDP socket stops responding.
    let closeTimer: ReturnType<typeof setTimeout> | undefined;
    const boundedClose = Promise.race([
      closeBrowser(),
      new Promise<void>(resolve => { closeTimer = setTimeout(resolve, 3_000); }),
    ]).finally(() => { clearTimeout(closeTimer); });
    const deleteSession = sessionId
      ? fetch(`${endpoint}/${encodeURIComponent(sessionId)}`, {
          method: "DELETE", headers, redirect: "error", signal: AbortSignal.timeout(5_000),
        }).then(() => {}, () => {})
      : Promise.resolve();
    await Promise.all([boundedClose, deleteSession]);
  }
}
