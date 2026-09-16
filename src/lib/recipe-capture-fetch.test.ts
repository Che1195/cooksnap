// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import dns from "node:dns/promises";
import https from "node:https";
import { Readable } from "node:stream";
import { EventEmitter } from "node:events";
import type { IncomingMessage, RequestOptions } from "node:http";
import { pinnedRecipeFetch } from "./recipe-capture-fetch";
vi.mock("node:dns/promises", () => ({ default: { lookup: vi.fn() } }));
vi.mock("node:https", () => ({ default: { request: vi.fn() } }));
beforeEach(() => {
  vi.resetAllMocks();
});
describe("pinned recipe transport", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "224.0.0.1",
    "::1",
    "::ffff:7f00:1",
    "fe80::1",
    "2001:db8::1",
  ])("blocks reserved address %s before connection", async (address) => {
    vi.mocked(dns.lookup).mockResolvedValue([
      { address, family: address.includes(":") ? 6 : 4 },
    ] as never);
    await expect(
      pinnedRecipeFetch(
        new URL("https://example.com"),
        AbortSignal.timeout(2000),
      ),
    ).rejects.toThrow("private");
    expect(https.request).not.toHaveBeenCalled();
  });
  it("pins the validated address while retaining hostname for TLS", async () => {
    vi.mocked(dns.lookup).mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ] as never);
    const transport = vi.mocked(https.request);
    transport.mockImplementation(((
      url: URL,
      options: RequestOptions,
      callback: (response: IncomingMessage) => void,
    ) => {
      expect(url.hostname).toBe("example.com");
      expect(options.family).toBe(4);
      const lookupCallback = vi.fn();
      options.lookup?.("example.com", {}, lookupCallback);
      expect(lookupCallback).toHaveBeenCalledWith(null, "93.184.216.34", 4);
      const allCallback = vi.fn();
      options.lookup?.("example.com", { all: true }, allCallback);
      expect(allCallback).toHaveBeenCalledWith(null, [
        { address: "93.184.216.34", family: 4 },
      ]);
      const request = new EventEmitter();
      return Object.assign(request, {
        end: () => {
          const incoming = Object.assign(
            Readable.from([Buffer.from("recipe")]),
            {
              statusCode: 200,
              headers: { "content-type": "text/html" },
            },
          );
          callback(incoming as IncomingMessage);
        },
      });
    }) as typeof https.request);
    expect(
      await (
        await pinnedRecipeFetch(
          new URL("https://example.com"),
          AbortSignal.timeout(2000),
        )
      ).text(),
    ).toBe("recipe");
    expect(dns.lookup).toHaveBeenCalledOnce();
  });
  it.each(["follow", "manual"] as const)("handles a private redirect in %s mode", async (redirect) => {
    vi.mocked(dns.lookup)
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }] as never)
      .mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }] as never);
    vi.mocked(https.request).mockImplementation(((
      _url: URL, _options: RequestOptions, callback: (response: IncomingMessage) => void,
    ) => Object.assign(new EventEmitter(), {
      end: () => callback(Object.assign(Readable.from([]), {
        statusCode: 302, headers: { location: "https://internal.invalid/secret" },
      }) as IncomingMessage),
    })) as typeof https.request);
    const result = pinnedRecipeFetch(new URL("https://example.com"), AbortSignal.timeout(2000), { redirect });
    if (redirect === "manual") {
      const response = await result;
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("https://internal.invalid/secret");
      await response.body?.cancel();
      expect(dns.lookup).toHaveBeenCalledTimes(1);
    } else {
      await expect(result).rejects.toThrow("private");
      expect(dns.lookup).toHaveBeenCalledTimes(2);
    }
    expect(https.request).toHaveBeenCalledTimes(1);
  });
  it("rejects an invalid origin status without throwing outside the request promise", async () => {
    vi.mocked(dns.lookup).mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
    const incoming = Object.assign(Readable.from([]), { statusCode: 600, headers: {} });
    const destroy = vi.spyOn(incoming, "destroy");
    vi.mocked(https.request).mockImplementation(((
      _url: URL, _options: RequestOptions, callback: (response: IncomingMessage) => void,
    ) => Object.assign(new EventEmitter(), {
      end: () => queueMicrotask(() => callback(incoming as IncomingMessage)),
    })) as typeof https.request);
    await expect(pinnedRecipeFetch(new URL("https://example.com"), AbortSignal.timeout(2000))).rejects.toThrow();
    expect(destroy).toHaveBeenCalled();
  });
  it("aborts during DNS rather than waiting for an unbounded resolver", async () => {
    vi.mocked(dns.lookup).mockReturnValue(new Promise(() => {}));
    const controller = new AbortController();
    const pending = pinnedRecipeFetch(
      new URL("https://example.com"),
      controller.signal,
    );
    controller.abort(new Error("deadline"));
    await expect(pending).rejects.toThrow("deadline");
  });
});
