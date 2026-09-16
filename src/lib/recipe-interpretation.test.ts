import { describe, expect, it } from "vitest";
import {
  buildSemanticInterpretation,
  incompleteMeasurementWarnings,
  projectRecipe,
  recipeFingerprint,
  validateInterpretation,
  type RecipeInterpretation,
} from "./recipe-interpretation";

describe("source-preserving recipe projections", () => {
  it.each([
    "1 percent milk", "2% milk", '1" piece of ginger', "1″ piece of ginger",
    "2 inches ginger", "1-inch piece of ginger", "2–inch piece of ginger",
    "350 degrees water", "20 cm pastry sheet",
  ])("preserves composition, temperature, and dimensions in %s", (ingredient) => {
    const recipe = { ingredients: [ingredient], instructions: [] };
    expect(projectRecipe(recipe, 2).ingredients).toEqual([ingredient]);
    const interpretation = buildSemanticInterpretation(recipe, {
      ingredients: [{ index: 0, name: ingredient }], references: [],
    });
    expect(interpretation).toBeDefined();
    expect(projectRecipe({ ...recipe, interpretation }, 0.5).ingredients).toEqual([ingredient]);
  });
  it.each([
    ["1-2 tbsp butter", 2, "2-4 tbsp butter"],
    ["1 1/2 cup flour", 0.5, "3/4 cup flour"],
    ["2 (14 oz) cans tomatoes", 0.5, "1 (14 oz) can tomatoes"],
    ["2 cans (14 oz each) tomatoes", 0.5, "1 can (14 oz each) tomatoes"],
    ["1 cup (120g) flour", 2, "2 cups (240g) flour"],
    [
      "1 cup flour, plus more for dusting",
      2,
      "2 cups flour, plus more for dusting",
    ],
    ["1½ cups flour", 0.5, "3/4 cup flour"],
    ["½–¾ cup milk", 2, "1–1 1/2 cups milk"],
    ["Salt to taste", 2, "Salt to taste"],
    ["## For the sauce:", 2, "## For the sauce:"],
    ["2 ( 14 oz) cans tomatoes", 0.5, "1 ( 14 oz) can tomatoes"],
  ])("scales %s safely", (ingredient, ratio, expected) => {
    expect(
      projectRecipe({ ingredients: [ingredient], instructions: [] }, ratio)
        .ingredients[0],
    ).toBe(expected);
  });
  it("keeps original source byte-for-byte at the original serving count", () => {
    const ingredients = [" 1½ cup (120 g) flour, plus more", "Salt, to taste"];
    expect(
      projectRecipe({ ingredients, instructions: [] }, 1).ingredients,
    ).toEqual(ingredients);
  });
  it("scales explicit instruction amounts but leaves relative amounts and equipment alone", () => {
    const result = projectRecipe(
      {
        ingredients: ["2 tbsp butter"],
        instructions: [
          "Melt 2 tbsp butter. Add half the remaining butter. Bake at 350°F for 20 minutes in a 9-inch pan.",
        ],
      },
      2,
    );
    expect(result.instructions[0].text).toBe(
      "Melt 4 tbsp butter. Add half the remaining butter. Bake at 350°F for 20 minutes in a 9-inch pan.",
    );
    expect(
      result.instructions[0].highlights.map((span) =>
        result.instructions[0].text.slice(span.start, span.end),
      ),
    ).toEqual(["butter", "butter"]);
  });
  it("highlights recipe-specific aliases, never words inside foil or an Oil verb", () => {
    const result = projectRecipe(
      {
        ingredients: ["2 yellow onions", "1 tbsp olive oil"],
        instructions: ["Oil a pan. Cover with foil. Add onions and oil."],
      },
      1,
    );
    expect(
      result.instructions[0].highlights.map((span) =>
        result.instructions[0].text.slice(span.start, span.end),
      ),
    ).toEqual(["onions", "oil"]);
    expect(
      projectRecipe(
        {
          ingredients: ["1 cup flour"],
          instructions: ["Add onions and butter."],
        },
        1,
      ).instructions[0].highlights,
    ).toEqual([]);
  });
  it("omits ambiguous aliases across repeated ingredient sections", () => {
    const result = projectRecipe(
      {
        ingredients: ["## Sauce", "1 tsp salt", "## Filling", "2 tsp salt"],
        instructions: ["Add 1 tsp salt."],
      },
      2,
    );
    expect(result.instructions[0]).toEqual({
      text: "Add 1 tsp salt.",
      highlights: [],
    });
  });
  it("keeps unique longest names while omitting ambiguous short aliases", () => {
    const result = projectRecipe(
      {
        ingredients: ["1 red onion", "1 white onion"],
        instructions: ["Add red onion, then onion."],
      },
      1,
    );
    expect(
      result.instructions[0].highlights.map((span) =>
        result.instructions[0].text.slice(span.start, span.end),
      ),
    ).toEqual(["red onion"]);
  });
  it("rejects invalid multipliers", () => {
    const result = projectRecipe(
      { ingredients: ["2 cups flour"], instructions: [] },
      NaN,
    );
    expect(result.ingredients).toEqual(["2 cups flour"]);
    expect(result.warnings).toHaveLength(1);
  });
});

