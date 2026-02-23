import { describe, it, expect, beforeEach, vi } from "vitest";
import { useRecipeStore } from "./recipe-store";
import { act } from "@testing-library/react";
import type { Recipe, ScrapedRecipe } from "@/types";

// ---------------------------------------------------------------------------
// Mock Supabase client + service layer so store actions don't hit a real DB
// ---------------------------------------------------------------------------

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({}),
}));

vi.mock("@/lib/supabase/service", () => ({
  addRecipe: vi.fn().mockResolvedValue({
    id: "db-id",
    title: "mock",
    image: null,
    ingredients: [],
    instructions: [],
    sourceUrl: "",
    tags: [],
    createdAt: new Date().toISOString(),
  }),
  updateRecipe: vi.fn().mockResolvedValue(undefined),
  deleteRecipe: vi.fn().mockResolvedValue(undefined),
  updateRecipeTags: vi.fn().mockResolvedValue(undefined),
  toggleIngredient: vi.fn().mockResolvedValue(undefined),
  clearCheckedIngredients: vi.fn().mockResolvedValue(undefined),
  assignMeal: vi.fn().mockResolvedValue(undefined),
  removeMeal: vi.fn().mockResolvedValue(undefined),
  clearWeek: vi.fn().mockResolvedValue(undefined),
  generateShoppingList: vi.fn().mockResolvedValue([]),
  addShoppingItem: vi.fn().mockResolvedValue({
    id: "db-item",
    text: "mock",
    checked: false,
  }),
  toggleShoppingItem: vi.fn().mockResolvedValue(undefined),
  clearCheckedItems: vi.fn().mockResolvedValue(undefined),
  clearShoppingList: vi.fn().mockResolvedValue(undefined),
  fetchRecipes: vi.fn().mockResolvedValue([]),
  fetchShoppingList: vi.fn().mockResolvedValue([]),
  fetchCheckedIngredients: vi.fn().mockResolvedValue({}),
  fetchMealPlan: vi.fn().mockResolvedValue({}),
  fetchTemplates: vi.fn().mockResolvedValue([]),
  saveTemplate: vi.fn().mockResolvedValue({ id: "tmpl-db", name: "mock", days: {}, createdAt: new Date().toISOString() }),
  deleteTemplate: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const getState = () => useRecipeStore.getState();

/** A minimal scraped recipe fixture with only required fields. */
const makeScraped = (overrides: Partial<ScrapedRecipe> = {}): ScrapedRecipe => ({
  title: "Test Recipe",
  image: "https://example.com/img.jpg",
  ingredients: ["1 cup flour", "2 eggs"],
  instructions: ["Mix ingredients", "Bake at 350F"],
  ...overrides,
});

/** Shorthand: add a recipe optimistically and return the first recipe in state. */
const addTestRecipe = (
  overrides: Partial<ScrapedRecipe> = {},
  url = "https://example.com/recipe",
) => {
  getState().addRecipe(makeScraped(overrides), url);
  return getState().recipes[0];
};

// ---------------------------------------------------------------------------
// Reset store between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  act(() => {
    useRecipeStore.setState({
      recipes: [],
      mealPlan: {},
      mealTemplates: [],
      shoppingList: [],
      checkedIngredients: {},
      isLoading: false,
      error: null,
      cookingRecipeId: null,
      cookingCompletedSteps: new Set(),
    });
  });
});

// ---------------------------------------------------------------------------
// Recipe Actions
// ---------------------------------------------------------------------------

