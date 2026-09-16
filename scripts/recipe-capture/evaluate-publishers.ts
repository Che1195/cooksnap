import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { pinnedRecipeFetch } from "../../src/lib/recipe-capture-fetch";
import { readBodyWithLimit } from "../../src/lib/safe-fetch";
import { selectCaptureSource } from "../../src/lib/recipe-capture-source";
import { interpretCapture } from "../../src/lib/recipe-capture-model";
import { projectRecipe } from "../../src/lib/recipe-interpretation";
import { CAPTURE_IMPORT_DEADLINE_MS, CAPTURE_RESPONSE_MARGIN_MS } from "../../src/lib/recipe-capture-policy";

// Keep full publisher HTML and model answers in an explicitly selected local
// artifact directory. Commit only the manifest and summarized evidence.
const arg = (name: string) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const manifestPath = arg("manifest");
const artifactPath = arg("artifacts");
if (!manifestPath || !artifactPath) throw new Error("Use --manifest=path.json --artifacts=directory [--id=case] [--live]");
const manifest = z.array(z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  url: z.url().refine((url) => new URL(url).protocol === "https:"),
  title: z.string(), coverage: z.string(),
})).min(1).max(20).parse(JSON.parse(readFileSync(manifestPath, "utf8")));
if (new Set(manifest.map((item) => item.id)).size !== manifest.length) throw new Error("Duplicate fixture ID");
const cases = arg("id") ? manifest.filter((item) => item.id === arg("id")) : manifest;
if (!cases.length) throw new Error("Unknown fixture ID");
const live = process.argv.includes("--live");
if (live && !process.env.META_API_KEY) throw new Error("META_API_KEY is missing");
mkdirSync(artifactPath, { recursive: true });

interface Observation { stage: string; status?: number; responseStatus?: string; durationMs: number; inputTokens?: number; outputTokens?: number; errorCode?: string; transportFailure?: boolean; finalAnswer?: string }
const providerEnvelope = z.object({
  status: z.string().optional(),
  usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }).nullable().optional(),
  error: z.object({ code: z.string().optional() }).nullable().optional(),
  output: z.array(z.object({
    type: z.string(), role: z.string().nullable().optional(), phase: z.string().nullable().optional(),
    content: z.array(z.object({ type: z.string(), text: z.string().optional() })).nullable().optional(),
  })).nullable().optional(),
});
let observations: Observation[] = [];
const originalFetch = globalThis.fetch;
if (live) globalThis.fetch = async (input, init) => {
  const stage = String(input).endsWith("/input_tokens") ? "count" : "generation";
  const started = performance.now();
  try {
    const response = await originalFetch(input, init);
    const parsed = providerEnvelope.safeParse(await response.clone().json().catch(() => null));
    const envelope = parsed.success ? parsed.data : undefined;
    observations.push({ stage, status: response.status, responseStatus: envelope?.status, durationMs: Math.round(performance.now() - started),
      inputTokens: envelope?.usage?.input_tokens, outputTokens: envelope?.usage?.output_tokens,
      errorCode: envelope?.error?.code,
      finalAnswer: envelope?.output?.filter((item) => item.type === "message" && item.role === "assistant" && item.phase !== "commentary")
        .flatMap((item) => item.content ?? []).filter((part) => part.type === "output_text").map((part) => part.text ?? "").join("") || undefined,
    });
    return response;
  } catch (error) {
    observations.push({ stage, durationMs: Math.round(performance.now() - started), transportFailure: true });
    throw error;
  }
};

const captureSchema = z.object({ status: z.string(), fetchMs: z.number(), capturedAt: z.string(), sha256: z.string().optional() });
for (const fixture of cases) {
  const base = join(artifactPath, fixture.id);
  const save = (suffix: string, data: unknown) => writeFileSync(`${base}.${suffix}.json`, JSON.stringify(data, null, 2) + "\n");
  if (!live) {
    const started = performance.now();
    try {
      const response = await pinnedRecipeFetch(new URL(fixture.url), AbortSignal.timeout(10_000));
      const fetchMs = () => Math.round(performance.now() - started);
      const common = { ...fixture, capturedAt: new Date().toISOString(), httpStatus: response.status };
      if (!response.ok || !/text\/html|application\/xhtml\+xml/i.test(response.headers.get("content-type") ?? "")) {
        await response.body?.cancel();
        save("capture", { ...common, fetchMs: fetchMs(), status: "source-unavailable" });
        console.log(`${fixture.id}: source HTTP ${response.status}`);
        continue;
      }
      const html = await readBodyWithLimit(response, 5 * 1024 * 1024);
      const elapsed = fetchMs();
      const sha256 = createHash("sha256").update(html).digest("hex");
      writeFileSync(`${base}.html`, html);
      const source = selectCaptureSource(html, fixture.url);
      const requiresRendering = source.text.length < 80 || !!(source.candidate && (!source.candidate.ingredients.length || !source.candidate.instructions.length));
      save("source", source);
      save("capture", { ...common, fetchMs: elapsed, sha256, bytes: Buffer.byteLength(html), sourceBytes: Buffer.byteLength(source.text), sourceMethod: source.method,
        status: requiresRendering ? "requires-rendering" : "ready", baselineTitle: source.candidate?.title,
        ingredientCount: source.candidate?.ingredients.length, instructionCount: source.candidate?.instructions.length });
      console.log(`${fixture.id}: ${requiresRendering ? "requires rendering" : "ready"}`);
    } catch (error) {
      save("capture", { ...fixture, status: "capture-failed", capturedAt: new Date().toISOString(), fetchMs: Math.round(performance.now() - started), error: error instanceof Error ? error.message : "Capture failed" });
      console.log(`${fixture.id}: capture failed`);
    }
    continue;
  }
  const captured = captureSchema.parse(JSON.parse(readFileSync(`${base}.capture.json`, "utf8")));
  if (captured.status !== "ready") {
    console.log(`${fixture.id}: skipped (${captured.status})`);
    continue;
  }
  const html = readFileSync(`${base}.html`, "utf8");
  if (createHash("sha256").update(html).digest("hex") !== captured.sha256) throw new Error("Captured HTML changed");
  const started = Date.now();
  const source = selectCaptureSource(html, fixture.url);
  observations = [];
  try {
    const model = await interpretCapture(source, AbortSignal.timeout(CAPTURE_IMPORT_DEADLINE_MS), {
      deadlineAt: started + CAPTURE_IMPORT_DEADLINE_MS - CAPTURE_RESPONSE_MARGIN_MS - captured.fetchMs,
    });
    save("model", { ...fixture, capturedAt: captured.capturedAt, sha256: captured.sha256, status: "accepted", analysisMs: Date.now() - started, estimatedImportMs: Date.now() - started + captured.fetchMs,
      model, projections: [0.5, 1, 2].map((ratio) => ({ ratio, ...projectRecipe(model, ratio) })), observations });
    console.log(`${fixture.id}: accepted (${Date.now() - started} ms)`);
  } catch (error) {
    save("model", { ...fixture, capturedAt: captured.capturedAt, sha256: captured.sha256, status: "analysis-failed", analysisMs: Date.now() - started,
      error: error instanceof Error ? error.message : "Analysis failed", observations });
    console.log(`${fixture.id}: analysis failed (${Date.now() - started} ms)`);
  }
  if (observations.some((item) => item.status && [401, 402, 403, 429].includes(item.status))) {
    console.log("Stopped after provider authentication, billing, permission, or rate-limit response.");
    process.exitCode = 1;
    break;
  }
}
