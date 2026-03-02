// ---------------------------------------------------------------------------
// Tests for ingredient-aggregator — merging duplicate shopping list items
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import {
  normalizeIngredientName,
  normalizeUnit,
  canConvertUnits,
  convertQuantity,
  aggregateIngredients,
} from "./ingredient-aggregator";

// ---------------------------------------------------------------------------
// normalizeIngredientName
// ---------------------------------------------------------------------------

describe("normalizeIngredientName", () => {
  it("lowercases and trims", () => {
    expect(normalizeIngredientName("  Garlic  ")).toBe("garlic");
  });

  it("collapses whitespace", () => {
    expect(normalizeIngredientName("red  bell   pepper")).toBe("red bell pepper");
  });

  it("strips trailing s for basic plurals", () => {
    expect(normalizeIngredientName("onions")).toBe("onion");
    expect(normalizeIngredientName("carrots")).toBe("carrot");
  });

  it("handles -oes plurals (tomatoes → tomato)", () => {
    expect(normalizeIngredientName("tomatoes")).toBe("tomato");
    expect(normalizeIngredientName("potatoes")).toBe("potato");
  });

  it("handles -ies plurals (berries → berry)", () => {
    expect(normalizeIngredientName("berries")).toBe("berry");
    expect(normalizeIngredientName("anchovies")).toBe("anchovy");
  });

  it("handles -ves plurals (leaves → leaf)", () => {
    expect(normalizeIngredientName("leaves")).toBe("leaf");
  });

  it("does not depluralize short words", () => {
    expect(normalizeIngredientName("gas")).toBe("gas");
  });

  it("does not depluralize exception words", () => {
    expect(normalizeIngredientName("hummus")).toBe("hummus");
    expect(normalizeIngredientName("couscous")).toBe("couscous");
    expect(normalizeIngredientName("asparagus")).toBe("asparagus");
  });
});

// ---------------------------------------------------------------------------
// normalizeUnit
// ---------------------------------------------------------------------------

describe("normalizeUnit", () => {
  it("returns null for null input", () => {
    expect(normalizeUnit(null)).toBeNull();
  });

  it("maps plural to canonical", () => {
    expect(normalizeUnit("cups")).toBe("cup");
    expect(normalizeUnit("tablespoons")).toBe("tbsp");
    expect(normalizeUnit("teaspoons")).toBe("tsp");
    expect(normalizeUnit("ounces")).toBe("oz");
    expect(normalizeUnit("pounds")).toBe("lb");
    expect(normalizeUnit("lbs")).toBe("lb");
  });

  it("handles case insensitivity", () => {
    expect(normalizeUnit("Cups")).toBe("cup");
    expect(normalizeUnit("TBSP")).toBe("tbsp");
  });

  it("passes through unknown units lowercased", () => {
    expect(normalizeUnit("quart")).toBe("quart");
  });
});

// ---------------------------------------------------------------------------
// canConvertUnits / convertQuantity
// ---------------------------------------------------------------------------

describe("canConvertUnits", () => {
  it("returns true for same-family volume units", () => {
    expect(canConvertUnits("tsp", "tbsp")).toBe(true);
    expect(canConvertUnits("tbsp", "cup")).toBe(true);
    expect(canConvertUnits("tsp", "cup")).toBe(true);
  });

  it("returns true for same-family weight units", () => {
    expect(canConvertUnits("oz", "lb")).toBe(true);
    expect(canConvertUnits("g", "kg")).toBe(true);
  });

  it("returns false for cross-family units", () => {
    expect(canConvertUnits("cup", "oz")).toBe(false);
    expect(canConvertUnits("tsp", "g")).toBe(false);
    expect(canConvertUnits("lb", "kg")).toBe(false);
  });

  it("returns false for unknown units", () => {
    expect(canConvertUnits("clove", "bunch")).toBe(false);
  });
});

describe("convertQuantity", () => {
  it("converts tsp to tbsp", () => {
    expect(convertQuantity(3, "tsp", "tbsp")).toBeCloseTo(1);
  });

  it("converts tbsp to cup", () => {
    expect(convertQuantity(16, "tbsp", "cup")).toBeCloseTo(1);
  });

  it("converts oz to lb", () => {
    expect(convertQuantity(16, "oz", "lb")).toBeCloseTo(1);
  });

  it("converts g to kg", () => {
    expect(convertQuantity(1000, "g", "kg")).toBeCloseTo(1);
  });
});

