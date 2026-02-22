import { describe, it, expect } from "vitest";
import {
  categorizeIngredient,
  groupIngredientsByCategory,
  INGREDIENT_CATEGORIES,
} from "./ingredient-categorizer";

// ---------------------------------------------------------------------------
// categorizeIngredient
// ---------------------------------------------------------------------------

describe("categorizeIngredient", () => {
  it("categorizes produce", () => {
    expect(categorizeIngredient("onion")).toBe("Produce");
    expect(categorizeIngredient("diced tomato")).toBe("Produce");
    expect(categorizeIngredient("fresh spinach")).toBe("Produce");
  });

  it("categorizes meat & seafood", () => {
    expect(categorizeIngredient("chicken breast")).toBe("Meat & Seafood");
    expect(categorizeIngredient("ground beef")).toBe("Meat & Seafood");
    expect(categorizeIngredient("shrimp")).toBe("Meat & Seafood");
  });

  it("categorizes dairy & eggs", () => {
    expect(categorizeIngredient("butter")).toBe("Dairy & Eggs");
    expect(categorizeIngredient("eggs")).toBe("Dairy & Eggs");
    expect(categorizeIngredient("shredded cheddar")).toBe("Dairy & Eggs");
  });

  it("categorizes dry goods & baking", () => {
    expect(categorizeIngredient("all-purpose flour")).toBe("Dry Goods & Baking");
    expect(categorizeIngredient("granulated sugar")).toBe("Dry Goods & Baking");
    expect(categorizeIngredient("baking powder")).toBe("Dry Goods & Baking");
  });

  it("categorizes spices & seasonings", () => {
    expect(categorizeIngredient("salt")).toBe("Spices & Seasonings");
    expect(categorizeIngredient("ground cumin")).toBe("Spices & Seasonings");
    expect(categorizeIngredient("dried oregano")).toBe("Spices & Seasonings");
  });

  it("categorizes oils & condiments", () => {
    expect(categorizeIngredient("vegetable oil")).toBe("Oils & Condiments");
    expect(categorizeIngredient("soy sauce")).toBe("Oils & Condiments");
    expect(categorizeIngredient("balsamic vinegar")).toBe("Oils & Condiments");
  });

  it("categorizes canned & jarred", () => {
    expect(categorizeIngredient("canned black beans")).toBe("Canned & Jarred");
    expect(categorizeIngredient("chicken broth")).toBe("Canned & Jarred");
    expect(categorizeIngredient("diced tomatoes")).toBe("Canned & Jarred");
  });

  it("categorizes grains & pasta", () => {
    expect(categorizeIngredient("white rice")).toBe("Grains & Pasta");
    expect(categorizeIngredient("spaghetti")).toBe("Grains & Pasta");
    expect(categorizeIngredient("panko breadcrumbs")).toBe("Grains & Pasta");
  });

  it("categorizes nuts & seeds", () => {
    expect(categorizeIngredient("chopped walnuts")).toBe("Nuts & Seeds");
    expect(categorizeIngredient("peanut butter")).toBe("Nuts & Seeds");
    expect(categorizeIngredient("sesame seeds")).toBe("Nuts & Seeds");
  });

  it("falls back to Other for unknown items", () => {
    expect(categorizeIngredient("water")).toBe("Other");
    expect(categorizeIngredient("ice")).toBe("Other");
    expect(categorizeIngredient("food coloring")).toBe("Other");
  });

  // --- Ambiguity cases ---

  it("classifies olive oil as Oils, not Produce", () => {
    expect(categorizeIngredient("olive oil")).toBe("Oils & Condiments");
    expect(categorizeIngredient("extra virgin olive oil")).toBe("Oils & Condiments");
  });

  it("classifies tomato paste as Canned, not Produce", () => {
    expect(categorizeIngredient("tomato paste")).toBe("Canned & Jarred");
  });

  it("classifies coconut milk as Canned, not Dairy", () => {
    expect(categorizeIngredient("coconut milk")).toBe("Canned & Jarred");
  });
});

// ---------------------------------------------------------------------------
// groupIngredientsByCategory
// ---------------------------------------------------------------------------

describe("groupIngredientsByCategory", () => {
  it("preserves original indices", () => {
    const ingredients = ["2 cups flour", "1 lb chicken breast", "salt"];
    const groups = groupIngredientsByCategory(ingredients);

    const allItems = groups.flatMap((g) => g.items);
    const indices = allItems.map((item) => item.originalIndex).sort();
    expect(indices).toEqual([0, 1, 2]);
  });

  it("omits empty categories", () => {
    const ingredients = ["1 cup flour", "2 eggs"];
    const groups = groupIngredientsByCategory(ingredients);

    expect(groups.length).toBe(2);
    expect(groups.map((g) => g.category)).toEqual([
      "Dairy & Eggs",
      "Dry Goods & Baking",
    ]);
  });

  it("returns categories in display order", () => {
    const ingredients = [
      "1 cup rice",
      "2 chicken breasts",
      "1 onion",
      "salt",
      "1 tbsp olive oil",
    ];
    const groups = groupIngredientsByCategory(ingredients);
    const categories = groups.map((g) => g.category);

    // Verify order matches INGREDIENT_CATEGORIES
    for (let i = 1; i < categories.length; i++) {
      const prevIdx = INGREDIENT_CATEGORIES.indexOf(categories[i - 1]);
      const currIdx = INGREDIENT_CATEGORIES.indexOf(categories[i]);
      expect(currIdx).toBeGreaterThan(prevIdx);
    }
  });

  it("returns empty array for empty input", () => {
    expect(groupIngredientsByCategory([])).toEqual([]);
  });

  it("includes pre-parsed ingredient data", () => {
    const ingredients = ["2 cups flour"];
    const groups = groupIngredientsByCategory(ingredients);
    const item = groups[0].items[0];

    expect(item.parsed.quantity).toBe(2);
    expect(item.parsed.unit).toBe("cups");
    expect(item.parsed.name).toBe("flour");
  });
});