describe("Recipe Actions", () => {
  // 1
  it("addRecipe creates a recipe with all fields from scraped data (optimistic)", () => {
    const scraped = makeScraped({
      title: "Banana Bread",
      image: "https://example.com/banana.jpg",
      ingredients: ["3 bananas", "1 cup sugar"],
      instructions: ["Mash bananas", "Mix with sugar", "Bake"],
    });

    getState().addRecipe(scraped, "https://example.com/banana-bread");

    const recipe = getState().recipes[0];
    expect(recipe.title).toBe("Banana Bread");
    expect(recipe.image).toBe("https://example.com/banana.jpg");
    expect(recipe.ingredients).toEqual(["3 bananas", "1 cup sugar"]);
    expect(recipe.instructions).toEqual(["Mash bananas", "Mix with sugar", "Bake"]);
    expect(recipe.sourceUrl).toBe("https://example.com/banana-bread");
    expect(recipe.tags).toEqual([]);
    expect(recipe.id).toBeDefined();
    expect(recipe.createdAt).toBeDefined();

    expect(getState().recipes).toHaveLength(1);
  });

  // 2
  it("addRecipe adds new metadata fields (prepTime, cookTime, servings, author, cuisineType)", () => {
    const scraped = makeScraped({
      prepTime: "15 min",
      cookTime: "30 min",
      totalTime: "45 min",
      servings: "4",
      author: "Chef John",
      cuisineType: "Italian",
    });

    getState().addRecipe(scraped, "https://example.com");
    const recipe = getState().recipes[0];

    expect(recipe.prepTime).toBe("15 min");
    expect(recipe.cookTime).toBe("30 min");
    expect(recipe.totalTime).toBe("45 min");
    expect(recipe.servings).toBe("4");
    expect(recipe.author).toBe("Chef John");
    expect(recipe.cuisineType).toBe("Italian");
  });

  // 3
  it("addRecipe generates unique temp IDs (add two recipes, IDs differ)", () => {
    const first = addTestRecipe({ title: "Recipe A" });
    const second = addTestRecipe({ title: "Recipe B" });

    expect(first.id).not.toBe(second.id);
  });

  // 4
  it("addRecipe prepends to recipes array (newest first)", () => {
    addTestRecipe({ title: "First" });
    addTestRecipe({ title: "Second" });

    const { recipes } = getState();
    expect(recipes).toHaveLength(2);
    expect(recipes[0].title).toBe("Second");
    expect(recipes[1].title).toBe("First");
  });

  // 5
  it("deleteRecipe removes recipe by ID", () => {
    const recipe = addTestRecipe();
    expect(getState().recipes).toHaveLength(1);

    getState().deleteRecipe(recipe.id);

    expect(getState().recipes).toHaveLength(0);
  });

  // 6
  it("deleteRecipe does nothing for non-existent ID", () => {
    addTestRecipe();
    expect(getState().recipes).toHaveLength(1);

    getState().deleteRecipe("non-existent-id");

    expect(getState().recipes).toHaveLength(1);
  });

  // 7
  it("updateTags replaces tags for a recipe", () => {
    const recipe = addTestRecipe();
    expect(recipe.tags).toEqual([]);

    getState().updateTags(recipe.id, ["dessert", "quick"]);
    expect(getState().recipes[0].tags).toEqual(["dessert", "quick"]);

    // Replace again to confirm full replacement, not append
    getState().updateTags(recipe.id, ["vegan"]);
    expect(getState().recipes[0].tags).toEqual(["vegan"]);
  });

  // 8
  it("updateRecipe updates specific fields (title, notes, etc.)", () => {
    const recipe = addTestRecipe({ title: "Old Title" });

    getState().updateRecipe(recipe.id, {
      title: "New Title",
      notes: "Some notes",
    });

    const updated = getState().recipes[0];
    expect(updated.title).toBe("New Title");
    expect(updated.notes).toBe("Some notes");
    // Unchanged fields stay the same
    expect(updated.id).toBe(recipe.id);
    expect(updated.createdAt).toBe(recipe.createdAt);
    expect(updated.ingredients).toEqual(recipe.ingredients);
  });
});

// ---------------------------------------------------------------------------
// Ingredient Checklist
// ---------------------------------------------------------------------------