const source = {
  ingredients: ["2 tbsp butter"],
  instructions: ["Melt 2 tbsp butter."],
};
function fixture(): RecipeInterpretation {
  return {
    version: 1,
    sourceFingerprint: recipeFingerprint(source),
    ingredients: [
      {
        id: "butter",
        index: 0,
        name: "butter",
        aliases: ["butter"],
        nameSpan: { start: 7, end: 13, text: "butter" },
        quantities: [{ start: 0, end: 1, text: "2", role: "amount", value: 2 }],
      },
    ],
    instructions: [
      {
        index: 0,
        references: [
          { start: 12, end: 18, text: "butter", ingredientId: "butter" },
        ],
        quantities: [
          {
            start: 5,
            end: 6,
            text: "2",
            role: "amount",
            value: 2,
            ingredientId: "butter",
          },
        ],
      },
    ],
  };
}
describe("interpretation validation", () => {
  it("accepts exact supported source spans", () => {
    expect(validateInterpretation(source, fixture())).toEqual(fixture());
  });
  it("preserves selected reference spans and remaps offsets after scaling", () => {
    const data = fixture();
    const repeated = {
      ...source,
      instructions: ["Melt 2 tbsp butter. Add butter."],
    };
    data.sourceFingerprint = recipeFingerprint(repeated);
    const result = projectRecipe({ ...repeated, interpretation: data }, 0.125);
    expect(result.instructions[0].text).toBe(
      "Melt 1/4 tbsp butter. Add butter.",
    );
    expect(result.instructions[0].highlights).toEqual([{ start: 14, end: 20 }]);
    data.instructions[0].references = [];
    data.instructions[0].quantities = [];
    expect(
      projectRecipe({ ...repeated, interpretation: data }, 2).instructions[0]
        .highlights,
    ).toEqual([]);
  });
  it("rejects a span whose end exceeds the source even when slicing matches", () => {
    const data = fixture();
    if (data.ingredients[0].nameSpan) data.ingredients[0].nameSpan.end = 100;
    expect(validateInterpretation(source, data)).toBeUndefined();
  });
  it("rejects edited source and changed servings", () => {
    expect(
      validateInterpretation(
        { ...source, ingredients: ["3 tbsp butter"] },
        fixture(),
      ),
    ).toBeUndefined();
    expect(
      validateInterpretation({ ...source, servings: "8" }, fixture()),
    ).toBeUndefined();
  });
  it.each([
    "bad span",
    "wrong numeric value",
    "unknown id",
    "overlap",
    "wrong role",
    "invented alias",
    "duplicate index",
  ])("rejects %s", (kind) => {
    const data = fixture();
    if (kind === "bad span") data.ingredients[0].quantities[0].end = 2;
    if (kind === "wrong numeric value")
      data.ingredients[0].quantities[0].value = 3;
    if (kind === "unknown id")
      data.instructions[0].references[0].ingredientId = "flour";
    if (kind === "overlap")
      data.instructions[0].references.push(data.instructions[0].references[0]);
    if (kind === "wrong role")
      data.ingredients[0].quantities[0].role = "package";
    if (kind === "invented alias") data.ingredients[0].aliases.push("flour");
    if (kind === "duplicate index")
      data.ingredients.push({ ...data.ingredients[0], id: "second" });
    expect(validateInterpretation(source, data)).toBeUndefined();
  });
  it("fills omitted metadata quantities from supported source amounts", () => {
    const data = fixture();
    data.ingredients[0].quantities = [];
    data.instructions = [];
    const result = projectRecipe({ ...source, interpretation: data }, 2);
    expect(result.ingredients).toEqual(["4 tbsp butter"]);
    expect(result.instructions[0].text).toBe("Melt 4 tbsp butter.");
  });
  it.each([false, true])(
    "recovers instruction amounts from %s partial quantity annotations",
    (partial) => {
      const repeated = {
        ingredients: ["4 tbsp butter"],
        instructions: ["Melt 2 tbsp butter. Add 1 tbsp butter."],
      };
      const data = fixture();
      data.sourceFingerprint = recipeFingerprint(repeated);
      data.ingredients[0].quantities = [];
      data.instructions[0].references.push({
        start: 31,
        end: 37,
        text: "butter",
        ingredientId: "butter",
      });
      if (!partial) data.instructions[0].quantities = [];
      expect(validateInterpretation(repeated, data)).toEqual(data);
      const result = projectRecipe({ ...repeated, interpretation: data }, 2);
      expect(result.ingredients).toEqual(["8 tbsp butter"]);
      expect(result.instructions[0].text).toBe(
        "Melt 4 tbsp butter. Add 2 tbsp butter.",
      );
      expect(result.instructions[0].highlights).toEqual([
        { start: 12, end: 18 },
        { start: 31, end: 37 },
      ]);
      expect(result.warnings).toEqual([]);
    },
  );
  it("does not recover amounts for intentionally excluded references", () => {
    const data = fixture();
    data.instructions[0].references = [];
    data.instructions[0].quantities = [];
    expect(validateInterpretation(source, data)).toEqual(data);
    expect(
      projectRecipe({ ...source, interpretation: data }, 2).instructions[0],
    ).toEqual({ text: "Melt 2 tbsp butter.", highlights: [] });
  });
  it("recovers only selected reference amounts and remaps their highlights", () => {
    const repeated = {
      ...source,
      instructions: ["Melt 2 tbsp butter. Add 1 tbsp butter."],
    };
    const data = fixture();
    data.sourceFingerprint = recipeFingerprint(repeated);
    data.instructions[0].quantities = [];
    const result = projectRecipe({ ...repeated, interpretation: data }, 0.125);
    expect(result.instructions[0]).toEqual({
      text: "Melt 1/4 tbsp butter. Add 1 tbsp butter.",
      highlights: [{ start: 14, end: 20 }],
    });
  });
  it("keeps relative amounts, temperature, time, equipment, and package sizes unchanged during recovery", () => {
    const mixed = {
      ingredients: ["4 tbsp butter"],
      instructions: [
        "Melt 2 tbsp butter. Add half the butter, 1/2 of the butter, remaining 1 tbsp butter, and a 14 oz package of butter. Bake at 350°F for 20 minutes in a 9-inch pan.",
      ],
    };
    const data = fixture();
    data.sourceFingerprint = recipeFingerprint(mixed);
    data.ingredients[0].quantities = [];
    data.instructions[0].quantities = [];
    data.instructions[0].references = Array.from(
      mixed.instructions[0].matchAll(/butter/g),
      (match) => ({
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
        ingredientId: "butter",
      }),
    );
    expect(validateInterpretation(mixed, data)).toEqual(data);
    expect(
      projectRecipe({ ...mixed, interpretation: data }, 2).instructions[0].text,
    ).toBe(
      "Melt 4 tbsp butter. Add half the butter, 1/2 of the butter, remaining 1 tbsp butter, and a 14 oz package of butter. Bake at 350°F for 20 minutes in a 9-inch pan.",
    );
  });
  it.each(["1/2", "½", "1/4–1/2"])(
    "preserves relative %s amounts while scaling measured fractions and counts",
    (fraction) => {
      const result = projectRecipe(
        {
          ingredients: ["1 cup butter", "4 eggs"],
          instructions: [
            `Add ${fraction} of the butter, 1/2 cup of butter, and 2 of the eggs.`,
          ],
        },
        2,
      );
      expect(result.instructions[0].text).toBe(
        `Add ${fraction} of the butter, 1 cup of butter, and 4 of the eggs.`,
      );
    },
  );
  it("ignores invalid metadata and still scales source amounts", () => {
    const data = fixture();
    data.ingredients[0].quantities[0].value = 99;
    const result = projectRecipe({ ...source, interpretation: data }, 2);
    expect(result.ingredients).toEqual(["4 tbsp butter"]);
    expect(result.warnings).toHaveLength(1);
  });
  it("fingerprints preserve source order, punctuation, and whitespace", () => {
    expect(recipeFingerprint(source)).not.toBe(
      recipeFingerprint({ ...source, ingredients: ["2 tbsp butter "] }),
    );
  });
});

