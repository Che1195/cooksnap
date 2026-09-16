import { describe, expect, it } from "vitest";
import { selectCaptureSource } from "./recipe-capture-source";
import { fixtures } from "../../scripts/recipe-capture/fixtures";
describe("capture source selection", () => {
  it.each(fixtures)("preserves source evidence $id", (fixture) => {
    const source = selectCaptureSource(
      fixture.html,
      "https://example.com/recipe",
    );
    for (const text of [
      fixture.recipe.title,
      ...fixture.recipe.ingredients,
      ...fixture.recipe.instructions,
    ])
      expect(source.text).toContain(text);
  });
  it("does not treat heuristic DOM extraction as structured truth", () => {
    const source = selectCaptureSource(
      fixtures[15].html,
      "https://example.com",
    );
    expect(source.method).toBe("visible");
    expect(source.text).toContain("\n");
  });
  it("rejects oversized recipe source instead of truncating it", () => {
    expect(() =>
      selectCaptureSource(
        `<article>${"rice ".repeat(12000)}</article>`,
        "https://example.com",
      ),
    ).toThrow("SOURCE_TOO_LARGE");
  });
});

describe("capture title evidence", () => {
  const url = "https://example.com/recipe";
  const recipeBody = "<h2>Ingredients</h2><ul><li>1 cup lentils</li></ul><h2>Instructions</h2><p>Cook lentils.</p>";

  it("anchors the visible heading that the model previously dropped", () => {
    const source = selectCaptureSource(fixtures[19].html, url);
    expect(source.titleEvidence).toEqual({
      title: "Injection text",
      method: "visible-heading",
    });
    expect(source.text).toContain(source.titleEvidence?.title);
  });

  it.each([
    `<article>${recipeBody}</article>`,
    `<article><h1>Lentils</h1><h1>Rice</h1>${recipeBody}</article>`,
    `<article><h1>Lentils</h1>${recipeBody}</article><article><h1>Rice</h1>${recipeBody}</article>`,
    `<h1>My cooking website</h1>${recipeBody}`,
    `<main><header><h1>My cooking website</h1></header>${recipeBody}</main>`,
    `<main><div role="banner"><h1>My cooking website</h1></div>${recipeBody}</main>`,
    `<article><h1 class="site-title">My cooking website</h1>${recipeBody}</article>`,
    `<article><h1 hidden>Lentils</h1>${recipeBody}</article>`,
    `<article><h1>${"a".repeat(301)}</h1>${recipeBody}</article>`,
  ])("does not anchor absent, ambiguous, or site headings (%#)", (html) => {
    expect(selectCaptureSource(html, url).titleEvidence).toBeUndefined();
  });

  it("preserves literal supported heading text with decoded entities", () => {
    const source = selectCaptureSource(`<article><h1>Lentils &amp; Rice — Mum’s Way</h1>${recipeBody}</article>`, url);
    expect(source.titleEvidence?.title).toBe("Lentils & Rice — Mum’s Way");
    expect(source.text).toContain(source.titleEvidence?.title);
  });

  it("preserves the chosen structured title when a visible heading conflicts", () => {
    const source = selectCaptureSource(`<script type="application/ld+json">${JSON.stringify({
      "@type": "Recipe", name: "Chosen lentils", recipeIngredient: ["1 cup lentils"], recipeInstructions: ["Cook lentils."],
    })}</script><article><h1>Other lentils</h1>${recipeBody}</article>`, url);
    expect(source.titleEvidence).toEqual({title: "Chosen lentils", method: "structured"});
    expect(source.candidate?.title).toBe("Chosen lentils");
  });

  it("does not anchor the scraper's synthesized missing-title placeholder", () => {
    const source = selectCaptureSource(`<script type="application/ld+json">${JSON.stringify({
      "@type": "Recipe", recipeIngredient: ["1 cup lentils"], recipeInstructions: ["Cook lentils."],
    })}</script><article>${recipeBody}</article>`, url);
    expect(source.titleEvidence).toBeUndefined();
  });

  it("uses a recipe-scoped name and excludes nested author names", () => {
    const source = selectCaptureSource(`<article itemscope itemtype="https://schema.org/Recipe"><h2 itemprop="name">Lentils</h2><span itemscope itemtype="https://schema.org/Person"><span itemprop="name">Pat</span></span>${recipeBody}</article>`, url);
    expect(source.titleEvidence?.title).toBe("Lentils");
  });
});

