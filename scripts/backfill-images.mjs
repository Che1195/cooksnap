/**
 * One-off/repair: copy externally-hosted recipe images into the
 * recipe-images storage bucket. The /api/persist-image route only fires on
 * new saves, so recipes created before it shipped still hot-link origin
 * CDNs and rot when those sites reorganize.
 *
 * Usage:
 *   node scripts/backfill-images.mjs            # dry run — prints the plan
 *   node scripts/backfill-images.mjs --apply    # actually migrate
 *
 * Reads SUPABASE url + service role key from .env.local. Applies the same
 * SSRF and size discipline as src/lib/safe-fetch.ts (private-range DNS
 * blocklist, 5 MB cap, image content types only). Recipes whose image fails
 * to fetch keep their original URL.
 */

import { readFileSync } from "node:fs";
import dns from "node:dns/promises";

const APPLY = process.argv.includes("--apply");
// Operator-run script: the API route's 5 MB DoS cap doesn't apply the same
// way here, but keep a sane ceiling. Override with --max-mb=N.
const maxMbArg = process.argv.find((a) => a.startsWith("--max-mb="));
const MAX_IMAGE_BYTES = (maxMbArg ? parseInt(maxMbArg.slice(9), 10) : 5) * 1024 * 1024;
const BUCKET = "recipe-images";
const IMAGE_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

// --- env -------------------------------------------------------------------
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!BASE || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}` };

// --- SSRF guard (mirrors src/lib/safe-fetch.ts) ------------------------------
const BLOCKED_IPV4 = [
  /^0\./, /^127\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./,
  /^169\.254\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, /^192\.0\.2\./,
  /^198\.51\.100\./, /^203\.0\.113\./, /^198\.1[89]\./, /^(24\d|25[0-5])\./,
];
function isBlockedIP(ip) {
  const v4 = ip.replace(/^::ffff:/i, "");
  if (BLOCKED_IPV4.some((p) => p.test(v4))) return true;
  return v4 === "::1" || ip === "::1" || /^f[cd]/i.test(ip) || /^fe[89abcdef]/i.test(ip);
}
async function assertSafeHost(hostname) {
  const addrs = [];
  try { addrs.push(...(await dns.resolve4(hostname))); } catch {}
  try { addrs.push(...(await dns.resolve6(hostname))); } catch {}
  if (addrs.length === 0) throw new Error("unresolvable host");
  if (addrs.some(isBlockedIP)) throw new Error("blocked host");
}

// --- helpers -----------------------------------------------------------------
async function fetchImage(imageUrl) {
  const url = new URL(imageUrl);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("bad protocol");
  if (url.port && !["80", "443", ""].includes(url.port)) throw new Error("bad port");
  await assertSafeHost(url.hostname);

  let res = await fetch(imageUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; CookSnap/1.0; +https://cooksnap.app)", Accept: "image/*" },
    signal: AbortSignal.timeout(15_000),
  });
  // Some CDNs 403 non-browser agents — retry once looking like a browser
  if (res.status === 403) {
    res = await fetch(imageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/png,image/jpeg,*/*;q=0.8",
        Referer: url.origin + "/",
      },
      signal: AbortSignal.timeout(15_000),
    });
  }
  if (!res.ok) throw new Error(`fetch ${res.status}`);

  const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const ext = IMAGE_EXTENSIONS[contentType];
  if (!ext) throw new Error(`not an image (${contentType || "no content-type"})`);

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength === 0) throw new Error("empty body");
  if (buf.byteLength > MAX_IMAGE_BYTES) throw new Error("too large");
  return { buf, contentType, ext };
}

async function uploadImage(path, buf, contentType) {
  const res = await fetch(`${BASE}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: { ...HEADERS, "Content-Type": contentType, "x-upsert": "true" },
    body: buf,
  });
  if (!res.ok) throw new Error(`upload ${res.status}: ${(await res.text()).slice(0, 120)}`);
  return `${BASE}/storage/v1/object/public/${BUCKET}/${path}`;
}

async function updateRecipeImage(id, publicUrl) {
  const res = await fetch(`${BASE}/rest/v1/recipes?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...HEADERS, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ image: publicUrl }),
  });
  if (!res.ok) throw new Error(`row update ${res.status}`);
}

// --- main --------------------------------------------------------------------
const res = await fetch(
  `${BASE}/rest/v1/recipes?select=id,user_id,title,image&image=not.is.null&order=created_at.asc`,
  { headers: HEADERS }
);
if (!res.ok) { console.error(`recipe list failed: ${res.status}`); process.exit(1); }
const recipes = await res.json();

// "Durable" means OUR bucket — other sites host images on Supabase too, so
// match the full project URL, not just the storage path.
const candidates = recipes.filter(
  (r) =>
    typeof r.image === "string" &&
    /^https?:\/\//.test(r.image) &&
    !r.image.startsWith(`${BASE}/storage/v1/object/public/${BUCKET}/`)
);

console.log(`${recipes.length} recipes with images; ${candidates.length} externally hosted`);
if (!APPLY) {
  for (const r of candidates) console.log(`  would migrate: ${r.title} ← ${new URL(r.image).hostname}`);
  console.log(candidates.length ? "\nDry run only. Re-run with --apply to migrate." : "\nNothing to do.");
  process.exit(0);
}

let ok = 0, failed = 0;
for (const r of candidates) {
  try {
    const { buf, contentType, ext } = await fetchImage(r.image);
    const publicUrl = await uploadImage(`${r.user_id}/${r.id}.${ext}`, buf, contentType);
    await updateRecipeImage(r.id, publicUrl);
    ok++;
    console.log(`  migrated: ${r.title} (${Math.round(buf.byteLength / 1024)} KB)`);
  } catch (e) {
    failed++;
    console.log(`  FAILED (kept original URL): ${r.title} — ${e.message}`);
  }
}
console.log(`\nDone: ${ok} migrated, ${failed} failed, ${recipes.length - candidates.length} already durable.`);