describe("review regression cases", () => {
  it("preserves instruction package sizes during quantity recovery and flags unresolved counts", () => {
    const packageSource = {
      ingredients: ["2 packages (8 oz each) cream cheese"],
      instructions: [
        "Add 2 packages of 8 oz cream cheese.",
        "Add 8 oz cream cheese.",
      ],
    };
    const interpretation: RecipeInterpretation = {
      version: 1,
      sourceFingerprint: recipeFingerprint(packageSource),
      ingredients: [
        {
          id: "cream-cheese",
          index: 0,
          name: "cream cheese",
          aliases: [],
          quantities: [],
        },
      ],
      instructions: packageSource.instructions.map((text, index) => ({
        index,
        references: [
          {
            start: text.indexOf("cream cheese"),
            end: text.indexOf("cream cheese") + "cream cheese".length,
            text: "cream cheese",
            ingredientId: "cream-cheese",
          },
        ],
        quantities: [],
      })),
    };
    expect(validateInterpretation(packageSource, interpretation)).toEqual(
      interpretation,
    );
    for (const metadata of [undefined, interpretation]) {
      const result = projectRecipe(
        { ...packageSource, interpretation: metadata },
        2,
      );
      expect(result.ingredients).toEqual([
        "4 packages (8 oz each) cream cheese",
      ]);
      expect(result.instructions.map((step) => step.text)).toEqual([
        "Add 2 packages of 8 oz cream cheese.",
        "Add 16 oz cream cheese.",
      ]);
      expect(result.warnings).toEqual([
        "Package amounts in instructions remain unchanged. Check their counts for the selected servings.",
      ]);
      expect(
        projectRecipe({ ...packageSource, interpretation: metadata }, 1)
          .warnings,
      ).toEqual([]);
    }
  });
  it("scales counted instruction ingredients and accepts their source annotations", () => {
    const eggs = { ingredients: ["2 eggs"], instructions: ["Beat 2 eggs."] };
    const interpretation: RecipeInterpretation = {
      version: 1,
      sourceFingerprint: recipeFingerprint(eggs),
      ingredients: [
        {
          id: "eggs",
          index: 0,
          name: "eggs",
          aliases: ["egg"],
          quantities: [
            { start: 0, end: 1, text: "2", role: "amount", value: 2 },
          ],
        },
      ],
      instructions: [
        {
          index: 0,
          references: [
            { start: 7, end: 11, text: "eggs", ingredientId: "eggs" },
          ],
          quantities: [
            {
              start: 5,
              end: 6,
              text: "2",
              role: "amount",
              value: 2,
              ingredientId: "eggs",
            },
          ],
        },
      ],
    };
    expect(validateInterpretation(eggs, interpretation)).toEqual(
      interpretation,
    );
    expect(projectRecipe(eggs, 2).instructions[0].text).toBe("Beat 4 eggs.");
    expect(
      projectRecipe({ ...eggs, interpretation }, 2).instructions[0].text,
    ).toBe("Beat 4 eggs.");
  });
  it.each(["14-ounce can tomatoes", "14 oz can tomatoes", "500 g bag flour"])(
    "preserves standalone package size %s",
    (ingredient) => {
      expect(
        projectRecipe({ ingredients: [ingredient], instructions: [] }, 2)
          .ingredients,
      ).toEqual([ingredient]);
    },
  );
  it("leaves comma-grouped amounts unchanged and reports the unresolved quantity", () => {
    const result = projectRecipe(
      { ingredients: ["1,500 g flour"], instructions: ["Add 1,500 g flour."] },
      2,
    );
    expect(result.ingredients).toEqual(["1,500 g flour"]);
    expect(result.instructions[0].text).toBe("Add 1,500 g flour.");
    expect(result.warnings).toContain(
      "Amounts without a clear scalable quantity remain unchanged.",
    );
  });
  it("does not round very small quantities to zero", () => {
    expect(
      projectRecipe(
        { ingredients: ["0.001 g saffron"], instructions: [] },
        0.25,
      ).ingredients,
    ).toEqual(["0.00025 g saffron"]);
  });
});