describe("Ingredient Checklist", () => {
  // 9
  it("toggleIngredient adds index to checked list", () => {
    const recipe = addTestRecipe();

    getState().toggleIngredient(recipe.id, 0);

    expect(getState().checkedIngredients[recipe.id]).toEqual([0]);
  });

  // 10
  it("toggleIngredient removes index if already checked", () => {
    const recipe = addTestRecipe();

    getState().toggleIngredient(recipe.id, 0);
    expect(getState().checkedIngredients[recipe.id]).toEqual([0]);

    getState().toggleIngredient(recipe.id, 0);
    expect(getState().checkedIngredients[recipe.id]).toEqual([]);
  });

  // 11
  it("clearCheckedIngredients removes all checks for a recipe", () => {
    const recipe = addTestRecipe();

    getState().toggleIngredient(recipe.id, 0);
    getState().toggleIngredient(recipe.id, 1);
    expect(getState().checkedIngredients[recipe.id]).toEqual([0, 1]);

    getState().clearCheckedIngredients(recipe.id);
    expect(getState().checkedIngredients[recipe.id]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Meal Plan
// ---------------------------------------------------------------------------

describe("Meal Plan", () => {
  // 12
  it("assignMeal sets recipe for a date+slot", () => {
    const recipe = addTestRecipe();

    getState().assignMeal("2026-02-22", "dinner", recipe.id);

    expect(getState().mealPlan["2026-02-22"]).toEqual({
      dinner: recipe.id,
    });
  });

  // 13
  it("assignMeal with undefined clears a slot", () => {
    const recipe = addTestRecipe();

    getState().assignMeal("2026-02-22", "lunch", recipe.id);
    expect(getState().mealPlan["2026-02-22"]?.lunch).toBe(recipe.id);

    getState().assignMeal("2026-02-22", "lunch", undefined);
    expect(getState().mealPlan["2026-02-22"]?.lunch).toBeUndefined();
  });

  // 14
  it("clearWeek removes all entries for given dates", () => {
    const recipe = addTestRecipe();

    getState().assignMeal("2026-02-22", "breakfast", recipe.id);
    getState().assignMeal("2026-02-23", "lunch", recipe.id);
    getState().assignMeal("2026-02-24", "dinner", recipe.id);

    getState().clearWeek(["2026-02-22", "2026-02-23"]);

    const { mealPlan } = getState();
    expect(mealPlan["2026-02-22"]).toBeUndefined();
    expect(mealPlan["2026-02-23"]).toBeUndefined();
    // Date outside the cleared range remains
    expect(mealPlan["2026-02-24"]).toEqual({ dinner: recipe.id });
  });
});

// ---------------------------------------------------------------------------
// Shopping List
// ---------------------------------------------------------------------------

describe("Shopping List", () => {
  // 15
  it("generateShoppingList creates items from meal plan ingredients", () => {
    const recipe = addTestRecipe({
      ingredients: ["1 cup flour", "2 eggs", "1 tsp salt"],
    });

    getState().assignMeal("2026-02-22", "dinner", recipe.id);
    getState().generateShoppingList(["2026-02-22"]);

    const { shoppingList } = getState();
    expect(shoppingList).toHaveLength(3);
    expect(shoppingList.map((i) => i.text)).toEqual([
      "1 cup flour",
      "2 eggs",
      "1 tsp salt",
    ]);
    // Each item should have an id, be unchecked, and reference the recipe
    for (const item of shoppingList) {
      expect(item.id).toBeDefined();
      expect(item.checked).toBe(false);
      expect(item.recipeId).toBe(recipe.id);
    }
  });

  // 16
  it("generateShoppingList deduplicates ingredients (case-insensitive)", () => {
    addTestRecipe({
      title: "A",
      ingredients: ["1 cup Flour", "2 eggs"],
    });
    const recipeA = getState().recipes[0];
    addTestRecipe({
      title: "B",
      ingredients: ["1 cup flour", "1 cup sugar"],
    });
    const recipeB = getState().recipes[0];

    getState().assignMeal("2026-02-22", "breakfast", recipeA.id);
    getState().assignMeal("2026-02-22", "lunch", recipeB.id);
    getState().generateShoppingList(["2026-02-22"]);

    const texts = getState().shoppingList.map((i) => i.text);
    // "1 cup Flour" and "1 cup flour" should be deduplicated
    expect(texts).toHaveLength(3);
    expect(texts).toContain("1 cup Flour"); // first seen wins
    expect(texts).toContain("2 eggs");
    expect(texts).toContain("1 cup sugar");
  });

  // 17
  it("generateShoppingList skips meals with no recipe", () => {
    // Assign a recipe ID that does not match any stored recipe
    getState().assignMeal("2026-02-22", "dinner", "ghost-recipe-id");
    getState().generateShoppingList(["2026-02-22"]);

    expect(getState().shoppingList).toHaveLength(0);
  });

  // 18
  it("addShoppingItem adds to the list", () => {
    getState().addShoppingItem("Olive oil");

    const { shoppingList } = getState();
    expect(shoppingList).toHaveLength(1);
    expect(shoppingList[0].text).toBe("Olive oil");
    expect(shoppingList[0].checked).toBe(false);
    expect(shoppingList[0].id).toBeDefined();
  });

  // 19
  it("toggleShoppingItem toggles checked state", () => {
    getState().addShoppingItem("Butter");
    const itemId = getState().shoppingList[0].id;

    // Check
    getState().toggleShoppingItem(itemId);
    expect(getState().shoppingList[0].checked).toBe(true);

    // Uncheck
    getState().toggleShoppingItem(itemId);
    expect(getState().shoppingList[0].checked).toBe(false);
  });

  // 20
  it("clearCheckedItems removes only checked items", () => {
    getState().addShoppingItem("Milk");
    getState().addShoppingItem("Bread");
    getState().addShoppingItem("Cheese");

    // Check only the second item ("Bread")
    const breadId = getState().shoppingList[1].id;
    getState().toggleShoppingItem(breadId);

    getState().clearCheckedItems();

    const remaining = getState().shoppingList;
    expect(remaining).toHaveLength(2);
    expect(remaining.map((i) => i.text)).toEqual(["Milk", "Cheese"]);
  });

  // 21
  it("clearShoppingList empties the entire list", () => {
    getState().addShoppingItem("Apple");
    getState().addShoppingItem("Banana");
    expect(getState().shoppingList).toHaveLength(2);

    getState().clearShoppingList();

    expect(getState().shoppingList).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Lifecycle Actions (hydrate, clear, migrateFromLocalStorage)
// ---------------------------------------------------------------------------

import * as db from "@/lib/supabase/service";

describe("Lifecycle Actions", () => {
  // 22
  it("hydrate fetches recipes, shopping list, and checked ingredients from Supabase", async () => {
    const mockRecipes: Recipe[] = [
      {
        id: "r1",
        title: "Hydrated Recipe",
        image: "img.jpg",
        ingredients: ["flour"],
        instructions: ["mix"],
        sourceUrl: "https://example.com",
        tags: ["test"],
        createdAt: new Date().toISOString(),
      },
    ];

    vi.mocked(db.fetchRecipes).mockResolvedValueOnce(mockRecipes);
    vi.mocked(db.fetchShoppingList).mockResolvedValueOnce([
      { id: "s1", text: "Milk", checked: false },
    ]);
    vi.mocked(db.fetchCheckedIngredients).mockResolvedValueOnce({ r1: [0] });

    await getState().hydrate();

    expect(getState().recipes).toEqual(mockRecipes);
    expect(getState().shoppingList).toEqual([{ id: "s1", text: "Milk", checked: false }]);
    expect(getState().checkedIngredients).toEqual({ r1: [0] });
    expect(getState().isLoading).toBe(false);
    expect(getState().error).toBeNull();
  });

  // 23
  it("hydrate sets isLoading during fetch", async () => {
    let resolveRecipes: (v: Recipe[]) => void;
    const recipePromise = new Promise<Recipe[]>((r) => { resolveRecipes = r; });

    vi.mocked(db.fetchRecipes).mockReturnValueOnce(recipePromise);
    vi.mocked(db.fetchShoppingList).mockResolvedValueOnce([]);
    vi.mocked(db.fetchCheckedIngredients).mockResolvedValueOnce({});

    const hydratePromise = getState().hydrate();
    expect(getState().isLoading).toBe(true);

    resolveRecipes!([]);
    await hydratePromise;
    expect(getState().isLoading).toBe(false);
  });

  // 24
  it("hydrate sets error on failure", async () => {
    vi.mocked(db.fetchRecipes).mockRejectedValueOnce(new Error("Network down"));
    vi.mocked(db.fetchShoppingList).mockResolvedValueOnce([]);
    vi.mocked(db.fetchCheckedIngredients).mockResolvedValueOnce({});

    await getState().hydrate();

    expect(getState().error).toBe("Network down");
    expect(getState().isLoading).toBe(false);
  });

  // 25
  it("clear resets the entire store to initial state", () => {
    // Populate the store with data
    getState().addRecipe(makeScraped({ title: "To Clear" }), "https://example.com");
    getState().addShoppingItem("Item");
    getState().toggleIngredient("some-id", 0);
    useRecipeStore.setState({ error: "old error", isLoading: true });

    expect(getState().recipes).toHaveLength(1);

    getState().clear();

    expect(getState().recipes).toEqual([]);
    expect(getState().mealPlan).toEqual({});
    expect(getState().shoppingList).toEqual([]);
    expect(getState().checkedIngredients).toEqual({});
    expect(getState().isLoading).toBe(false);
    expect(getState().error).toBeNull();
  });

  // 26
  it("migrateFromLocalStorage returns { migrated: false } when no data exists", async () => {
    localStorage.removeItem("cooksnap-storage");

    const result = await getState().migrateFromLocalStorage();

    expect(result).toEqual({ migrated: false, recipeCount: 0 });
  });

  // 27
  it("migrateFromLocalStorage returns { migrated: false } when recipes array is empty", async () => {
    localStorage.setItem("cooksnap-storage", JSON.stringify({ state: { recipes: [] } }));

    const result = await getState().migrateFromLocalStorage();

    expect(result).toEqual({ migrated: false, recipeCount: 0 });
    localStorage.removeItem("cooksnap-storage");
  });

  // 28
  it("migrateFromLocalStorage imports recipes and clears localStorage", async () => {
    const oldData = {
      state: {
        recipes: [
          {
            id: "old-1",
            title: "Old Recipe",
            image: "img.jpg",
            ingredients: ["flour"],
            instructions: ["bake"],
            sourceUrl: "https://example.com",
            tags: ["saved"],
            createdAt: "2025-01-01T00:00:00Z",
          },
        ],
      },
    };
    localStorage.setItem("cooksnap-storage", JSON.stringify(oldData));

    vi.mocked(db.addRecipe).mockResolvedValueOnce({
      id: "new-1",
      title: "Old Recipe",
      image: "img.jpg",
      ingredients: ["flour"],
      instructions: ["bake"],
      sourceUrl: "https://example.com",
      tags: [],
      createdAt: new Date().toISOString(),
    });
    vi.mocked(db.updateRecipeTags).mockResolvedValueOnce(undefined);
    vi.mocked(db.fetchRecipes).mockResolvedValueOnce([]);
    vi.mocked(db.fetchShoppingList).mockResolvedValueOnce([]);
    vi.mocked(db.fetchCheckedIngredients).mockResolvedValueOnce({});

    const result = await getState().migrateFromLocalStorage();

    expect(result).toEqual({ migrated: true, recipeCount: 1 });
    expect(localStorage.getItem("cooksnap-storage")).toBeNull();
  });

  // 29
  it("migrateFromLocalStorage handles invalid JSON gracefully", async () => {
    localStorage.setItem("cooksnap-storage", "not-valid-json{{{");

    const result = await getState().migrateFromLocalStorage();

    expect(result).toEqual({ migrated: false, recipeCount: 0 });
    localStorage.removeItem("cooksnap-storage");
  });
});

// ---------------------------------------------------------------------------
// Cooking Mode
// ---------------------------------------------------------------------------

describe("Cooking Mode", () => {
  it("startCooking sets cookingRecipeId and resets completed steps", () => {
    getState().startCooking("recipe-1");

    expect(getState().cookingRecipeId).toBe("recipe-1");
    expect(getState().cookingCompletedSteps).toEqual(new Set());
  });

  it("stopCooking clears cookingRecipeId and completed steps", () => {
    getState().startCooking("recipe-1");
    getState().toggleCookingStep(0);
    getState().toggleCookingStep(2);

    getState().stopCooking();

    expect(getState().cookingRecipeId).toBeNull();
    expect(getState().cookingCompletedSteps).toEqual(new Set());
  });

  it("toggleCookingStep adds and removes step indices", () => {
    getState().startCooking("recipe-1");

    getState().toggleCookingStep(0);
    expect(getState().cookingCompletedSteps).toEqual(new Set([0]));

    getState().toggleCookingStep(2);
    expect(getState().cookingCompletedSteps).toEqual(new Set([0, 2]));

    // Toggle off
    getState().toggleCookingStep(0);
    expect(getState().cookingCompletedSteps).toEqual(new Set([2]));
  });

  it("starting a new recipe resets previous cooking state", () => {
    getState().startCooking("recipe-1");
    getState().toggleCookingStep(0);
    getState().toggleCookingStep(1);
    expect(getState().cookingCompletedSteps.size).toBe(2);

    getState().startCooking("recipe-2");

    expect(getState().cookingRecipeId).toBe("recipe-2");
    expect(getState().cookingCompletedSteps).toEqual(new Set());
  });

  it("clear resets cooking state", () => {
    getState().startCooking("recipe-1");
    getState().toggleCookingStep(0);

    getState().clear();

    expect(getState().cookingRecipeId).toBeNull();
    expect(getState().cookingCompletedSteps).toEqual(new Set());
  });
});

// ---------------------------------------------------------------------------
// Supabase Sync (verify service functions are called)
// ---------------------------------------------------------------------------

describe("Supabase Sync", () => {
  // 30
  it("addRecipe calls db.addRecipe in background", async () => {
    vi.mocked(db.addRecipe).mockResolvedValueOnce({
      id: "synced-1",
      title: "Synced",
      image: "img.jpg",
      ingredients: [],
      instructions: [],
      sourceUrl: "",
      tags: [],
      createdAt: new Date().toISOString(),
    });

    getState().addRecipe(makeScraped({ title: "Synced" }), "https://example.com");

    // Wait for async sync
    await vi.waitFor(() => {
      expect(db.addRecipe).toHaveBeenCalled();
    });
  });

  // 31
  it("deleteRecipe calls db.deleteRecipe in background", async () => {
    vi.mocked(db.deleteRecipe).mockResolvedValueOnce(undefined);

    const recipe = addTestRecipe();
    getState().deleteRecipe(recipe.id);

    await vi.waitFor(() => {
      expect(db.deleteRecipe).toHaveBeenCalledWith(expect.anything(), recipe.id);
    });
  });

  // 32
  it("updateTags calls db.updateRecipeTags in background", async () => {
    vi.mocked(db.updateRecipeTags).mockResolvedValueOnce(undefined);

    const recipe = addTestRecipe();
    getState().updateTags(recipe.id, ["new-tag"]);

    await vi.waitFor(() => {
      expect(db.updateRecipeTags).toHaveBeenCalledWith(
        expect.anything(),
        recipe.id,
        ["new-tag"],
      );
    });
  });

  // 33
  it("updateRecipe calls db.updateRecipe in background", async () => {
    vi.mocked(db.updateRecipe).mockResolvedValueOnce(undefined);

    const recipe = addTestRecipe();
    getState().updateRecipe(recipe.id, { title: "Updated" });

    await vi.waitFor(() => {
      expect(db.updateRecipe).toHaveBeenCalledWith(
        expect.anything(),
        recipe.id,
        { title: "Updated" },
      );
    });
  });

  // 34
  it("assignMeal calls db.assignMeal for new assignments", async () => {
    vi.mocked(db.assignMeal).mockResolvedValueOnce(undefined);

    getState().assignMeal("2026-02-22", "dinner", "recipe-1");

    await vi.waitFor(() => {
      expect(db.assignMeal).toHaveBeenCalledWith(
        expect.anything(),
        "2026-02-22",
        "dinner",
        "recipe-1",
        false,
      );
    });
  });

  // 35
  it("assignMeal calls db.removeMeal when recipeId is undefined", async () => {
    vi.mocked(db.removeMeal).mockResolvedValueOnce(undefined);

    getState().assignMeal("2026-02-22", "dinner", undefined);

    await vi.waitFor(() => {
      expect(db.removeMeal).toHaveBeenCalledWith(
        expect.anything(),
        "2026-02-22",
        "dinner",
      );
    });
  });

  // 36
  it("clearWeek calls db.clearWeek in background", async () => {
    vi.mocked(db.clearWeek).mockResolvedValueOnce(undefined);

    getState().clearWeek(["2026-02-22", "2026-02-23"]);

    await vi.waitFor(() => {
      expect(db.clearWeek).toHaveBeenCalledWith(
        expect.anything(),
        ["2026-02-22", "2026-02-23"],
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Hydration includes meal plan
// ---------------------------------------------------------------------------

describe("Hydration – Meal Plan", () => {
  it("hydrate now fetches meal plan data", async () => {
    const mockMealPlan = { "2026-02-22": { dinner: "r1" } };
    vi.mocked(db.fetchRecipes).mockResolvedValueOnce([]);
    vi.mocked(db.fetchShoppingList).mockResolvedValueOnce([]);
    vi.mocked(db.fetchCheckedIngredients).mockResolvedValueOnce({});
    vi.mocked(db.fetchMealPlan).mockResolvedValueOnce(mockMealPlan);

    await getState().hydrate();

    expect(db.fetchMealPlan).toHaveBeenCalled();
    expect(getState().mealPlan).toEqual(mockMealPlan);
  });
});

// ---------------------------------------------------------------------------
// fetchMealPlanForWeek
// ---------------------------------------------------------------------------

describe("fetchMealPlanForWeek", () => {
  it("merges fetched data into existing mealPlan", async () => {
    // Pre-populate with existing data
    useRecipeStore.setState({
      mealPlan: { "2026-02-22": { breakfast: "r1" } },
    });

    vi.mocked(db.fetchMealPlan).mockResolvedValueOnce({
      "2026-03-01": { lunch: "r2" },
    });

    await getState().fetchMealPlanForWeek("2026-03-01", "2026-03-07");

    const plan = getState().mealPlan;
    expect(plan["2026-02-22"]).toEqual({ breakfast: "r1" });
    expect(plan["2026-03-01"]).toEqual({ lunch: "r2" });
  });
});

// ---------------------------------------------------------------------------
// Shopping List – Snack slot and Leftovers
// ---------------------------------------------------------------------------

describe("Shopping List – Snack & Leftovers", () => {
  it("generateShoppingList includes snack slot ingredients", () => {
    const recipe = addTestRecipe({
      ingredients: ["1 apple", "peanut butter"],
    });

    getState().assignMeal("2026-02-22", "snack", recipe.id);
    getState().generateShoppingList(["2026-02-22"]);

    const texts = getState().shoppingList.map((i) => i.text);
    expect(texts).toContain("1 apple");
    expect(texts).toContain("peanut butter");
  });

  it("generateShoppingList skips leftover-flagged slots", () => {
    const recipe = addTestRecipe({
      ingredients: ["pasta", "sauce"],
    });

    // Assign meal and flag as leftover
    getState().assignMeal("2026-02-22", "dinner", recipe.id, true);
    getState().generateShoppingList(["2026-02-22"]);

    // Leftover slot should be skipped
    expect(getState().shoppingList).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Meal Templates
// ---------------------------------------------------------------------------

describe("Meal Templates", () => {
  it("saveWeekAsTemplate creates optimistic template", () => {
    const recipe = addTestRecipe();
    getState().assignMeal("2026-02-22", "breakfast", recipe.id);

    getState().saveWeekAsTemplate("My Week", ["2026-02-22", "2026-02-23", "2026-02-24", "2026-02-25", "2026-02-26", "2026-02-27", "2026-02-28"]);

    expect(getState().mealTemplates).toHaveLength(1);
    expect(getState().mealTemplates[0].name).toBe("My Week");
  });

  it("applyTemplate applies template days to correct dates", () => {
    // Create a template manually
    const templateDay = { breakfast: "r1", lunch: "r2" };
    const template: import("@/types").MealTemplate = {
      id: "tmpl-1",
      name: "Test",
      days: { 0: templateDay, 2: { dinner: "r3" } },
      createdAt: new Date().toISOString(),
    };
    useRecipeStore.setState({ mealTemplates: [template] });

    const weekDates = ["2026-03-01", "2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05", "2026-03-06", "2026-03-07"];
    getState().applyTemplate("tmpl-1", weekDates);

    const plan = getState().mealPlan;
    expect(plan["2026-03-01"]?.breakfast).toBe("r1");
    expect(plan["2026-03-01"]?.lunch).toBe("r2");
    expect(plan["2026-03-03"]?.dinner).toBe("r3");
  });

  it("deleteTemplate removes template from state", () => {
    useRecipeStore.setState({
      mealTemplates: [
        { id: "tmpl-1", name: "A", days: {}, createdAt: "" },
        { id: "tmpl-2", name: "B", days: {}, createdAt: "" },
      ],
    });

    getState().deleteTemplate("tmpl-1");

    expect(getState().mealTemplates).toHaveLength(1);
    expect(getState().mealTemplates[0].id).toBe("tmpl-2");
  });
});
