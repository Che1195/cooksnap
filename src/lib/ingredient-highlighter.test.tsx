import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { highlightIngredients } from "./ingredient-highlighter";
import { projectRecipe } from "./recipe-interpretation";

describe("source-linked highlight rendering", () => {
  it("leaves ingredient-like words plain without source references", () => {
    expect(
      renderToStaticMarkup(
        <p>{highlightIngredients("Oil the pan and fold foil.")}</p>,
      ),
    ).toBe("<p>Oil the pan and fold foil.</p>");
  });
  it("renders only projected ingredient spans without changing text", () => {
    const step = projectRecipe(
      {
        ingredients: ["2 tbsp butter"],
        instructions: ["Melt 2 tbsp butter for 20 minutes."],
      },
      2,
    ).instructions[0];
    const markup = renderToStaticMarkup(
      <p>{highlightIngredients(step.text, step.highlights)}</p>,
    );
    expect(markup).toBe(
      '<p>Melt 4 tbsp <span class="font-semibold text-primary">butter</span> for 20 minutes.</p>',
    );
  });
});