describe("local measurements from compact semantics", () => {
  it("derives mixed fractions, ranges, Unicode offsets, and projected highlights locally", () => {
    const recipe = {
      ingredients: ["1 1/2 cups softened butter", "½–¾ cup flour"],
      instructions: [
        "🥣 Melt 1 1/2 cups softened butter, then add ½–¾ cup flour.",
        "Cool for 10 minutes.",
      ],
    };
    const interpretation = buildSemanticInterpretation(recipe, {
      ingredients: [
        { index: 1, name: "flour" },
        { index: 0, name: "butter" },
      ],
      references: [
        { step: 0, ingredient: 0, text: "softened butter" },
        { step: 0, ingredient: 1, text: "flour" },
      ],
    });
    expect(interpretation).toBeDefined();
    expect(interpretation?.instructions[1]).toEqual({
      index: 1,
      references: [],
      quantities: [],
    });
    const projected = projectRecipe({ ...recipe, interpretation }, 2);
    expect(projected.ingredients).toEqual([
      "3 cups softened butter",
      "1–1 1/2 cups flour",
    ]);
    expect(projected.instructions[0].text).toBe(
      "🥣 Melt 3 cups softened butter, then add 1–1 1/2 cups flour.",
    );
    expect(
      projected.instructions[0].highlights.map((span) =>
        projected.instructions[0].text.slice(span.start, span.end),
      ),
    ).toEqual(["softened butter", "flour"]);
    expect(interpretation?.instructions[0].references[0].start).toBe(
      recipe.instructions[0].indexOf("softened butter"),
    );
  });

  it("resolves repeated literal references and skips oil used as a verb", () => {
    const recipe = {
      ingredients: ["1 tbsp olive oil"],
      instructions: ["oil a pan. Add oil, then oil."],
    };
    const interpretation = buildSemanticInterpretation(recipe, {
      ingredients: [{ index: 0, name: "olive oil" }],
      references: [{ step: 0, ingredient: 0, text: "oil" }],
    });
    expect(
      interpretation?.instructions[0].references.map((ref) => ref.start),
    ).toEqual([15, 25]);
  });

  it("preserves intentional exclusions for every instruction", () => {
    const interpretation = buildSemanticInterpretation(source, {
      ingredients: [{ index: 0, name: "butter" }],
      references: [],
    });
    expect(interpretation).toBeDefined();
    expect(
      projectRecipe({ ...source, interpretation }, 2).instructions[0],
    ).toEqual({ text: source.instructions[0], highlights: [] });
  });

  it.each([
    { ingredients: [], references: [] },
    { ingredients: [{ index: 1, name: "butter" }], references: [] },
    { ingredients: [{ index: 0, name: "Butter" }], references: [] },
    { ingredients: [{ index: 0, name: "tbsp" }], references: [] },
    { ingredients: [{ index: 0, name: "butter", value: 900 }], references: [] },
    {
      ingredients: [{ index: 0, name: "butter" }],
      references: [{ step: 1, ingredient: 0, text: "butter" }],
    },
    {
      ingredients: [{ index: 0, name: "butter" }],
      references: [{ step: 0, ingredient: 9, text: "butter" }],
    },
    {
      ingredients: [{ index: 0, name: "butter" }],
      references: [{ step: 0, ingredient: 0, text: "butter", start: 12 }],
    },
    {
      ingredients: [{ index: 0, name: "butter" }],
      references: [{ step: 0, ingredient: 0, text: "margarine" }],
    },
    {
      ingredients: [{ index: 0, name: "butter" }],
      references: [
        { step: 0, ingredient: 0, text: "butter" },
        { step: 0, ingredient: 0, text: "butter" },
      ],
    },
  ])(
    "rejects malformed, invented, or unsupported semantic claims: %j",
    (semantics) => {
      expect(buildSemanticInterpretation(source, semantics)).toBeUndefined();
    },
  );

  it("retains longest names and refuses ambiguous duplicate ownership", () => {
    const recipe = {
      ingredients: ["1 red onion", "1 white onion"],
      instructions: ["Add red onion, then onion."],
    };
    const ingredients = [
      { index: 0, name: "onion" },
      { index: 1, name: "white onion" },
    ];
    expect(
      buildSemanticInterpretation(recipe, {
        ingredients,
        references: [{ step: 0, ingredient: 0, text: "red onion" }],
      }),
    ).toBeDefined();
    expect(
      buildSemanticInterpretation(recipe, {
        ingredients,
        references: [{ step: 0, ingredient: 0, text: "onion" }],
      }),
    ).toBeUndefined();
    const duplicates = {
      ingredients: ["1 tsp salt", "2 tsp salt"],
      instructions: ["Add salt."],
    };
    expect(
      buildSemanticInterpretation(duplicates, {
        ingredients: [
          { index: 0, name: "salt" },
          { index: 1, name: "salt" },
        ],
        references: [{ step: 0, ingredient: 0, text: "salt" }],
      }),
    ).toBeUndefined();
    expect(
      buildSemanticInterpretation(duplicates, {
        ingredients: [
          { index: 0, name: "salt" },
          { index: 0, name: "salt" },
        ],
        references: [],
      }),
    ).toBeUndefined();
  });

  it.each([
    ["1 onion (2 cups diced, 240g)", "2 onion (4 cups diced, 480g)"],
    ["1 onion ( 2 cups diced, 240 g)", "2 onion ( 4 cups diced, 480 g)"],
    ["1 cup / 120g flour", "2 cups / 240g flour"],
    ["1 1/2 cups / 180 g flour", "3 cups / 360 g flour"],
    ["1 cup (120g) flour (sifted)", "2 cups (240g) flour (sifted)"],
    ["2 cans tomatoes (400g each)", "4 cans tomatoes (400g each)"],
    ["14 oz / 400g can tomatoes", "14 oz / 400g can tomatoes"],
    ["14-ounce (400g) can tomatoes", "14-ounce (400g) can tomatoes"],
    ["2 cans / 400g tomatoes", "4 cans / 400g tomatoes"],
    ["1 onion (dice into 2 cm pieces)", "2 onion (dice into 2 cm pieces)"],
    ["1 onion (roast at 350°F)", "2 onion (roast at 350°F)"],
    ["1 onion (2 cups water)", "2 onion (2 cups water)"],
  ])(
    "scales only supported publisher measurements: %s",
    (ingredient, expected) => {
      expect(
        projectRecipe({ ingredients: [ingredient], instructions: [] }, 2)
          .ingredients,
      ).toEqual([expected]);
    },
  );

  it("builds reference-only semantics from local identities and deduplicates aliases across steps", () => {
    const recipe = {
      ingredients: [
        "1 cup light brown sugar or dark brown sugar",
        "1 cup chocolate chips or chopped chocolate",
      ],
      instructions: Array.from(
        { length: 60 },
        () => "Add brown sugar and chocolate chips.",
      ),
    };
    const interpretation = buildSemanticInterpretation(recipe, {
      references: recipe.instructions.flatMap((_, step) => [
        { step, ingredient: 0, text: "brown sugar" },
        { step, ingredient: 1, text: "chocolate chips" },
      ]),
    });
    expect(interpretation).toBeDefined();
    expect(interpretation?.ingredients[0].name).toBe(
      "light brown sugar or dark brown sugar",
    );
    expect(
      interpretation?.ingredients[0].aliases.filter(
        (alias) => alias === "brown sugar",
      ),
    ).toHaveLength(1);
    expect(interpretation?.instructions).toHaveLength(60);
    expect(
      interpretation?.instructions.every(
        (instruction) => instruction.references.length === 2,
      ),
    ).toBe(true);
    expect(
      buildSemanticInterpretation(source, { references: [] })?.instructions[0]
        .references,
    ).toEqual([]);
  });

  it("supports literal names within publisher alternatives", () => {
    const recipe = {
      ingredients: [
        "1 cup light brown sugar or dark brown sugar",
        "1 cup chocolate chips or chopped chocolate",
      ],
      instructions: ["Add brown sugar and chocolate chips."],
    };
    expect(
      buildSemanticInterpretation(recipe, {
        ingredients: [
          { index: 0, name: "brown sugar" },
          { index: 1, name: "chocolate chips" },
        ],
        references: [
          { step: 0, ingredient: 0, text: "brown sugar" },
          { step: 0, ingredient: 1, text: "chocolate chips" },
        ],
      }),
    ).toBeDefined();
  });

  it("does not let narrowed semantic names erase original ownership", () => {
    const recipe = {
      ingredients: ["1 cup softened butter", "1 cup cold butter"],
      instructions: ["Add butter."],
    };
    expect(
      buildSemanticInterpretation(recipe, {
        ingredients: [
          { index: 0, name: "softened butter" },
          { index: 1, name: "cold" },
        ],
        references: [{ step: 0, ingredient: 0, text: "butter" }],
      }),
    ).toBeUndefined();
  });

  it("keeps package equivalents fixed while retaining their local ingredient identity", () => {
    const recipe = {
      ingredients: ["14-ounce (400g) can tomatoes"],
      instructions: ["Add tomatoes."],
    };
    const interpretation = buildSemanticInterpretation(recipe, {
      references: [{ step: 0, ingredient: 0, text: "tomatoes" }],
    });
    expect(interpretation).toBeDefined();
    expect(interpretation?.ingredients[0].name).toBe("tomatoes");
    expect(projectRecipe({ ...recipe, interpretation }, 2).ingredients).toEqual(
      recipe.ingredients,
    );
  });

  it("resolves a quoted preparation prefix to its unique literal core with Unicode offsets", () => {
    const recipe = {
      ingredients: [
        "2 cups (340g) semisweet chocolate chips or one (180g) chocolate bar, chopped",
      ],
      instructions: ["🥣 Add finely chopped chocolate, then chocolate."],
    };
    const interpretation = buildSemanticInterpretation(recipe, {
      references: [
        { step: 0, ingredient: 0, text: "finely chopped chocolate" },
      ],
    });
    expect(interpretation).toBeDefined();
    expect(interpretation?.instructions[0].references).toEqual([
      {
        start: recipe.instructions[0].indexOf("chocolate"),
        end: recipe.instructions[0].indexOf("chocolate") + "chocolate".length,
        text: "chocolate",
        ingredientId: "ingredient-0",
      },
    ]);
  });

  it("preserves a complete preparation phrase when it is already an ingredient identity", () => {
    const recipe = {
      ingredients: ["1 cup chopped tomatoes"],
      instructions: ["Add chopped tomatoes."],
    };
    const interpretation = buildSemanticInterpretation(recipe, {
      references: [{ step: 0, ingredient: 0, text: "chopped tomatoes" }],
    });
    expect(interpretation?.instructions[0].references[0].text).toBe(
      "chopped tomatoes",
    );
    expect(
      buildSemanticInterpretation(recipe, {
        references: [
          { step: 0, ingredient: 0, text: "chopped tomatoes" },
          { step: 0, ingredient: 0, text: "tomatoes" },
        ],
      }),
    ).toBeUndefined();
  });

  it.each([
    {
      ingredients: ["1 cup chocolate"],
      instruction: "Add chocolate.",
      text: "chopped chocolate",
      ingredient: 0,
    },
    {
      ingredients: ["1 cup chickpeas"],
      instruction: "Add chopped garbanzo beans.",
      text: "chopped garbanzo beans",
      ingredient: 0,
    },
    {
      ingredients: ["1 cup chocolate", "1 cup flour"],
      instruction: "Add chopped chocolate.",
      text: "chopped chocolate",
      ingredient: 1,
    },
    {
      ingredients: ["1 cup chocolate"],
      instruction: "Add 2 cups chocolate.",
      text: "2 cups chocolate",
      ingredient: 0,
    },
    {
      ingredients: ["1 cup dark chocolate", "1 cup milk chocolate"],
      instruction: "Add chopped chocolate.",
      text: "chopped chocolate",
      ingredient: 0,
    },
  ])(
    "rejects unsupported preparation phrase claims: %j",
    ({ ingredients, instruction, text, ingredient }) => {
      expect(
        buildSemanticInterpretation(
          { ingredients, instructions: [instruction] },
          { references: [{ step: 0, ingredient, text }] },
        ),
      ).toBeUndefined();
    },
  );

  it("supports source names and amounts after slash equivalents", () => {
    const recipe = {
      ingredients: ["1 cup / 120g flour"],
      instructions: ["Add 1 cup flour."],
    };
    const interpretation = buildSemanticInterpretation(recipe, {
      ingredients: [{ index: 0, name: "flour" }],
      references: [{ step: 0, ingredient: 0, text: "flour" }],
    });
    expect(interpretation).toBeDefined();
    expect(
      projectRecipe({ ...recipe, interpretation }, 2).instructions[0].text,
    ).toBe("Add 2 cups flour.");
  });
});

