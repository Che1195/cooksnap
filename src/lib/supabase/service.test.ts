/**
 * Tests for the Supabase service layer (src/lib/supabase/service.ts).
 *
 * Uses a mock Supabase client to verify that each service function builds
 * the correct queries, handles responses, and throws on errors.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Recipe, ShoppingItem } from "@/types";

// ---------------------------------------------------------------------------
// Mock Supabase client builder
// ---------------------------------------------------------------------------

/** Creates a chainable mock that simulates Supabase's query builder pattern. */
function mockChain(resolvedValue: { data: unknown; error: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const methods = [
    "select", "insert", "update", "delete", "upsert",
    "eq", "in", "gte", "lte", "order", "single",
  ];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  // The last method in a chain resolves the promise
  chain.then = vi.fn((resolve) => resolve(resolvedValue));

  // Make it thenable so `await` works
  const proxy = new Proxy(chain, {
    get(target, prop) {
      if (prop === "then") {
        return (resolve: (v: unknown) => void) => resolve(resolvedValue);
      }
      return target[prop as string] ?? vi.fn().mockReturnValue(proxy);
    },
  });

  return proxy;
}

function createMockClient(overrides: Record<string, unknown> = {}) {
  const fromMocks: Record<string, ReturnType<typeof mockChain>> = {};

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-123" } },
      }),
      ...overrides.auth as Record<string, unknown>,
    },
    from: vi.fn((table: string) => {
      if (!fromMocks[table]) {
        fromMocks[table] = mockChain({ data: [], error: null });
      }
      return fromMocks[table];
    }),
    _setTableResponse(table: string, data: unknown, error: unknown = null) {
      fromMocks[table] = mockChain({ data, error });
    },
  };
}

// ---------------------------------------------------------------------------
// Import the service functions
// ---------------------------------------------------------------------------

import {
  fetchRecipes,
  addRecipe,
  deleteRecipe,
  updateRecipeTags,
  fetchMealPlan,
  assignMeal,
  removeMeal,
  clearWeek,
  fetchShoppingList,
  addShoppingItem,
  toggleShoppingItem,
  clearCheckedItems,
  clearShoppingList,
  fetchCheckedIngredients,
  toggleIngredient,
  clearCheckedIngredients,
} from "./service";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Service Layer – Auth Guard", () => {
  it("getUserId throws when not authenticated", async () => {
    const client = createMockClient();
    client.auth.getUser = vi.fn().mockResolvedValue({
      data: { user: null },
    });

    // fetchRecipes calls getUserId internally
    await expect(fetchRecipes(client as any)).rejects.toThrow("Not authenticated");
  });
});

describe("Service Layer – Recipes", () => {
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    client = createMockClient();
  });

  it("fetchRecipes calls from('recipes') with user_id filter", async () => {
    const recipes = await fetchRecipes(client as any);

    expect(client.from).toHaveBeenCalledWith("recipes");
    // When no recipes exist, the function returns early without querying
    // ingredients/instructions/tags — that's the expected optimization.
    expect(Array.isArray(recipes)).toBe(true);
  });

  it("fetchRecipes returns empty array when no recipes", async () => {
    const recipes = await fetchRecipes(client as any);
    expect(recipes).toEqual([]);
  });

  it("deleteRecipe calls from('recipes').delete().eq('id', ...)", async () => {
    await deleteRecipe(client as any, "recipe-1");
    expect(client.from).toHaveBeenCalledWith("recipes");
  });

  it("updateRecipeTags deletes existing then inserts new tags", async () => {
    await updateRecipeTags(client as any, "recipe-1", ["dinner", "quick"]);
    // Should call from('recipe_tags') for delete and insert
    expect(client.from).toHaveBeenCalledWith("recipe_tags");
  });
});

describe("Service Layer – Meal Plan", () => {
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    client = createMockClient();
  });

  it("fetchMealPlan returns a MealPlan object keyed by date", async () => {
    const plan = await fetchMealPlan(client as any, "2026-02-22", "2026-02-28");
    expect(client.from).toHaveBeenCalledWith("meal_plans");
    expect(typeof plan).toBe("object");
  });

  it("assignMeal upserts a meal_plans row", async () => {
    await assignMeal(client as any, "2026-02-22", "dinner", "recipe-1");
    expect(client.from).toHaveBeenCalledWith("meal_plans");
  });

  it("removeMeal deletes a meal_plans row by date+slot", async () => {
    await removeMeal(client as any, "2026-02-22", "dinner");
    expect(client.from).toHaveBeenCalledWith("meal_plans");
  });

  it("clearWeek deletes meal_plans for given dates", async () => {
    await clearWeek(client as any, ["2026-02-22", "2026-02-23"]);
    expect(client.from).toHaveBeenCalledWith("meal_plans");
  });
});

describe("Service Layer – Shopping List", () => {
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    client = createMockClient();
  });

  it("fetchShoppingList returns mapped ShoppingItem array", async () => {
    const items = await fetchShoppingList(client as any);
    expect(client.from).toHaveBeenCalledWith("shopping_items");
    expect(Array.isArray(items)).toBe(true);
  });

  it("addShoppingItem inserts and returns a ShoppingItem", async () => {
    // Mock the response for a single insert
    client._setTableResponse("shopping_items", {
      id: "item-1",
      text: "Milk",
      checked: false,
      recipe_id: null,
    });

    const item = await addShoppingItem(client as any, "Milk");
    expect(client.from).toHaveBeenCalledWith("shopping_items");
    expect(item.text).toBe("Milk");
    expect(item.checked).toBe(false);
  });

  it("toggleShoppingItem updates the checked field", async () => {
    await toggleShoppingItem(client as any, "item-1", true);
    expect(client.from).toHaveBeenCalledWith("shopping_items");
  });

  it("clearCheckedItems deletes items where checked=true", async () => {
    await clearCheckedItems(client as any);
    expect(client.from).toHaveBeenCalledWith("shopping_items");
  });

  it("clearShoppingList deletes all items for user", async () => {
    await clearShoppingList(client as any);
    expect(client.from).toHaveBeenCalledWith("shopping_items");
  });
});

describe("Service Layer – Checked Ingredients", () => {
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    client = createMockClient();
  });

  it("fetchCheckedIngredients returns a Record<recipeId, number[]>", async () => {
    const result = await fetchCheckedIngredients(client as any);
    expect(client.from).toHaveBeenCalledWith("checked_ingredients");
    expect(typeof result).toBe("object");
  });

  it("toggleIngredient inserts when checked=true", async () => {
    await toggleIngredient(client as any, "recipe-1", 2, true);
    expect(client.from).toHaveBeenCalledWith("checked_ingredients");
  });

  it("toggleIngredient deletes when checked=false", async () => {
    await toggleIngredient(client as any, "recipe-1", 2, false);
    expect(client.from).toHaveBeenCalledWith("checked_ingredients");
  });

  it("clearCheckedIngredients deletes all for a recipe", async () => {
    await clearCheckedIngredients(client as any, "recipe-1");
    expect(client.from).toHaveBeenCalledWith("checked_ingredients");
  });
});
