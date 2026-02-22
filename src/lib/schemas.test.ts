import { describe, it, expect } from "vitest";
import { recipeSchema, storeStateSchema } from "./schemas";

describe("recipeSchema", () => {
  it("validates a complete recipe", () => {
    const recipe = {
      id: "abc123",
      title: "Test Recipe",
      image: "https://example.com/img.jpg",
      ingredients: ["1 cup flour", "2 eggs"],
      instructions: ["Mix", "Bake"],
      sourceUrl: "https://example.com/recipe",
      tags: ["Dinner"],
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const result = recipeSchema.safeParse(recipe);
    expect(result.success).toBe(true);
  });

  it("validates a recipe with metadata", () => {
    const recipe = {
      id: "abc123",
      title: "Test Recipe",
      image: null,
      ingredients: [],
      instructions: [],
      sourceUrl: "https://example.com",
      tags: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      prepTime: "PT15M",
      cookTime: "PT30M",
      totalTime: "PT45M",
      servings: "4",
      author: "Chef Test",
      cuisineType: "Italian",
      difficulty: "Easy" as const,
      rating: 4.5,
      isFavorite: true,
      notes: "Great recipe",
    };
    const result = recipeSchema.safeParse(recipe);
    expect(result.success).toBe(true);
  });

  it("applies defaults for missing optional fields", () => {
    const recipe = {
      id: "abc123",
      title: "Test",
      image: null,
      ingredients: [],
      instructions: [],
      sourceUrl: "https://example.com",
      tags: [],
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const result = recipeSchema.parse(recipe);
    expect(result.prepTime).toBeNull();
    expect(result.isFavorite).toBe(false);
    expect(result.rating).toBeNull();
  });

  it("rejects invalid difficulty", () => {
    const recipe = {
      id: "abc123",
      title: "Test",
      image: null,
      ingredients: [],
      instructions: [],
      sourceUrl: "https://example.com",
      tags: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      difficulty: "SuperHard",
    };
    const result = recipeSchema.safeParse(recipe);
    expect(result.success).toBe(false);
  });
});

describe("storeStateSchema", () => {
  it("validates empty store state", () => {
    const state = {
      recipes: [],
      mealPlan: {},
      shoppingList: [],
      checkedIngredients: {},
    };
    const result = storeStateSchema.safeParse(state);
    expect(result.success).toBe(true);
  });

  it("validates store with shopping items", () => {
    const state = {
      recipes: [],
      mealPlan: {},
      shoppingList: [
        { id: "item1", text: "Milk", checked: false },
        { id: "item2", text: "Eggs", checked: true, recipeId: "r1" },
      ],
      checkedIngredients: {},
    };
    const result = storeStateSchema.safeParse(state);
    expect(result.success).toBe(true);
  });

  it("validates store with meal plan", () => {
    const state = {
      recipes: [],
      mealPlan: {
        "2026-02-22": {
          breakfast: "recipe1",
          lunch: "recipe2",
        },
      },
      shoppingList: [],
      checkedIngredients: { recipe1: [0, 2, 5] },
    };
    const result = storeStateSchema.safeParse(state);
    expect(result.success).toBe(true);
  });
});
