import { describe, it, expect } from "vitest";
import {
  parseIngredient,
  scaleIngredient,
  parseServings,
} from "./ingredient-parser";

// ---------------------------------------------------------------------------
// parseIngredient
// ---------------------------------------------------------------------------

describe("parseIngredient", () => {
  it("parses whole number with unit", () => {
    const r = parseIngredient("2 cups flour");
    expect(r.quantity).toBe(2);
    expect(r.unit).toBe("cups");
    expect(r.name).toBe("flour");
    expect(r.original).toBe("2 cups flour");
  });

  it("parses fraction with unit", () => {
    const r = parseIngredient("1/2 cup sugar");
    expect(r.quantity).toBe(0.5);
    expect(r.unit).toBe("cup");
    expect(r.name).toBe("sugar");
  });

  it("parses mixed number", () => {
    const r = parseIngredient("1 1/2 cups milk");
    expect(r.quantity).toBe(1.5);
    expect(r.unit).toBe("cups");
    expect(r.name).toBe("milk");
  });

  it("parses unicode fraction ¼", () => {
    const r = parseIngredient("¼ cup butter");
    expect(r.quantity).toBe(0.25);
    expect(r.unit).toBe("cup");
    expect(r.name).toBe("butter");
  });

  it("parses unicode fraction ½", () => {
    const r = parseIngredient("½ tsp salt");
    expect(r.quantity).toBe(0.5);
    expect(r.unit).toBe("tsp");
    expect(r.name).toBe("salt");
  });

  it("parses unicode fraction ⅓", () => {
    const r = parseIngredient("⅓ cup cream");
    expect(r.quantity).toBeCloseTo(1 / 3, 2);
    expect(r.unit).toBe("cup");
    expect(r.name).toBe("cream");
  });

  it("parses unicode fraction ¾", () => {
    const r = parseIngredient("¾ cup rice");
    expect(r.quantity).toBe(0.75);
    expect(r.unit).toBe("cup");
    expect(r.name).toBe("rice");
  });

  it("parses mixed number with unicode fraction", () => {
    const r = parseIngredient("1½ cups broth");
    expect(r.quantity).toBe(1.5);
    expect(r.unit).toBe("cups");
    expect(r.name).toBe("broth");
  });

  it("parses quantity without unit", () => {
    const r = parseIngredient("3 eggs");
    expect(r.quantity).toBe(3);
    expect(r.unit).toBeNull();
    expect(r.name).toBe("eggs");
  });

  it("parses ingredient with no quantity", () => {
    const r = parseIngredient("salt to taste");
    expect(r.quantity).toBeNull();
    expect(r.unit).toBeNull();
    expect(r.name).toBe("salt to taste");
  });

  it("parses range (takes first number)", () => {
    const r = parseIngredient("1-2 tbsp oil");
    expect(r.quantity).toBe(1);
    expect(r.unit).toBe("tbsp");
    expect(r.name).toBe("oil");
  });

  it("parses decimal quantity", () => {
    const r = parseIngredient("0.5 cup water");
    expect(r.quantity).toBe(0.5);
    expect(r.unit).toBe("cup");
    expect(r.name).toBe("water");
  });

  it("handles no-quantity descriptive ingredient", () => {
    const r = parseIngredient("fresh parsley");
    expect(r.quantity).toBeNull();
    expect(r.unit).toBeNull();
    expect(r.name).toBe("fresh parsley");
  });

  it("handles parenthetical sizes", () => {
    const r = parseIngredient("1 (14 oz) can tomatoes");
    expect(r.quantity).toBe(1);
    expect(r.name).toContain("tomatoes");
  });

  it("preserves original string", () => {
    const r = parseIngredient("2 cups flour");
    expect(r.original).toBe("2 cups flour");
  });

  it("handles empty string", () => {
    const r = parseIngredient("");
    expect(r.quantity).toBeNull();
    expect(r.name).toBe("");
  });

  it("parses various units", () => {
    expect(parseIngredient("1 tbsp olive oil").unit).toBe("tbsp");
    expect(parseIngredient("2 oz cheese").unit).toBe("oz");
    expect(parseIngredient("1 lb chicken").unit).toBe("lb");
    expect(parseIngredient("250 g pasta").unit).toBe("g");
    expect(parseIngredient("500 ml broth").unit).toBe("ml");
    expect(parseIngredient("1 pinch saffron").unit).toBe("pinch");
    expect(parseIngredient("2 cloves garlic").unit).toBe("cloves");
    expect(parseIngredient("1 can beans").unit).toBe("can");
  });
});

// ---------------------------------------------------------------------------
// scaleIngredient
// ---------------------------------------------------------------------------

describe("scaleIngredient", () => {
  it("doubles a simple ingredient", () => {
    const parsed = parseIngredient("2 cups flour");
    expect(scaleIngredient(parsed, 2)).toBe("4 cups flour");
  });

  it("halves a simple ingredient", () => {
    const parsed = parseIngredient("1 cup sugar");
    const result = scaleIngredient(parsed, 0.5);
    expect(result).toContain("1/2");
    expect(result).toContain("cup");
    expect(result).toContain("sugar");
  });

  it("doubles a fraction", () => {
    const parsed = parseIngredient("1/2 tsp salt");
    expect(scaleIngredient(parsed, 2)).toBe("1 tsp salt");
  });

  it("scales quantity-only ingredient", () => {
    const parsed = parseIngredient("3 eggs");
    expect(scaleIngredient(parsed, 2)).toBe("6 eggs");
  });

  it("returns original for no-quantity ingredient", () => {
    const parsed = parseIngredient("salt to taste");
    expect(scaleIngredient(parsed, 2)).toBe("salt to taste");
  });

  it("returns original when ratio is 1", () => {
    const parsed = parseIngredient("2 cups flour");
    expect(scaleIngredient(parsed, 1)).toBe("2 cups flour");
  });

  it("produces nice fractions for common values", () => {
    const parsed = parseIngredient("1 cup flour");
    expect(scaleIngredient(parsed, 0.25)).toContain("1/4");
    expect(scaleIngredient(parsed, 0.75)).toContain("3/4");
    expect(scaleIngredient(parsed, 1 / 3)).toContain("1/3");
  });

  it("produces mixed numbers", () => {
    const parsed = parseIngredient("1 cup flour");
    const result = scaleIngredient(parsed, 1.5);
    expect(result).toContain("1 1/2");
  });

  it("scales 1/4 cup by 3 to get 3/4 cup", () => {
    const parsed = parseIngredient("1/4 cup oil");
    expect(scaleIngredient(parsed, 3)).toBe("3/4 cup oil");
  });
});

// ---------------------------------------------------------------------------
// parseServings
// ---------------------------------------------------------------------------

describe("parseServings", () => {
  it("parses plain number", () => {
    expect(parseServings("4")).toBe(4);
  });

  it("parses number with text", () => {
    expect(parseServings("6 servings")).toBe(6);
  });

  it("parses 'Serves N'", () => {
    expect(parseServings("Serves 4")).toBe(4);
  });

  it("parses range (takes first)", () => {
    expect(parseServings("4-6")).toBe(4);
  });

  it("parses 'Makes N'", () => {
    expect(parseServings("Makes 12")).toBe(12);
  });

  it("returns null for null", () => {
    expect(parseServings(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(parseServings(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseServings("")).toBeNull();
  });

  it("returns null for non-numeric string", () => {
    expect(parseServings("a few")).toBeNull();
  });
});