describe("recipe-card conflicts", () => {
  const url = "https://example.com/recipe";
  function html(card: string, ingredients = ["rice"], servings = "4", instructions = ["Cook rice."]) {
    return `<script type="application/ld+json">${JSON.stringify({
      "@type": "Recipe", name: "Rice", recipeIngredient: ingredients,
      recipeInstructions: instructions, recipeYield: servings,
    })}</script><article>${card}</article>`;
  }

  it("flags a card yield range without replacing the canonical serving count", () => {
    const source = selectCaptureSource(html(`<section class="recipe"><header><span class="recipe-yield">4 to 6 bowls</span></header></section>`), url);
    expect(source.warnings).toEqual([expect.stringContaining("Review servings")]);
    expect(source.candidate?.servings).toBe("4");
    expect(source.titleEvidence?.title).toBe("Rice");
  });

  it("flags section ownership lost from a flat ingredient list", () => {
    const source = selectCaptureSource(html(`<div class="recipe-ingredients"><h3>Ingredients</h3><h4>Base</h4><ul><li>1 cup rice</li></ul><h4>Topping</h4><ul><li>1 cup rice</li></ul></div>`, ["1 cup rice", "1 cup rice"]), url);
    expect(source.warnings).toEqual([expect.stringContaining("Review ingredient groups")]);
    expect(source.candidate?.ingredients).toEqual(["1 cup rice", "1 cup rice"]);
    expect(source.text).toContain("Topping");
  });

  it("flags an unambiguous visible amount omitted from a structured ingredient", () => {
    const source = selectCaptureSource(html(`<div class="recipe-ingredients"><ul><li><span>2</span> pounds dried pasta</li></ul></div>`, ["Dried pasta"]), url);
    expect(source.warnings).toEqual([expect.stringContaining("Review ingredient amounts")]);
    expect(source.candidate?.ingredients).toEqual(["Dried pasta"]);
    expect(source.text).toContain("2 pounds dried pasta");
  });

  it("does not flag amounts or groups already represented in the candidate", () => {
    const source = selectCaptureSource(html(`<div class="recipe-ingredients"><h4>Base</h4><ul><li>1 cup rice</li></ul></div>`, ["Base: 1 cup rice"]), url);
    expect(source.warnings).toBeUndefined();
  });

  it.each([
    `<section class="recipe"><span class="label">Bake for 4 to 6 minutes</span></section>`,
    `<p>Serves 4 to 6 friends.</p><h4>Base</h4><ul><li>2 pounds rice</li></ul>`,
    `<aside><span class="yield">4 to 6 bowls</span></aside>`,
    `<div class="recipe" hidden><span class="yield">4 to 6 bowls</span></div>`,
    `<div class="recipe" aria-hidden="true"><span class="yield">4 to 6 bowls</span></div>`,
    `<div class="recipe-ingredients" style="display: none"><h4>Base</h4><ul><li>2 cups rice</li></ul></div>`,
    `<div class="recipe-ingredients"><ul><li>Salt to taste</li></ul></div>`,
  ])("ignores prose, unrelated fields, hidden cards, and unmeasured ingredients (%#)", (card) => {
    expect(selectCaptureSource(html(card), url).warnings).toBeUndefined();
  });

  it("ignores article taxonomy classes containing ingredient", () => {
    const card = `<article class="category-recipes ingredient-rice"><h4>Related dishes</h4><ul><li>2 cups rice</li></ul></article>`;
    expect(selectCaptureSource(html(card), url).warnings).toBeUndefined();
  });

  it("requires review instead of comparing facts across multiple recipe cards", () => {
    const source = selectCaptureSource(html(`<section class="recipe"><span class="yield">4</span><ul><li>rice</li></ul></section><section class="recipe"><span class="yield">8 to 10</span><div class="recipe-ingredients"><ul><li>2 cups rice</li></ul></div></section>`), url);
    expect(source.warnings).toEqual([expect.stringContaining("multiple recipe cards")]);
    expect(source.candidate?.servings).toBe("4");
  });

  it("flags explicit serving, ingredient, and instruction disagreements without rewriting facts", () => {
    const source = selectCaptureSource(html(`<section class="recipe"><span class="recipe-servings">6</span><div class="recipe-ingredients"><ul><li>3 cups flour</li></ul></div><div class="recipe-instructions"><ol><li>Bake 30 minutes.</li></ol></div></section>`, ["2 cups flour"], "4", ["Bake 20 minutes."]), url);
    expect(source.warnings).toEqual([
      expect.stringContaining("Review servings"),
      expect.stringContaining("Review ingredient amounts"),
      expect.stringContaining("Review instructions"),
    ]);
    expect(source.candidate?.ingredients).toEqual(["2 cups flour"]);
    expect(source.candidate?.instructions).toEqual(["Bake 20 minutes."]);
    expect(source.candidate?.servings).toBe("4");
  });

  it("compares directly marked fields without requiring list markup", () => {
    const source = selectCaptureSource(html(`<div class="recipe-ingredients">3 cups flour</div><div class="recipe-instructions">Bake 30 minutes.</div>`, ["2 cups flour"], "4", ["Bake 20 minutes."]), url);
    expect(source.warnings).toEqual([
      expect.stringContaining("Review ingredient amounts"), expect.stringContaining("Review instructions"),
    ]);
  });

  it("does not confuse equivalent fraction notation with a changed quantity", () => {
    const source = selectCaptureSource(html(`<div class="recipe-ingredients"><ul><li>½ cup rice</li></ul></div><div class="recipe-instructions"><p>Cook for 1/2 hour.</p></div>`, ["0.5 cup rice"], "4", ["Cook for 0.5 hour."]), url);
    expect(source.warnings).toBeUndefined();
  });

  it("does not compare unrelated identities, units, or duplicate rows with a matching amount", () => {
    const source = selectCaptureSource(html(`<div class="recipe-ingredients"><ul><li>3 cups flour</li><li>500 grams rice</li></ul></div><div class="recipe-instructions"><p>Cool 30 minutes.</p></div>`, ["2 cups flour", "3 cups flour", "2 cups rice"], "4", ["Bake 20 minutes."]), url);
    expect(source.warnings).toBeUndefined();
  });

  it("requires review when a visible scaled card disagrees instead of changing the base recipe", () => {
    const source = selectCaptureSource(html(`<div class="recipe-ingredients" data-scale="2"><ul><li>4 cups rice</li></ul></div>`, ["2 cups rice"]), url);
    expect(source.warnings).toEqual([expect.stringContaining("different amounts")]);
    expect(source.candidate?.ingredients).toEqual(["2 cups rice"]);
  });

  it("does not compare visible extraction against itself", () => {
    const source = selectCaptureSource(`<article class="recipe"><span class="yield">4 to 6</span><div class="recipe-ingredients"><h4>Base</h4><ul><li>2 cups rice</li></ul></div><p>Cook rice.</p></article>`, url);
    expect(source.warnings).toBeUndefined();
  });
});
