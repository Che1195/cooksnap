// @vitest-environment node
/** Explicit opt-in: consumes one Cloudflare browser session. No public fixture hosting. */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { fetchRenderedHtml } from "./cloudflare-render";

const visits = vi.hoisted(() => [] as string[]);

vi.mock("./recipe-capture-fetch", async (importOriginal) => {
  const original = await importOriginal<typeof import("./recipe-capture-fetch")>();
  return { pinnedRecipeFetch: async (...args: Parameters<typeof original.pinnedRecipeFetch>) => {
    const url = args[0];
    visits.push(url.href);
    if (url.hostname === "cooksnap-fixture.invalid") {
      if (url.pathname === "/recipe") return new Response(`<!doctype html><html><body><main id="recipe">Loading</main><script src="/app.js"></script></body></html>`, { headers: { "content-type": "text/html" } });
      if (url.pathname === "/app.js") return new Response(`
        (async () => {
          const data = await fetch('/public-redirect').then(r => r.json());
          document.querySelector('#recipe').textContent = data.title;
          for (const [name, url] of [['redirect','/redirect'], ['subresource','http://127.0.0.1/blocked']]) {
            try { await fetch(url); document.body.dataset[name] = 'unexpected'; }
            catch { document.body.dataset[name] = 'blocked'; }
          }
          document.body.dataset.rtc = String(typeof RTCPeerConnection);
          document.body.dataset.worker = String(typeof Worker);
          const frame = document.createElement('iframe');
          document.body.appendChild(frame);
          try { document.body.dataset.frameRtc = typeof frame.contentWindow.RTCPeerConnection; }
          catch { document.body.dataset.frameRtc = 'inaccessible'; }
          frame.remove();
        })();`, { headers: { "content-type": "text/javascript" } });
      if (url.pathname === "/public-redirect") return new Response(null, { status: 302, headers: { location: "/data" } });
      if (url.pathname === "/data") return Response.json({ title: "Rendered lentil soup" });
      if (url.pathname === "/redirect") return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/blocked" } });
      throw new Error("Unexpected fixture request");
    }
    // Private literal requests reach the real validating transport. It rejects
    // before opening a socket. We never request a provider's private services.
    return original.pinnedRecipeFetch(...args);
  } };
});

describe.skipIf(process.env.RUN_RENDERER_LIVE !== "1")("live guarded renderer", () => {
  it("executes external JS and fetch while blocking private redirects and subresources", async () => {
    const allowed = new Set(["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_BR_API_TOKEN"]);
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const index = line.indexOf("=");
      const name = line.slice(0, index);
      if (allowed.has(name)) process.env[name] = line.slice(index + 1).replace(/^["']|["']$/g, "");
    }
    const html = await fetchRenderedHtml("https://cooksnap-fixture.invalid/recipe");
    expect(visits).toContain("https://cooksnap-fixture.invalid/data");
    expect(visits.filter(url => url === "http://127.0.0.1/blocked")).toHaveLength(2);
    expect(html).toContain("Rendered lentil soup");
    expect(html).toContain('data-redirect="blocked"');
    expect(html).toContain('data-subresource="blocked"');
    expect(html).toContain('data-rtc="undefined"');
    expect(html).toContain('data-worker="undefined"');
    expect(html).not.toContain('data-frame-rtc="function"');
  }, 35_000);
});
