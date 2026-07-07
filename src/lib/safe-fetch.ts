// ---------------------------------------------------------------------------
// SSRF-safe fetching — shared by every server route that fetches a
// user-supplied URL (recipe scraping, image persistence).
//
// Controls: DNS pre-resolution against an IP blocklist, manual redirect
// handling with per-hop re-validation, standard-ports-only, and streamed
// body reads with a hard byte cap.
// ---------------------------------------------------------------------------

import dns from "node:dns/promises";

const MAX_REDIRECTS = 5;

/** Regex patterns matching private / reserved IPv4 ranges. */
const BLOCKED_IPV4_PATTERNS = [
  /^0\.\d+\.\d+\.\d+$/, // 0.0.0.0/8
  /^127\.\d+\.\d+\.\d+$/, // 127.0.0.0/8
  /^10\.\d+\.\d+\.\d+$/, // 10.0.0.0/8
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/, // 172.16.0.0/12
  /^192\.168\.\d+\.\d+$/, // 192.168.0.0/16
  /^169\.254\.\d+\.\d+$/, // 169.254.0.0/16
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+$/, // 100.64.0.0/10 — CGNAT (RFC 6598), used by cloud providers for internal endpoints
  /^192\.0\.2\.\d+$/,     // 192.0.2.0/24 — TEST-NET-1 (RFC 5737)
  /^198\.51\.100\.\d+$/,  // 198.51.100.0/24 — TEST-NET-2 (RFC 5737)
  /^203\.0\.113\.\d+$/,   // 203.0.113.0/24 — TEST-NET-3 (RFC 5737)
  /^198\.1[89]\.\d+\.\d+$/,  // 198.18.0.0/15 — Benchmark testing (RFC 2544)
  /^(24\d|25[0-5])\.\d+\.\d+\.\d+$/, // 240.0.0.0/4 — Reserved (RFC 1112)
];

/** Sentinel error so callers can distinguish SSRF blocks from other failures. */
export class SSRFError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SSRFError";
  }
}

export class PayloadTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`Response too large (max ${Math.round(maxBytes / (1024 * 1024))} MB).`);
    this.name = "PayloadTooLargeError";
  }
}

/** Check whether a single IP address falls in a blocked range. */
export function isBlockedIP(ip: string): boolean {
  // Strip IPv4-mapped IPv6 prefix (e.g. ::ffff:127.0.0.1 → 127.0.0.1)
  const normalized = ip.replace(/^::ffff:/i, "");

  // Check IPv4 blocked ranges
  for (const pattern of BLOCKED_IPV4_PATTERNS) {
    if (pattern.test(normalized)) return true;
  }

  // IPv6 loopback
  if (normalized === "::1" || ip === "::1") return true;

  // IPv6 private ranges: fc00::/7 (unique local) and fe80::/10 (link-local)
  if (
    /^fc/i.test(ip) ||
    /^fd/i.test(ip) ||
    /^fe[89abcdef]/i.test(ip)
  ) {
    return true;
  }

  return false;
}

/**
 * Resolve a hostname via DNS and validate that none of the resolved IPs
 * fall in a blocked range. Throws a user-facing message on failure.
 */
export async function resolveAndValidateHost(hostname: string): Promise<void> {
  // Collect all resolved addresses (IPv4 + IPv6).
  const addresses: string[] = [];

  try {
    const ipv4 = await dns.resolve4(hostname);
    addresses.push(...ipv4);
  } catch {
    // No A records — not necessarily an error, could be IPv6-only.
  }

  try {
    const ipv6 = await dns.resolve6(hostname);
    addresses.push(...ipv6);
  } catch {
    // No AAAA records.
  }

  if (addresses.length === 0) {
    throw new SSRFError("Could not resolve hostname.");
  }

  for (const ip of addresses) {
    if (isBlockedIP(ip)) {
      throw new SSRFError(
        "Invalid URL. Requests to private addresses are not allowed."
      );
    }
  }
}

/**
 * Fetch a URL with manual redirect handling. Each redirect target is
 * re-validated through DNS resolution + IP blocklist before following.
 */
export async function safeFetch(
  initialUrl: URL,
  signal: AbortSignal,
  accept = "text/html,application/xhtml+xml"
): Promise<Response> {
  let currentUrl = initialUrl;

  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    await resolveAndValidateHost(currentUrl.hostname);

    const response = await fetch(currentUrl.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; CookSnap/1.0; +https://cooksnap.app)",
        Accept: accept,
      },
      redirect: "manual",
      signal,
    });

    // Not a redirect — return the final response.
    if (
      response.status < 300 ||
      response.status >= 400 ||
      !response.headers.get("location")
    ) {
      return response;
    }

    // Parse the redirect target.
    const location = response.headers.get("location")!;
    let nextUrl: URL;
    try {
      nextUrl = new URL(location, currentUrl);
    } catch {
      throw new SSRFError("Redirect contained an invalid URL.");
    }

    if (!["http:", "https:"].includes(nextUrl.protocol)) {
      throw new SSRFError("Redirect to a non-HTTP protocol is not allowed.");
    }

    if (nextUrl.port && !["80", "443", ""].includes(nextUrl.port)) {
      throw new SSRFError("Only standard HTTP ports (80, 443) are allowed.");
    }

    currentUrl = nextUrl;
  }

  throw new SSRFError("Too many redirects.");
}

/**
 * Read a response body as raw bytes, enforcing a maximum byte size.
 * Checks Content-Length first, then streams with a hard cap.
 */
export async function readBytesWithLimit(
  response: Response,
  maxBytes: number
): Promise<Uint8Array> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > maxBytes) {
    throw new PayloadTooLargeError(maxBytes);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    return new Uint8Array(0);
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      reader.cancel();
      throw new PayloadTooLargeError(maxBytes);
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

/** Read a response body as text, enforcing a maximum byte size. */
export async function readBodyWithLimit(
  response: Response,
  maxBytes: number
): Promise<string> {
  return new TextDecoder().decode(await readBytesWithLimit(response, maxBytes));
}
