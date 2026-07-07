import { describe, it, expect } from "vitest";
import {
  serializeRecipeExport,
  parseRecipeExport,
  EXPORT_VERSION,
} from "./recipe-export";
import type { Recipe } from "@/types";

const recipe = (overrides: Partial<Recipe> = {}): Recipe => ({
  id: "r1",
  title: "Test Pasta",
  image: "https://example.com/img.jpg",
  ingredients: ["8 oz spaghetti", "1 cup tomato sauce"],
  instructions: ["Boil pasta.", "Add sauce."],
  sourceUrl: "https://example.com/pasta",
  tags: ["dinner", "italian"],
  createdAt: "2026-07-01T00:00:00Z",
  prepTime: "PT10M",
  cookTime: "PT20M",
  totalTime: "PT30M",
  servings: "4",
  author: "Chef",
  cuisineType: "Italian",
  difficulty: "Easy",
  rating: 5,
  isFavorite: true,
  notes: "Family favorite",
  ...overrides,
});

describe("serializeRecipeExport", () => {
  it("produces a versioned envelope with all recipes", () => {
    const json = serializeRecipeExport([recipe()]);
    const parsed = JSON.parse(json);

    expect(parsed.app).toBe("cooksnap");
    expect(parsed.version).toBe(EXPORT_VERSION);
    expect(typeof parsed.exportedAt).toBe("string");
    expect(parsed.recipes).toHaveLength(1);
    expect(parsed.recipes[0].title).toBe("Test Pasta");
  });
});

describe("parseRecipeExport", () => {
  it("round-trips all recipe fields", () => {
    const original = recipe();
    const imported = parseRecipeExport(serializeRecipeExport([original]));

    expect(imported).toHaveLength(1);
    const r = imported[0];
    expect(r.title).toBe(original.title);
    expect(r.image).toBe(original.image);
    expect(r.ingredients).toEqual(original.ingredients);
    expect(r.instructions).toEqual(original.instructions);
    expect(r.sourceUrl).toBe(original.sourceUrl);
    expect(r.tags).toEqual(original.tags);
    expect(r.prepTime).toBe(original.prepTime);
    expect(r.servings).toBe(original.servings);
    expect(r.difficulty).toBe("Easy");
    expect(r.rating).toBe(5);
    expect(r.isFavorite).toBe(true);
    expect(r.notes).toBe(original.notes);
  });

  it("rejects invalid JSON", () => {
    expect(() => parseRecipeExport("not json{{{")).toThrow(/valid/i);
  });

  it("rejects JSON without the cooksnap envelope", () => {
    expect(() => parseRecipeExport(JSON.stringify({ recipes: [] }))).toThrow(
      /cooksnap export/i
    );
  });

  it("rejects unsupported versions", () => {
    const json = JSON.stringify({ app: "cooksnap", version: 999, recipes: [] });
    expect(() => parseRecipeExport(json)).toThrow(/version/i);
  });

  it("skips entries without a valid title or ingredient/instruction arrays", () => {
    const json = JSON.stringify({
      app: "cooksnap",
      version: EXPORT_VERSION,
      exportedAt: "2026-07-07T00:00:00Z",
      recipes: [
        { title: "", ingredients: [], instructions: [] },
        { title: "Valid", ingredients: ["1 egg"], instructions: ["Fry."] },
        { title: "Bad shape", ingredients: "nope", instructions: [] },
      ],
    });

    const imported = parseRecipeExport(json);
    expect(imported).toHaveLength(1);
    expect(imported[0].title).toBe("Valid");
  });

  it("fills defaults and sanitizes invalid optional fields", () => {
    const json = JSON.stringify({
      app: "cooksnap",
      version: EXPORT_VERSION,
      recipes: [
        {
          title: "Sparse",
          ingredients: ["1 egg"],
          instructions: ["Fry."],
          rating: 42,
          difficulty: "Impossible",
          isFavorite: "yes",
          ingredientsExtra: "ignored",
        },
      ],
    });

    const [r] = parseRecipeExport(json);
    expect(r.sourceUrl).toBe("");
    expect(r.tags).toEqual([]);
    expect(r.image).toBeNull();
    expect(r.rating).toBeNull();
    expect(r.difficulty).toBeNull();
    expect(r.isFavorite).toBe(false);
    expect(r.notes).toBeNull();
  });

  it("filters non-string entries out of ingredient/instruction arrays", () => {
    const json = JSON.stringify({
      app: "cooksnap",
      version: EXPORT_VERSION,
      recipes: [
        {
          title: "Mixed",
          ingredients: ["1 egg", 42, null, "salt"],
          instructions: ["Fry.", {}],
        },
      ],
    });

    const [r] = parseRecipeExport(json);
    expect(r.ingredients).toEqual(["1 egg", "salt"]);
    expect(r.instructions).toEqual(["Fry."]);
  });
});