describe("incomplete measurement warnings", () => {
  it("flags unhandled publisher equivalents without changing source or interpretation acceptance", () => {
    const recipe = {
      ingredients: ["1.5 cups dry lentils (275g, about half a bag)"],
      instructions: ["Add lentils."],
    };
    const interpretation = buildSemanticInterpretation(recipe, {
      references: [{ step: 0, ingredient: 0, text: "lentils" }],
    });
    expect(interpretation).toBeDefined();
    const warnings = incompleteMeasurementWarnings(recipe, interpretation);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Some measured amounts cannot be scaled");
    const projected = projectRecipe({ ...recipe, interpretation }, 2);
    expect(projected.ingredients).toEqual([
      "3 cups dry lentils (275g, about half a bag)",
    ]);
    expect(projected.warnings).toEqual(warnings);
    expect(projectRecipe({ ...recipe, interpretation }, 1).warnings).toEqual(
      [],
    );
  });

  it("flags divided instruction equivalents omitted by supported quantities", () => {
    const recipe = {
      ingredients: ["330g flour"],
      instructions: [
        "Add 2 tbsp (23g) flour, then the remaining flour (307g).",
      ],
    };
    const interpretation = buildSemanticInterpretation(recipe, {
      references: [{ step: 0, ingredient: 0, text: "flour" }],
    });
    expect(interpretation).toBeDefined();
    expect(incompleteMeasurementWarnings(recipe, interpretation)).toHaveLength(
      1,
    );
    expect(projectRecipe({ ...recipe, interpretation }, 2).warnings).toContain(
      incompleteMeasurementWarnings(recipe, interpretation)[0],
    );
  });

  it("warns about omitted counted step amounts after saving validated metadata", () => {
    const recipe = { ingredients: ["2 eggs"], instructions: ["Beat 2 eggs."] };
    const interpretation = buildSemanticInterpretation(
      recipe,
      { references: [{ step: 0, ingredient: 0, text: "egg whites" }] },
      { onUnsupportedReference: () => undefined },
    );
    expect(interpretation).toBeDefined();
    const persisted = JSON.parse(JSON.stringify(interpretation)) as unknown;
    const result = projectRecipe({ ...recipe, interpretation: persisted }, 2);
    expect(result.ingredients).toEqual(["4 eggs"]);
    expect(result.instructions[0]).toEqual({
      text: "Beat 2 eggs.",
      highlights: [],
    });
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("cannot be scaled automatically");
    expect(incompleteMeasurementWarnings(recipe)).toEqual([]);
  });

  it("does not warn about excluded relative fractions or equipment numbers", () => {
    const recipe = {
      ingredients: ["2 eggs"],
      instructions: [
        "Add 1/2 of the eggs. Cook for 2 minutes at 200°C in a 9-inch pan.",
      ],
    };
    const interpretation = buildSemanticInterpretation(recipe, {
      references: [],
    });
    expect(interpretation).toBeDefined();
    expect(incompleteMeasurementWarnings(recipe, interpretation)).toEqual([]);
  });

  it("flags written alternative counts when their numeric equivalents scale", () => {
    const recipe = {
      ingredients: [
        "2 cups (340g) semisweet chocolate chips or one (180g) chocolate bar, chopped",
      ],
      instructions: [],
    };
    expect(incompleteMeasurementWarnings(recipe)).toEqual([
      "Written ingredient counts remain unchanged while their measured equivalents scale. Check alternative ingredient amounts when changing servings.",
    ]);
    expect(projectRecipe(recipe, 2).ingredients[0]).toContain("or one (360g)");
    expect(projectRecipe(recipe, 2).warnings).toEqual(
      incompleteMeasurementWarnings(recipe),
    );
  });

  it.each([
    {
      ingredients: ["1 cup (120g) flour"],
      instructions: [
        "Add 1 cup flour. Bake at 350°F for 20 minutes in a 9-inch pan.",
      ],
    },
    {
      ingredients: ["2 packages (8 oz each) cream cheese"],
      instructions: ["Add 2 packages of 8 oz cream cheese."],
    },
    {
      ingredients: ["14-ounce (400g) can tomatoes"],
      instructions: ["Add a 14 oz can of tomatoes."],
    },
    {
      ingredients: ["Salt to taste"],
      instructions: ["Wait 10 minutes. Use a 20cm tin at 200°C."],
    },
    { ingredients: ["2 cans tomatoes (400g each, drained)"], instructions: [] },
  ])(
    "does not flag supported amounts, fixed packages, or equipment: %j",
    (recipe) => {
      expect(incompleteMeasurementWarnings(recipe)).toEqual([]);
    },
  );
});

