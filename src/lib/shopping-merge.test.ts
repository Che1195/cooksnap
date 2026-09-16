import { describe, it, expect } from "vitest";
import { buildGeneratedItems, planShoppingMerge } from "./shopping-merge";
import type { MealPlan, Recipe, ShoppingItem } from "@/types";

const fullRecipe = (id: string, ingredients: string[]): Recipe => ({
  id,
  title: `Recipe ${id}`,
  image: null,
  ingredients,
  instructions: ["Cook"],
  sourceUrl: "",
  tags: [],
  createdAt: "2026-07-01T00:00:00Z",
});

const emptyDay = { breakfast: [], lunch: [], dinner: [], snack: [] };

describe("buildGeneratedItems", () => {
  it("attributes merged items to a contributing recipe", () => {
    const plan: MealPlan = {
      "2026-07-06": {
        ...emptyDay,
        breakfast: [{ recipeId: "r1", isLeftover: false, position: 0 }],
        lunch: [{ recipeId: "r2", isLeftover: false, position: 0 }],
      },
    };

    const items = buildGeneratedItems(["2026-07-06"], plan, [
      fullRecipe("r1", ["1 egg"]),
      fullRecipe("r2", ["1 cup rice", "2 cups rice"]),
    ]);

    const rice = items.find((i) => i.text.includes("rice"));
    expect(rice?.recipeId).toBe("r2");
    expect(items.find((i) => i.text.includes("egg"))?.recipeId).toBe("r1");
  });

  it("aggregates duplicate ingredients across recipes", () => {
    const plan: MealPlan = {
      "2026-07-06": {
        ...emptyDay,
        dinner: [
          { recipeId: "r1", isLeftover: false, position: 0 },
          { recipeId: "r2", isLeftover: false, position: 1 },
        ],
      },
    };

    const items = buildGeneratedItems(["2026-07-06"], plan, [
      fullRecipe("r1", ["1 cup rice"]),
      fullRecipe("r2", ["2 cups rice"]),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0].text).toContain("3");
    expect(items[0].text).toContain("rice");
  });

  it("skips leftovers, section headers, dates with no plan, and unknown recipes", () => {
    const plan: MealPlan = {
      "2026-07-06": {
        ...emptyDay,
        breakfast: [{ recipeId: "r1", isLeftover: true, position: 0 }],
        lunch: [{ recipeId: "missing", isLeftover: false, position: 0 }],
        dinner: [{ recipeId: "r2", isLeftover: false, position: 0 }],
      },
    };

    const items = buildGeneratedItems(["2026-07-06", "2026-07-07"], plan, [
      fullRecipe("r1", ["1 egg"]),
      fullRecipe("r2", ["## For the sauce", "1 cup rice"]),
    ]);

    expect(items.map((i) => i.text)).toEqual(["1 cup rice"]);
  });
});

describe("planShoppingMerge", () => {
  it("does not merge distinct ingredients that share words", () => {
    const existing: ShoppingItem[] = [
      { id: "s1", text: "1 red pepper", checked: false },
    ];

    const { toUpdate, toInsert } = planShoppingMerge(existing, [
      "1 tsp red pepper flakes",
    ]);

    expect(toUpdate).toEqual([]);
    expect(toInsert).toHaveLength(1);
    expect(toInsert[0]).toContain("flakes");
  });

  it("updates an existing line when quantities merge", () => {
    const existing: ShoppingItem[] = [
      { id: "s1", text: "1 cup rice", checked: false },
    ];

    const { toUpdate, toInsert } = planShoppingMerge(existing, ["2 cups rice"]);

    expect(toInsert).toEqual([]);
    expect(toUpdate).toHaveLength(1);
    expect(toUpdate[0].id).toBe("s1");
    expect(toUpdate[0].text).toContain("3");
  });

  it("never aggregates existing rows against each other", () => {
    const existing: ShoppingItem[] = [
      { id: "s1", text: "1 cup rice", checked: false },
      { id: "s2", text: "2 cups rice", checked: false },
    ];

    const { toUpdate, toInsert } = planShoppingMerge(existing, ["1 cup rice"]);

    expect(toInsert).toEqual([]);
    expect(toUpdate).toEqual([{ id: "s1", text: "2 cups rice" }]);
    expect(toUpdate.some((u) => u.id === "s2")).toBe(false);
  });

  it("leaves checked items alone and inserts the new line instead", () => {
    const existing: ShoppingItem[] = [
      { id: "s1", text: "1 cup rice", checked: true },
    ];

    const { toUpdate, toInsert } = planShoppingMerge(existing, ["2 cups rice"]);

    expect(toUpdate).toEqual([]);
    expect(toInsert).toEqual(["2 cups rice"]);
  });

  it("plans nothing when an unquantified ingredient already exists (case-insensitive)", () => {
    const existing: ShoppingItem[] = [
      { id: "s1", text: "Milk", checked: false },
      { id: "s2", text: "Eggs", checked: false },
    ];

    expect(planShoppingMerge(existing, ["milk", "eggs"])).toEqual({
      toUpdate: [],
      toInsert: [],
    });
  });

  it("skips section headers", () => {
    expect(planShoppingMerge([], ["## For the sauce", "1 egg"])).toEqual({
      toUpdate: [],
      toInsert: ["1 egg"],
    });
  });
});

describe("projection shopping roundtrip", () => {
  it("preserves package sizes, ranges, equivalents and qualitative tails on repeated additions", () => {
    const lines = [
      "2-4 tbsp butter",
      "1 (14 oz) can tomatoes",
      "2 cups (240g) flour",
      "2 cups flour, plus more",
    ];
    const first = planShoppingMerge([], lines);
    expect(first.toInsert).toEqual(lines);
    const existing = first.toInsert.map((text, index) => ({
      id: `s${index}`,
      text,
      checked: false,
    }));
    const second = planShoppingMerge(existing, lines);
    expect(second.toUpdate).toEqual([]);
    expect(second.toInsert).toEqual(lines);
  });
  it("updates the compatible row without losing an incompatible amount", () => {
    const existing = [
      { id: "cups", text: "1 cup rice", checked: false },
      { id: "grams", text: "100 g rice", checked: false },
    ];
    expect(planShoppingMerge(existing, ["100 g rice"])).toEqual({
      toUpdate: [{ id: "grams", text: "200 g rice" }],
      toInsert: [],
    });
  });
});

it("weekly generation keeps source yields and complex amounts", () => {
  const plan: MealPlan = {
    "2026-07-06": {
      ...emptyDay,
      dinner: [{ recipeId: "r1", isLeftover: false, position: 0 }],
    },
  };
  const ingredients = [
    "1-2 tbsp butter",
    "2 (14 oz) cans tomatoes",
    "1 cup (120g) flour",
  ];
  const recipe = { ...fullRecipe("r1", ingredients), servings: "4-6" };
  expect(
    buildGeneratedItems(["2026-07-06"], plan, [recipe]).map(
      (item) => item.text,
    ),
  ).toEqual(ingredients);
});

it.each([
  "100% whole wheat flour",
  "9-inch pastry sheet",
  "14 cm pastry sheet",
  "350°F water",
  "350 F water",
])(
  "preserves descriptive numerals when adding %s to an existing list",
  (line) => {
    expect(
      planShoppingMerge([{ id: "s1", text: line, checked: false }], [line]),
    ).toEqual({ toUpdate: [], toInsert: [line] });
  },
);
