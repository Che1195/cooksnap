import { CAPTURE_RESERVED_MICROS, CAPTURE_MAX_ANALYSIS_MS } from "../../src/lib/recipe-capture-policy";
import { fixtures } from "./fixtures";
import { selectCaptureSource } from "../../src/lib/recipe-capture-source";
import { interpretCapture } from "../../src/lib/recipe-capture-model";
import { scrapeRecipe } from "../../src/lib/scraper";
const live = process.argv.includes("--live");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = Math.min(20, Math.max(1, Number(limitArg?.split("=")[1] ?? 20)));
if (!Number.isInteger(limit)) throw new Error("Invalid fixture limit");
const results = [];
for (const fixture of fixtures.slice(0, limit)) {
  const baseline = scrapeRecipe(fixture.html, "https://fixture.invalid/recipe");
  const source = selectCaptureSource(
    fixture.html,
    "https://fixture.invalid/recipe",
  );
  const started = performance.now();
  try {
    const model = live
      ? await interpretCapture(source, AbortSignal.timeout(CAPTURE_MAX_ANALYSIS_MS))
      : null;
    const preserves = (value: typeof baseline) =>
      !!value &&
      value.title === fixture.recipe.title &&
      JSON.stringify(value.ingredients) ===
        JSON.stringify(fixture.recipe.ingredients) &&
      JSON.stringify(value.instructions) ===
        JSON.stringify(fixture.recipe.instructions);
    const predicted =
      model?.interpretation.instructions.flatMap((step) =>
        step.references.map((reference) => ({
          index: step.index,
          start: reference.start,
          end: reference.end,
        })),
      ) ?? [];
    const correct = predicted.filter((reference) =>
      fixture.expectedReferences.some(
        (expected) => JSON.stringify(reference) === JSON.stringify(expected),
      ),
    ).length;
    results.push({
      id: fixture.id,
      highlights: model
        ? {
            correct,
            predicted: predicted.length,
            expected: fixture.expectedReferences.length,
          }
        : null,
      baselinePreserved: preserves(baseline),
      modelPreserved: model ? preserves(model) : null,
      durationMs: Math.round(performance.now() - started),
      telemetry: model?.telemetry ?? null,
    });
  } catch (error) {
    results.push({
      id: fixture.id,
      error: error instanceof Error ? error.message : "Unknown failure",
    });
  }
}
console.log(
  JSON.stringify(
    {
      live,
      source:
        "20 manually checked synthetic source fixtures; publisher corpus still required",
      maximumGenerationDollars: live ? limit * CAPTURE_RESERVED_MICROS / 1_000_000 : 0,
      results,
    },
    null,
    2,
  ),
);
