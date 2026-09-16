import { describe, expect, it } from "vitest";
import { corpus } from "../../scripts/recipe-capture/corpus";
import { selectCaptureSource } from "./recipe-capture-source";
describe("balanced capture corpus evidence", () => {
  it("covers all six release-source categories with twenty cases", () => {
    expect(corpus).toHaveLength(20);
    expect(new Set(corpus.map((f) => f.category)).size).toBe(6);
  });
  it.each(corpus)(
    "backs expected facts with literal HTML evidence: $id",
    (fixture) => {
      const html = fixture.renderedHtml ?? fixture.html;
      for (const fact of fixture.evidence) expect(html).toContain(fact);
      if (fixture.expected)
        for (const fact of [
          fixture.expected.title,
          ...fixture.expected.ingredients,
          ...fixture.expected.instructions,
        ])
          expect(html).toContain(fact);
    },
  );
  it("retains incomplete JSON-LD evidence without visible text", () => {
    for (const id of ["jsonld-missing-steps", "jsonld-missing-ingredients"]) {
      const fixture = corpus.find((f) => f.id === id)!;
      const source = selectCaptureSource(
        fixture.html,
        "https://fixture.invalid",
      );
      for (const fact of fixture.evidence) expect(source.text).toContain(fact);
      expect(source.method).toBe("visible");
    }
  });
  it("keeps both conflicting quantity claims available for review", () => {
    const fixture = corpus.find((f) => f.id === "conflicting-quantities")!;
    const source = selectCaptureSource(fixture.html, "https://fixture.invalid");
    expect(source.text).toContain("1 cup rice");
    expect(source.text).toContain("2 cups rice");
  });
  it("removes navigation, advertisements and page-level injection", () => {
    for (const id of [
      "navigation-advertisements",
      "page-instruction-injection",
    ]) {
      const fixture = corpus.find((f) => f.id === id)!;
      const source = selectCaptureSource(
        fixture.html,
        "https://fixture.invalid",
      );
      expect(source.text).not.toContain("99 hours");
      expect(source.text).toContain("1 cup rice");
    }
  });
});