// ---------------------------------------------------------------------------
// aggregateIngredients
// ---------------------------------------------------------------------------

describe("aggregateIngredients", () => {
  it("returns empty array for empty input", () => {
    expect(aggregateIngredients([])).toEqual([]);
  });

  it("passes through single items unchanged", () => {
    const result = aggregateIngredients(["1 cup rice"]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("1 cup rice");
  });

  it("sums same ingredient with same unit", () => {
    const result = aggregateIngredients(["1 cup rice", "2 cups rice"]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("3 cups rice");
  });

  it("sums with fractional quantities", () => {
    const result = aggregateIngredients(["1/2 cup flour", "1/4 cup flour"]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("3/4 cup flour");
  });

  it("converts compatible volume units (tbsp → cup)", () => {
    // 1 cup + 8 tbsp = 1 cup + 0.5 cup = 1.5 cups
    const result = aggregateIngredients(["1 cup olive oil", "8 tbsp olive oil"]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("1 1/2 cups olive oil");
  });

  it("converts tsp to tbsp when merging", () => {
    // 1 tbsp + 3 tsp = 1 tbsp + 1 tbsp = 2 tbsp
    const result = aggregateIngredients(["1 tbsp salt", "3 tsp salt"]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("2 tbsps salt");
  });

  it("keeps unitless items with quantities", () => {
    const result = aggregateIngredients(["1 onion", "2 onions"]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("3 onion");
  });

  it("deduplicates unquantified items", () => {
    const result = aggregateIngredients(["salt to taste", "salt to taste"]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("salt to taste");
  });

  it("keeps unquantified separate from quantified", () => {
    const result = aggregateIngredients(["salt to taste", "1 tsp salt"]);
    expect(result).toHaveLength(2);
    expect(result).toContain("salt to taste");
    expect(result).toContain("1 tsp salt");
  });

  it("strips section headers", () => {
    const result = aggregateIngredients([
      "## For the sauce:",
      "1 cup tomato sauce",
      "## For the pasta:",
      "1 cup tomato sauce",
    ]);
    expect(result).not.toContain("## For the sauce:");
    expect(result).not.toContain("## For the pasta:");
    // Tomato sauce should be aggregated without headers
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("2 cups tomato sauce");
  });

  it("merges prep notes from different entries", () => {
    const result = aggregateIngredients([
      "1 onion, diced",
      "1 onion, sliced",
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("2 onion, diced / sliced");
  });

  it("deduplicates identical prep notes", () => {
    const result = aggregateIngredients([
      "1 onion, diced",
      "1 onion, diced",
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("2 onion, diced");
  });

  it("handles plural name normalization (onions + onion)", () => {
    const result = aggregateIngredients(["1 onion", "2 onions"]);
    expect(result).toHaveLength(1);
    // Should use the first-seen display name
    expect(result[0]).toBe("3 onion");
  });

  it("handles multiple different ingredients correctly", () => {
    const result = aggregateIngredients([
      "1 cup rice",
      "2 tbsp olive oil",
      "2 cups rice",
      "1 tbsp olive oil",
    ]);
    expect(result).toHaveLength(2);
    const rice = result.find((l) => l.includes("rice"));
    const oil = result.find((l) => l.includes("olive oil"));
    expect(rice).toBe("3 cups rice");
    expect(oil).toBe("3 tbsps olive oil");
  });

  it("handles weight unit conversion (oz → lb)", () => {
    // 1 lb + 8 oz = 1 lb + 0.5 lb = 1.5 lb
    const result = aggregateIngredients(["1 lb chicken", "8 oz chicken"]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("1 1/2 lbs chicken");
  });

  it("handles metric weight conversion (g → kg)", () => {
    // 1 kg + 500 g = 1.5 kg
    const result = aggregateIngredients(["1 kg flour", "500 g flour"]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("1 1/2 kgs flour");
  });
});
