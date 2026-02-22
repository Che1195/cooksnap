import { describe, it, expect, beforeEach } from "vitest";
import { useRecipeStore } from "./recipe-store";
import { act } from "@testing-library/react";
import type { ScrapedRecipe } from "@/types";

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

/** Shorthand to add a recipe through the store action and return it. */
const addTestRecipe = (
  overrides: Partial<ScrapedRecipe> = {},
  url = "https://example.com/recipe",
) => getState().addRecipe(makeScraped(overrides), url);

// ---------------------------------------------------------------------------
// Reset store between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  act(() => {
    useRecipeStore.setState({
      recipes: [],
      mealPlan: {},
      shoppingList: [],
      checkedIngredients: {},
    });
  });
});

// ---------------------------------------------------------------------------
// Recipe Actions
// ---------------------------------------------------------------------------

describe("Recipe Actions", () => {
  // 1
  it("addRecipe creates a recipe with all fields from scraped data", () => {
    const scraped = makeScraped({
      title: "Banana Bread",
      image: "https://example.com/banana.jpg",
      ingredients: ["3 bananas", "1 cup sugar"],
      instructions: ["Mash bananas", "Mix with sugar", "Bake"],
    });

    const recipe = getState().addRecipe(scraped, "https://example.com/banana-bread");

    expect(recipe.title).toBe("Banana Bread");
    expect(recipe.image).toBe("https://example.com/banana.jpg");
    expect(recipe.ingredients).toEqual(["3 bananas", "1 cup sugar"]);
    expect(recipe.instructions).toEqual(["Mash bananas", "Mix with sugar", "Bake"]);
    expect(recipe.sourceUrl).toBe("https://example.com/banana-bread");
    expect(recipe.tags).toEqual([]);
    expect(recipe.id).toBeDefined();
    expect(recipe.createdAt).toBeDefined();

    // Also persisted in state
    expect(getState().recipes).toHaveLength(1);
    expect(getState().recipes[0]).toEqual(recipe);
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

    const recipe = getState().addRecipe(scraped, "https://example.com");

    expect(recipe.prepTime).toBe("15 min");
    expect(recipe.cookTime).toBe("30 min");
    expect(recipe.totalTime).toBe("45 min");
    expect(recipe.servings).toBe("4");
    expect(recipe.author).toBe("Chef John");
    expect(recipe.cuisineType).toBe("Italian");
  });

  // 3
  it("addRecipe generates unique IDs (add two recipes, IDs differ)", () => {
    const first = addTestRecipe({ title: "Recipe A" });
    const second = addTestRecipe({ title: "Recipe B" });

    expect(first.id).not.toBe(second.id);
  });

  // 4
  it("addRecipe prepends to recipes array (newest first)", () => {
    const first = addTestRecipe({ title: "First" });
    const second = addTestRecipe({ title: "Second" });

    const { recipes } = getState();
    expect(recipes).toHaveLength(2);
    expect(recipes[0].id).toBe(second.id);
    expect(recipes[1].id).toBe(first.id);
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
    const recipeA = addTestRecipe({
      title: "A",
      ingredients: ["1 cup Flour", "2 eggs"],
    });
    const recipeB = addTestRecipe({
      title: "B",
      ingredients: ["1 cup flour", "1 cup sugar"],
    });

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
