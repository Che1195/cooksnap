import dns from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import { Readable } from "node:stream";
import { isBlockedIP, SSRFError } from "./safe-fetch";

function publicAddress(address: string) {
  if (isBlockedIP(address)) return false;
  // IPv6 permits only global unicast; reject mapped and translation ranges.
  if (isIP(address) === 6)
    return (
      /^[23][0-9a-f]{3}:/i.test(address) && !/^2001:(?:db8|0):/i.test(address)
    );
  return (
    isIP(address) === 4 &&
    !/^(?:192\.0\.0\.|192\.88\.99\.|22[4-9]\.|23\d\.)/.test(address)
  );
}
export async function pinnedRecipeFetch(
  initial: URL,
  signal: AbortSignal,
  options: { redirect?: "follow" | "manual" } = {},
): Promise<Response> {
  let url = initial;
  for (let hop = 0; hop <= 5; hop++) {
    signal.throwIfAborted();
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      (url.port && !["80", "443"].includes(url.port))
    )
      throw new SSRFError(
        "Only public HTTP URLs on standard ports are allowed.",
      );
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    const addresses = await new Promise<LookupAddress[]>((resolve, reject) => {
      const aborted = () => reject(signal.reason);
      signal.addEventListener("abort", aborted, { once: true });
      dns
        .lookup(hostname, { all: true })
        .then(resolve, reject)
        .finally(() => signal.removeEventListener("abort", aborted));
    });
    const records = Array.isArray(addresses) ? addresses : [addresses];
    if (
      !records.length ||
      records.some((record) => !publicAddress(record.address))
    )
      throw new SSRFError(
        "Invalid URL. Requests to private addresses are not allowed.",
      );
    const address = records[0];
    const response = await new Promise<Response>((resolve, reject) => {
      const transport = url.protocol === "https:" ? https : http;
      const request = transport.request(
        url,
        {
          signal,
          family: address.family,
          // Resolve exactly once. TLS servername and Host retain the original URL.
          lookup: (_host, options, callback) => {
            if (options.all) callback(null, [address]);
            else callback(null, address.address, address.family);
          },
          headers: {
            Accept: "text/html,application/xhtml+xml",
            "User-Agent": "CookSnap/1.0",
            "Accept-Encoding": "identity",
          },
        },
        (incoming) => {
          try {
            const headers = new Headers();
            for (const [name, value] of Object.entries(incoming.headers))
              if (value)
                headers.set(
                  name,
                  Array.isArray(value) ? value.join(", ") : value,
                );
            const body = Readable.toWeb(incoming) as ReadableStream<Uint8Array>;
            resolve(
              new Response(
                [204, 205, 304].includes(incoming.statusCode ?? 200)
                  ? null
                  : body,
                { status: incoming.statusCode, headers },
              ),
            );
          } catch (error) {
            // The callback runs after the Promise executor. Convert malformed
            // origin responses into rejections rather than uncaught exceptions.
            incoming.destroy();
            reject(error);
          }
        },
      );
      request.once("error", reject);
      request.end();
    });
    if (
      options.redirect === "manual" ||
      response.status < 300 ||
      response.status >= 400 ||
      !response.headers.has("location")
    )
      return response;
    await response.body?.cancel();
    url = new URL(response.headers.get("location")!, url);
  }
  throw new SSRFError("Too many redirects.");
}
