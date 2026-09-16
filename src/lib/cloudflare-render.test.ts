import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchRenderedHtml } from "./cloudflare-render";

const mocks = vi.hoisted(() => {
  const frame = {};
  const page = { goto: vi.fn(), setDefaultTimeout: vi.fn(), mainFrame: () => frame, content: vi.fn() };
  const context = { newPage: vi.fn(), routeWebSocket: vi.fn(), addInitScript: vi.fn(), on: vi.fn(), newCDPSession: vi.fn() };
  const browser = { newContext: vi.fn(), close: vi.fn() };
  const cdp = { send: vi.fn(), on: vi.fn() };
  return { page, context, browser, cdp, connect: vi.fn(), pinnedFetch: vi.fn(), frame };
});
vi.mock("playwright-core", () => ({ chromium: { connectOverCDP: mocks.connect } }));
vi.mock("./recipe-capture-fetch", () => ({ pinnedRecipeFetch: mocks.pinnedFetch }));

describe("guarded rendered HTML", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "account");
    vi.stubEnv("CLOUDFLARE_BR_API_TOKEN", "token");
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (_url: string, init: RequestInit) => new Response(JSON.stringify(init.method === "POST" ? { sessionId: "session" } : {}))));
    mocks.connect.mockResolvedValue(mocks.browser);
    mocks.browser.newContext.mockResolvedValue(mocks.context);
    mocks.browser.close.mockResolvedValue(undefined);
    mocks.context.newPage.mockResolvedValue(mocks.page);
    mocks.context.newCDPSession.mockResolvedValue(mocks.cdp);
    mocks.cdp.send.mockResolvedValue({ frameTree: { frame: { id: "frame" } } });
    mocks.page.goto.mockResolvedValue({ status: () => 403, allHeaders: async () => ({ "cf-mitigated": "guardrails", "cf-brapi-guardrails-reason": "not-in-allowlist" }) });
    mocks.page.content.mockResolvedValue("<html>rendered</html>");
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("requires credentials", async () => {
    vi.stubEnv("CLOUDFLARE_BR_API_TOKEN", "");
    expect(await fetchRenderedHtml("https://example.com")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("renders only after verifying deny-all session policy and cleans up", async () => {
    expect(await fetchRenderedHtml("https://example.com")).toBe("<html>rendered</html>");
    expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ body: JSON.stringify({ guardrails: { allowedDomains: [] } }), redirect: "error" }));
    expect(mocks.browser.newContext).toHaveBeenCalledWith({ serviceWorkers: "block", acceptDownloads: false });
    expect(mocks.context.routeWebSocket).toHaveBeenCalled();
    expect(mocks.browser.close).toHaveBeenCalled();
    expect(fetch).toHaveBeenLastCalledWith(expect.stringContaining("/session"), expect.objectContaining({ method: "DELETE" }));
  });
  it("deletes the session even when CDP close never resolves", async () => {
    vi.useFakeTimers();
    try {
      mocks.browser.close.mockReturnValue(new Promise(() => {}));
      const pending = fetchRenderedHtml("https://example.com");
      await vi.advanceTimersByTimeAsync(1);
      expect(fetch).toHaveBeenLastCalledWith(expect.stringContaining("/session"), expect.objectContaining({ method: "DELETE" }));
      await vi.advanceTimersByTimeAsync(3_000);
      expect(await pending).toBe("<html>rendered</html>");
    } finally {
      vi.useRealTimers();
    }
  });
  it("fails closed when guardrail response is absent", async () => {
    mocks.page.goto.mockResolvedValue({ status: () => 200, allHeaders: async () => ({}) });
    expect(await fetchRenderedHtml("https://example.com")).toBeNull();
    expect(mocks.context.newCDPSession).not.toHaveBeenCalled();
    expect(mocks.page.goto).toHaveBeenCalledTimes(1);
  });
  it("does not trust a returned websocket URL with credentials", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ sessionId: "safe", webSocketDebuggerUrl: "wss://evil.invalid" })));
    await fetchRenderedHtml("https://example.com");
    expect(mocks.connect).toHaveBeenCalledWith("wss://api.cloudflare.com/client/v4/accounts/account/browser-rendering/devtools/browser/safe", expect.any(Object));
  });
  it("caps UTF-8 output bytes", async () => {
    mocks.page.content.mockResolvedValue("🍳".repeat(2 * 1024 * 1024));
    expect(await fetchRenderedHtml("https://example.com")).toBeNull();
  });
  it("does not create a browser for an already aborted request", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await fetchRenderedHtml("https://example.com", AbortSignal.abort())).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    error.mockRestore();
  });
  it("fulfills resources only through the pinned transport and applies CSP", async () => {
    await fetchRenderedHtml("https://example.com");
    mocks.pinnedFetch.mockResolvedValue(new Response("window.recipe = 'ready'", { headers: { "content-type": "text/javascript", "set-cookie": "secret" } }));
    const handler = mocks.cdp.on.mock.calls[0][1] as (event: object) => void;
    handler({ requestId: "resource", frameId: "frame", resourceType: "Script", request: { url: "https://example.com/app.js", method: "GET" } });
    await vi.waitFor(() => expect(mocks.cdp.send).toHaveBeenCalledWith("Fetch.fulfillRequest", expect.objectContaining({ responseHeaders: expect.arrayContaining([{ name: "content-security-policy", value: expect.stringContaining("worker-src 'none'") }]) })));
    expect(mocks.pinnedFetch).toHaveBeenCalledWith(new URL("https://example.com/app.js"), expect.any(AbortSignal), { redirect: "manual" });
    const response = mocks.cdp.send.mock.calls.find(call => call[0] === "Fetch.fulfillRequest")?.[1];
    expect(response.responseHeaders).not.toContainEqual(expect.objectContaining({ name: "set-cookie" }));
  });
  it("aborts rejected destinations and never continues browser networking", async () => {
    await fetchRenderedHtml("https://example.com");
    mocks.pinnedFetch.mockRejectedValue(new Error("private address"));
    const handler = mocks.cdp.on.mock.calls[0][1] as (event: object) => void;
    handler({ requestId: "blocked", frameId: "frame", resourceType: "Fetch", request: { url: "http://127.0.0.1/", method: "GET" } });
    await vi.waitFor(() => expect(mocks.cdp.send).toHaveBeenCalledWith("Fetch.failRequest", { requestId: "blocked", errorReason: "BlockedByClient" }));
    expect(mocks.cdp.send.mock.calls.some(call => call[0] === "Fetch.fulfillRequest")).toBe(false);
  });
});
