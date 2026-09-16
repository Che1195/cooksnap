import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import { fixtures } from "./fixtures";
import { corpus } from "./corpus";
import { interpretCapture } from "../../src/lib/recipe-capture-model";
import { selectCaptureSource } from "../../src/lib/recipe-capture-source";
import { CAPTURE_RESERVED_MICROS, CAPTURE_MAX_ANALYSIS_MS } from "../../src/lib/recipe-capture-policy";
import { projectRecipe } from "../../src/lib/recipe-interpretation";
import { scrapeRecipe } from "../../src/lib/scraper";

// Explicit paid evaluation only. Inputs are the repository's synthetic fixtures.
// Record final answers and usage, never credentials, headers, or reasoning text.
const suite = process.argv.find((arg) => arg.startsWith("--suite="))?.split("=")[1];
const output = process.argv.find((arg) => arg.startsWith("--output="))?.slice(9);
const selectedId = process.argv.find((arg) => arg.startsWith("--id="))?.slice(5);
if (!process.argv.includes("--live") || !output || !["measurement", "balanced"].includes(suite ?? "")) {
  throw new Error("Use --live --suite=measurement|balanced --output=path.json");
}
if (!process.env.META_API_KEY) throw new Error("META_API_KEY is missing");

const envelopeSchema = z.object({
  status: z.string().optional(),
  input_tokens: z.number().optional(),
  usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }).nullable().optional().catch(null),
  error: z.object({ code: z.string().optional(), type: z.string().optional() }).nullable().optional().catch(null),
  output: z.array(z.object({
    type: z.string(), role: z.string().nullable().optional(), phase: z.string().nullable().optional(),
    content: z.array(z.object({ type: z.string(), text: z.string().optional() })).nullable().optional(),
  })).nullable().optional().catch(null),
});
interface Observation {
  stage: "count" | "generation";
  durationMs: number;
  httpStatus?: number;
  responseStatus?: string;
  inputTokens?: number;
  outputTokens?: number;
  errorCode?: string;
  transportFailure?: boolean;
  finalAnswer?: string;
}
let observations: Observation[] = [];
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  const stage = url.endsWith("/input_tokens") ? "count" : "generation";
  const started = performance.now();
  try {
    const response = await nativeFetch(input, init);
    const envelope = envelopeSchema.safeParse(await response.clone().json().catch(() => null));
    const data = envelope.success ? envelope.data : undefined;
    observations.push({
      stage, durationMs: Math.round(performance.now() - started), httpStatus: response.status,
      responseStatus: data?.status,
      inputTokens: stage === "count" ? data?.input_tokens : data?.usage?.input_tokens,
      outputTokens: data?.usage?.output_tokens,
      errorCode: data?.error?.code,
      finalAnswer: data?.output?.filter((item) => item.type === "message" && item.role === "assistant" && item.phase !== "commentary")
        .flatMap((item) => item.content ?? []).filter((part) => part.type === "output_text")
        .map((part) => part.text ?? "").join("") || undefined,
    });
    return response;
  } catch (error) {
    observations.push({ stage, durationMs: Math.round(performance.now() - started), transportFailure: true });
    throw error;
  }
};

const allCases = suite === "measurement"
  ? fixtures.map((fixture) => ({ ...fixture, expected: fixture.recipe, category: "measurement", outcome: "complete" }))
  : corpus;
const cases = selectedId ? allCases.filter((fixture) => fixture.id === selectedId) : allCases;
if (!cases.length) throw new Error("Unknown fixture ID");
const results: unknown[] = [];
const startedAt = new Date().toISOString();
mkdirSync(dirname(output), { recursive: true });
function persist(complete: boolean) {
  writeFileSync(output!, JSON.stringify({
    suite, selectedId, instrumentationVersion: 2, startedAt, updatedAt: new Date().toISOString(), complete,
    provenance: "Hand-authored/adapted synthetic sources; no publisher captures or renderer execution.",
    deadlineMs: CAPTURE_MAX_ANALYSIS_MS,
    maximumGenerationDollars: cases.filter((fixture) => fixture.outcome !== "reject").length * CAPTURE_RESERVED_MICROS / 1_000_000,
    results,
  }, null, 2) + "\n");
}
for (const fixture of cases) {
  observations = [];
  const html = "renderedHtml" in fixture ? fixture.renderedHtml ?? fixture.html : fixture.html;
  const source = selectCaptureSource(html, "https://fixture.invalid/recipe");
  const baseline = scrapeRecipe(html, "https://fixture.invalid/recipe");
  const facts = (recipe: typeof baseline) => recipe && ({ title: recipe.title, ingredients: recipe.ingredients, instructions: recipe.instructions });
  const expected = fixture.expected;
  const base = {
    id: fixture.id, category: fixture.category, expectedOutcome: fixture.outcome,
    expected, sourceMethod: source.method, baseline: facts(baseline),
    baselinePreserved: JSON.stringify(facts(baseline)) === JSON.stringify(expected),
    expectedReferences: "expectedReferences" in fixture ? fixture.expectedReferences : undefined,
  };
  if (fixture.outcome === "reject") {
    results.push({ ...base, modeledRejection: ("sourceStatus" in fixture && !!fixture.sourceStatus) || source.text.length < 40 });
    persist(false);
    continue;
  }
  const started = performance.now();
  try {
    const model = await interpretCapture(source, AbortSignal.timeout(CAPTURE_MAX_ANALYSIS_MS));
    results.push({ ...base, durationMs: Math.round(performance.now() - started),
      modelPreserved: JSON.stringify(facts(model)) === JSON.stringify(expected), model,
      projections: [0.5, 1, 2].map((ratio) => ({ ratio, ...projectRecipe(model, ratio) })), observations,
    });
    console.log(`${suite}/${fixture.id}: completed (${Math.round(performance.now() - started)} ms)`);
  } catch (error) {
    results.push({ ...base, durationMs: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : "Unknown failure", observations });
    console.log(`${suite}/${fixture.id}: failed (${Math.round(performance.now() - started)} ms)`);
  }
  persist(false);
  if (observations.some((item) => item.httpStatus && [401, 402, 403, 429].includes(item.httpStatus))) {
    console.log("Stopped suite after provider authentication, billing, permission, or rate-limit response.");
    process.exitCode = 1;
    break;
  }
}
persist(results.length === cases.length);