describe("review-required reference omission", () => {
  it("retains valid references and local quantities while reporting unsupported claims", () => {
    const recipe = {
      ingredients: ["1 cup butter", "1 cup chickpeas"],
      instructions: ["Add 1 cup butter and garbanzo beans."],
    };
    const semantics = {
      references: [
        { step: 0, ingredient: 0, text: "butter" },
        { step: 0, ingredient: 1, text: "garbanzo beans" },
        { step: 0, ingredient: 9, text: "butter" },
        { step: 9, ingredient: 0, text: "butter" },
        { step: 0, ingredient: 0, text: "1 cup butter" },
        { step: 0, ingredient: 0, text: "margarine" },
        { step: 0, ingredient: 0, text: "butter" },
      ],
    };
    expect(buildSemanticInterpretation(recipe, semantics)).toBeUndefined();
    let omitted = 0;
    const interpretation = buildSemanticInterpretation(recipe, semantics, {
      onUnsupportedReference: () => {
        omitted += 1;
      },
    });
    expect(omitted).toBe(6);
    expect(interpretation).toBeDefined();
    expect(validateInterpretation(recipe, interpretation)).toEqual(
      interpretation,
    );
    expect(
      interpretation?.instructions[0].references.map((ref) => ref.text),
    ).toEqual(["butter"]);
    expect(
      interpretation?.ingredients.flatMap((item) => item.aliases),
    ).not.toContain("garbanzo beans");
    expect(
      projectRecipe({ ...recipe, interpretation }, 2).instructions[0].text,
    ).toBe("Add 2 cups butter and garbanzo beans.");
  });

  it("returns validated empty references when every claim is unsupported", () => {
    let omitted = 0;
    const interpretation = buildSemanticInterpretation(
      source,
      { references: [{ step: 0, ingredient: 0, text: "margarine" }] },
      {
        onUnsupportedReference: () => {
          omitted += 1;
        },
      },
    );
    expect(omitted).toBe(1);
    expect(interpretation).toBeDefined();
    expect(validateInterpretation(source, interpretation)).toEqual(
      interpretation,
    );
    expect(interpretation?.instructions[0]).toEqual({
      index: 0,
      references: [],
      quantities: [],
    });
  });

  it("reports unsupported overlaps and verb references while retaining the longest valid phrase", () => {
    const recipe = {
      ingredients: ["1 cup chopped tomatoes", "1 tbsp oil"],
      instructions: ["Oil a pan. Add chopped tomatoes."],
    };
    let omitted = 0;
    const interpretation = buildSemanticInterpretation(
      recipe,
      {
        references: [
          { step: 0, ingredient: 0, text: "chopped tomatoes" },
          { step: 0, ingredient: 0, text: "tomatoes" },
          { step: 0, ingredient: 1, text: "Oil" },
        ],
      },
      {
        onUnsupportedReference: () => {
          omitted += 1;
        },
      },
    );
    expect(omitted).toBe(2);
    expect(
      interpretation?.instructions[0].references.map((ref) => ref.text),
    ).toEqual(["chopped tomatoes"]);
  });

  it("bounds unique aliases while preserving validated references already accepted", () => {
    const words = Array.from(
      { length: 55 },
      (_, index) =>
        `spice${String.fromCharCode(97 + Math.floor(index / 26))}${String.fromCharCode(97 + (index % 26))}`,
    );
    const recipe = {
      ingredients: [`1 cup ${words.join(" ")}`],
      instructions: words.map((word) => `Add ${word}.`),
    };
    let omitted = 0;
    const interpretation = buildSemanticInterpretation(
      recipe,
      {
        references: words.map((text, step) => ({ step, ingredient: 0, text })),
      },
      {
        onUnsupportedReference: () => {
          omitted += 1;
        },
      },
    );
    expect(omitted).toBeGreaterThan(0);
    expect(interpretation).toBeDefined();
    expect(interpretation?.ingredients[0].aliases).toHaveLength(50);
    expect(validateInterpretation(recipe, interpretation)).toEqual(
      interpretation,
    );
  });

  it("still rejects malformed schemas and ingredient identity claims", () => {
    const options = {
      onUnsupportedReference: () => {
        throw new Error("Malformed schemas must not use omission");
      },
    };
    expect(
      buildSemanticInterpretation(
        source,
        { ingredients: [{ index: 0, name: "margarine" }], references: [] },
        options,
      ),
    ).toBeUndefined();
    const malformed = {
      references: [{ step: 0, ingredient: 0, text: "butter", start: 12 }],
    };
    expect(
      buildSemanticInterpretation(source, malformed, options),
    ).toBeUndefined();
  });
});
