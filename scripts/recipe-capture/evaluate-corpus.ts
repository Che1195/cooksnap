import { CAPTURE_RESERVED_MICROS, CAPTURE_MAX_ANALYSIS_MS } from "../../src/lib/recipe-capture-policy";
import { corpus } from "./corpus";
import { scrapeRecipe } from "../../src/lib/scraper";
import { selectCaptureSource } from "../../src/lib/recipe-capture-source";
import { interpretCapture } from "../../src/lib/recipe-capture-model";
// Explicit opt-in only. Production admission is not used by this offline runner.
const live = process.argv.includes("--live");
const results = [];
for (const fixture of corpus) {
  const baseline = scrapeRecipe(
    fixture.renderedHtml ?? fixture.html,
    "https://fixture.invalid/recipe",
  );
  const source = selectCaptureSource(
    fixture.renderedHtml ?? fixture.html,
    "https://fixture.invalid/recipe",
  );
  const evidencePreserved = fixture.evidence.every((fact) =>
    source.text.includes(fact),
  );
  if (fixture.outcome === "reject") {
    results.push({
      id: fixture.id,
      category: fixture.category,
      expected: fixture.outcome,
      sourceStatus: fixture.sourceStatus ?? 200,
      rejectedBeforeInference:
        !!fixture.sourceStatus || source.text.length < 40,
      baselineFoundRecipe: !!baseline,
    });
    continue;
  }
  const started = performance.now();
  try {
    const model = live
      ? await interpretCapture(source, AbortSignal.timeout(CAPTURE_MAX_ANALYSIS_MS))
      : null;
    const preserves = (value: typeof baseline) =>
      !!value &&
      !!fixture.expected &&
      value.title === fixture.expected.title &&
      JSON.stringify(value.ingredients) ===
        JSON.stringify(fixture.expected.ingredients) &&
      JSON.stringify(value.instructions) ===
        JSON.stringify(fixture.expected.instructions);
    results.push({
      id: fixture.id,
      category: fixture.category,
      expected: fixture.outcome,
      evidencePreserved,
      baselinePreserved: preserves(baseline),
      modelPreserved: model ? preserves(model) : null,
      reviewDetected: model
        ? model.needsReview || model.warnings.length > 0
        : null,
      durationMs: Math.round(performance.now() - started),
      telemetry: model?.telemetry ?? null,
    });
  } catch (error) {
    results.push({
      id: fixture.id,
      category: fixture.category,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
console.log(
  JSON.stringify(
    {
      live,
      provenance:
        "20 hand-authored sources, including adapted repository examples. No captured publisher HTML or actual renderer execution.",
      maxGenerationDollars: live ? corpus.filter((fixture) => fixture.outcome !== "reject").length * CAPTURE_RESERVED_MICROS / 1_000_000 : 0,
      results,
    },
    null,
    2,
  ),
);
