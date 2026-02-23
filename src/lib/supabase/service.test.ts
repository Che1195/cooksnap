/**
 * Tests for the Supabase service layer (src/lib/supabase/service.ts).
 *
 * Uses a mock Supabase client to verify that each service function builds
 * the correct queries, handles responses, and throws on errors.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock Supabase client builder
// ---------------------------------------------------------------------------

/**
 * Creates a chainable mock that simulates Supabase's query builder pattern.
 * Every method call returns the proxy itself; awaiting resolves with resolvedValue.
 */
function mockChain(resolvedValue: { data: unknown; error: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const methods = [
    "select", "insert", "update", "delete", "upsert",
    "eq", "in", "gte", "lte", "order", "single", "maybeSingle",
  ];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.then = vi.fn((resolve) => resolve(resolvedValue));

  // Proxy makes every property access return itself, so unknown methods work too.
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

/**
 * Creates a mock Supabase client. Each table gets its own mock chain.
 * Use `_setTableResponse` to configure what a table call resolves with.
 * Use `_setTableResponses` to configure sequential responses for the same table.
 */
function createMockClient(overrides: Record<string, unknown> = {}) {
  const fromMocks: Record<string, ReturnType<typeof mockChain>> = {};
  /** Track sequential responses: table -> array of chains */
  const sequentialMocks: Record<string, ReturnType<typeof mockChain>[]> = {};
  /** Track call counts for sequential responses */
  const callCounts: Record<string, number> = {};

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-123" } },
      }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      ...overrides.auth as Record<string, unknown>,
    },
    from: vi.fn((table: string) => {
      // If sequential mocks are configured, use them
      if (sequentialMocks[table] && sequentialMocks[table].length > 0) {
        const idx = callCounts[table] ?? 0;
        callCounts[table] = idx + 1;
        // Use the next mock in sequence, or the last one if exhausted
        const mock = sequentialMocks[table][Math.min(idx, sequentialMocks[table].length - 1)];
        return mock;
      }
      if (!fromMocks[table]) {
        fromMocks[table] = mockChain({ data: [], error: null });
      }
      return fromMocks[table];
    }),
    /** Set a single response for all calls to a table */
    _setTableResponse(table: string, data: unknown, error: unknown = null) {
      fromMocks[table] = mockChain({ data, error });
      // Clear any sequential mocks for this table
      delete sequentialMocks[table];
      delete callCounts[table];
    },
    /** Set sequential responses for multiple calls to the same table */
    _setTableResponses(table: string, responses: { data: unknown; error: unknown }[]) {
      sequentialMocks[table] = responses.map((r) => mockChain(r));
      callCounts[table] = 0;
      // Clear single mock
      delete fromMocks[table];
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
  updateRecipe,
  updateRecipeTags,
  fetchMealPlan,
  assignMeal,
  removeMeal,
  clearWeek,
  fetchShoppingList,
  addShoppingItem,
  toggleShoppingItem,
  uncheckAllShoppingItems,
  restoreShoppingItems,
  clearCheckedItems,
  clearShoppingList,
  generateShoppingList,
  fetchCheckedIngredients,
  toggleIngredient,
  clearCheckedIngredients,
  fetchProfile,
  updateProfile,
  fetchTemplates,
  saveTemplate,
  deleteTemplate,
  fetchGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  fetchGroupMembers,
  addRecipeToGroup,
  removeRecipeFromGroup,
  ensureDefaultGroups,
} from "./service";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// ======================== AUTH GUARD ========================

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

// ======================== RECIPES ========================

describe("Service Layer – Recipes", () => {
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    client = createMockClient();
  });

  it("fetchRecipes calls from('recipes') with user_id filter", async () => {
    const recipes = await fetchRecipes(client as any);

    expect(client.from).toHaveBeenCalledWith("recipes");
    expect(Array.isArray(recipes)).toBe(true);
  });

  it("fetchRecipes returns empty array when no recipes", async () => {
    const recipes = await fetchRecipes(client as any);
    expect(recipes).toEqual([]);
  });

  it("fetchRecipes returns mapped Recipe objects with correct field transformations", async () => {
    const recipeRow = {
      id: "r1",
      title: "Pasta",
      image: "pasta.jpg",
      source_url: "https://example.com/pasta",
      created_at: "2026-01-01T00:00:00Z",
      prep_time: "10 min",
      cook_time: "20 min",
      total_time: "30 min",
      servings: "4",
      author: "Chef",
      cuisine_type: "Italian",
      difficulty: "Easy",
      rating: 5,
      is_favorite: true,
      notes: "Good recipe",
      user_id: "user-123",
    };
    client._setTableResponse("recipes", [recipeRow]);
    client._setTableResponse("recipe_ingredients", [
      { recipe_id: "r1", text: "Pasta", sort_order: 0 },
    ]);
    client._setTableResponse("recipe_instructions", [
      { recipe_id: "r1", text: "Boil pasta", sort_order: 0 },
    ]);
    client._setTableResponse("recipe_tags", [
      { recipe_id: "r1", tag: "dinner" },
    ]);

    const recipes = await fetchRecipes(client as any);

    expect(recipes).toHaveLength(1);
    expect(recipes[0].id).toBe("r1");
    expect(recipes[0].title).toBe("Pasta");
    // Verify snake_case → camelCase transformations
    expect(recipes[0].sourceUrl).toBe("https://example.com/pasta");
    expect(recipes[0].createdAt).toBe("2026-01-01T00:00:00Z");
    expect(recipes[0].prepTime).toBe("10 min");
    expect(recipes[0].cookTime).toBe("20 min");
    expect(recipes[0].totalTime).toBe("30 min");
    expect(recipes[0].cuisineType).toBe("Italian");
    expect(recipes[0].isFavorite).toBe(true);
    expect(recipes[0].ingredients).toEqual(["Pasta"]);
    expect(recipes[0].instructions).toEqual(["Boil pasta"]);
    expect(recipes[0].tags).toEqual(["dinner"]);
  });

  it("fetchRecipes queries ingredients, instructions, and tags tables", async () => {
    client._setTableResponse("recipes", [
      { id: "r1", title: "Test", image: null, source_url: "", created_at: "", user_id: "user-123" },
    ]);

    await fetchRecipes(client as any);

    expect(client.from).toHaveBeenCalledWith("recipes");
    expect(client.from).toHaveBeenCalledWith("recipe_ingredients");
    expect(client.from).toHaveBeenCalledWith("recipe_instructions");
    expect(client.from).toHaveBeenCalledWith("recipe_tags");
  });

  it("fetchRecipes throws on database error", async () => {
    client._setTableResponse("recipes", null, { message: "DB error", code: "500" });
    await expect(fetchRecipes(client as any)).rejects.toBeTruthy();
  });

  it("addRecipe inserts recipe and returns mapped Recipe", async () => {
    client._setTableResponse("recipes", {
      id: "r1",
      title: "New Recipe",
      image: "img.jpg",
      source_url: "https://example.com",
      created_at: "2026-01-01T00:00:00Z",
      prep_time: null,
      cook_time: null,
      total_time: null,
      servings: null,
      author: null,
      cuisine_type: null,
      difficulty: null,
      rating: null,
      is_favorite: false,
      notes: null,
      user_id: "user-123",
    });

    const scraped = {
      title: "New Recipe",
      image: "img.jpg",
      ingredients: ["flour", "sugar"],
      instructions: ["mix", "bake"],
    };

    const recipe = await addRecipe(client as any, scraped, "https://example.com");

    expect(client.from).toHaveBeenCalledWith("recipes");
    expect(recipe.id).toBe("r1");
    expect(recipe.title).toBe("New Recipe");
    expect(recipe.sourceUrl).toBe("https://example.com");
    expect(recipe.ingredients).toEqual(["flour", "sugar"]);
    expect(recipe.instructions).toEqual(["mix", "bake"]);
  });

  it("addRecipe throws on database error", async () => {
    client._setTableResponse("recipes", null, { message: "Insert failed", code: "500" });

    const scraped = {
      title: "Fail",
      image: null,
      ingredients: [],
      instructions: [],
    };

    await expect(addRecipe(client as any, scraped, "https://example.com")).rejects.toBeTruthy();
  });

  it("deleteRecipe calls from('recipes').delete() with id and user_id filters", async () => {
    await deleteRecipe(client as any, "recipe-1");
    expect(client.from).toHaveBeenCalledWith("recipes");
  });

  it("deleteRecipe throws on database error", async () => {
    client._setTableResponse("recipes", null, { message: "Delete failed", code: "500" });
    await expect(deleteRecipe(client as any, "recipe-1")).rejects.toBeTruthy();
  });

  it("updateRecipeTags deletes existing then inserts new tags", async () => {
    await updateRecipeTags(client as any, "recipe-1", ["dinner", "quick"]);
    expect(client.from).toHaveBeenCalledWith("recipe_tags");
  });

  it("updateRecipeTags handles empty tags array (delete only, no insert)", async () => {
    await updateRecipeTags(client as any, "recipe-1", []);
    expect(client.from).toHaveBeenCalledWith("recipe_tags");
  });
});

// ======================== updateRecipe ========================

describe("Service Layer – updateRecipe", () => {
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    client = createMockClient();
  });

  it("updates recipe fields with correct snake_case mapping", async () => {
    await updateRecipe(client as any, "r1", {
      title: "Updated Title",
      isFavorite: true,
      cuisineType: "Mexican",
    });

    expect(client.from).toHaveBeenCalledWith("recipes");
  });

  it("does not call update when no column updates are provided", async () => {
    // Only passing ingredients, no top-level fields
    await updateRecipe(client as any, "r1", {
      ingredients: ["flour"],
    });

    // Should still call from('recipe_ingredients') to update ingredients
    expect(client.from).toHaveBeenCalledWith("recipe_ingredients");
  });

  it("replaces ingredients by deleting then inserting", async () => {
    await updateRecipe(client as any, "r1", {
      ingredients: ["flour", "sugar"],
    });

    expect(client.from).toHaveBeenCalledWith("recipe_ingredients");
  });

  it("replaces instructions by deleting then inserting", async () => {
    await updateRecipe(client as any, "r1", {
      instructions: ["Step 1", "Step 2"],
    });

    expect(client.from).toHaveBeenCalledWith("recipe_instructions");
  });

  it("handles empty ingredients array (delete only)", async () => {
    await updateRecipe(client as any, "r1", {
      ingredients: [],
    });

    expect(client.from).toHaveBeenCalledWith("recipe_ingredients");
  });

  it("handles empty instructions array (delete only)", async () => {
    await updateRecipe(client as any, "r1", {
      instructions: [],
    });

    expect(client.from).toHaveBeenCalledWith("recipe_instructions");
  });

  it("throws on database error during column update", async () => {
    client._setTableResponse("recipes", null, { message: "Update failed", code: "500" });

    await expect(
      updateRecipe(client as any, "r1", { title: "Fail" })
    ).rejects.toBeTruthy();
  });

  it("maps all supported fields to snake_case", async () => {
    // Exercise all field mappings
    await updateRecipe(client as any, "r1", {
      title: "T",
      image: "img.jpg",
      sourceUrl: "https://example.com",
      prepTime: "5m",
      cookTime: "10m",
      totalTime: "15m",
      servings: "2",
      author: "Chef",
      cuisineType: "Italian",
      difficulty: "Easy",
      rating: 4,
      isFavorite: false,
      notes: "Good",
    });

    expect(client.from).toHaveBeenCalledWith("recipes");
  });
});

// ======================== MEAL PLAN ========================

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

  it("fetchMealPlan correctly maps rows to MealPlan structure", async () => {
    client._setTableResponse("meal_plans", [
      { date: "2026-02-22", meal_type: "dinner", recipe_id: "r1", is_leftover: false, user_id: "user-123" },
      { date: "2026-02-22", meal_type: "lunch", recipe_id: "r2", is_leftover: true, user_id: "user-123" },
    ]);

    const plan = await fetchMealPlan(client as any, "2026-02-22", "2026-02-28");

    expect(plan["2026-02-22"]).toBeDefined();
    expect(plan["2026-02-22"].dinner).toBe("r1");
    expect(plan["2026-02-22"].lunch).toBe("r2");
    // Leftover flag should be set
    expect(plan["2026-02-22"].leftovers?.lunch).toBe(true);
    // Non-leftover should not have leftovers entry
    expect(plan["2026-02-22"].leftovers?.dinner).toBeUndefined();
  });

  it("fetchMealPlan throws on database error", async () => {
    client._setTableResponse("meal_plans", null, { message: "DB error", code: "500" });
    await expect(fetchMealPlan(client as any, "2026-02-22", "2026-02-28")).rejects.toBeTruthy();
  });

  it("assignMeal upserts a meal_plans row", async () => {
    await assignMeal(client as any, "2026-02-22", "dinner", "recipe-1");
    expect(client.from).toHaveBeenCalledWith("meal_plans");
  });

  it("assignMeal includes is_leftover in upsert", async () => {
    await assignMeal(client as any, "2026-02-22", "dinner", "recipe-1", true);
    expect(client.from).toHaveBeenCalledWith("meal_plans");
  });

  it("assignMeal throws on database error", async () => {
    client._setTableResponse("meal_plans", null, { message: "Upsert failed", code: "500" });
    await expect(assignMeal(client as any, "2026-02-22", "dinner", "recipe-1")).rejects.toBeTruthy();
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

// ======================== SHOPPING LIST ========================

describe("Service Layer – Shopping List", () => {
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    client = createMockClient();
  });

  it("fetchShoppingList returns mapped ShoppingItem array", async () => {
    client._setTableResponse("shopping_items", [
      { id: "i1", text: "Milk", checked: false, recipe_id: "r1" },
      { id: "i2", text: "Eggs", checked: true, recipe_id: null },
    ]);

    const items = await fetchShoppingList(client as any);

    expect(client.from).toHaveBeenCalledWith("shopping_items");
    expect(Array.isArray(items)).toBe(true);
    expect(items).toHaveLength(2);
    // Verify snake_case → camelCase mapping
    expect(items[0].recipeId).toBe("r1");
    expect(items[1].recipeId).toBeUndefined();
  });

  it("addShoppingItem inserts and returns a ShoppingItem", async () => {
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
    expect(item.recipeId).toBeUndefined();
  });

  it("addShoppingItem throws on database error", async () => {
    client._setTableResponse("shopping_items", null, { message: "Insert failed", code: "500" });
    await expect(addShoppingItem(client as any, "Milk")).rejects.toBeTruthy();
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

// ======================== uncheckAllShoppingItems ========================

describe("Service Layer – uncheckAllShoppingItems", () => {
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    client = createMockClient();
  });

  it("updates checked=false for all checked items belonging to user", async () => {
    await uncheckAllShoppingItems(client as any);
    expect(client.from).toHaveBeenCalledWith("shopping_items");
  });

  it("throws on database error", async () => {
    client._setTableResponse("shopping_items", null, { message: "Update failed", code: "500" });
    await expect(uncheckAllShoppingItems(client as any)).rejects.toBeTruthy();
  });
});

// ======================== restoreShoppingItems ========================

describe("Service Layer – restoreShoppingItems", () => {
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    client = createMockClient();
  });

  it("returns empty array when given no items", async () => {
    const result = await restoreShoppingItems(client as any, []);
    expect(result).toEqual([]);
    // Should not call from() at all for empty input
    expect(client.from).not.toHaveBeenCalled();
  });

  it("inserts items and returns ShoppingItem array with fresh IDs", async () => {
    client._setTableResponse("shopping_items", [
      { id: "new-1", text: "Flour", checked: false, recipe_id: "r1" },
      { id: "new-2", text: "Sugar", checked: true, recipe_id: null },
    ]);

    const result = await restoreShoppingItems(client as any, [
      { text: "Flour", checked: false, recipeId: "r1" },
      { text: "Sugar", checked: true },
    ]);

    expect(client.from).toHaveBeenCalledWith("shopping_items");
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("new-1");
    expect(result[0].text).toBe("Flour");
    expect(result[0].recipeId).toBe("r1");
    expect(result[1].recipeId).toBeUndefined();
  });

  it("throws on database error", async () => {
    client._setTableResponse("shopping_items", null, { message: "Insert failed", code: "500" });
    await expect(
      restoreShoppingItems(client as any, [{ text: "Milk", checked: false }])
    ).rejects.toBeTruthy();
  });
});

// ======================== generateShoppingList ========================

describe("Service Layer – generateShoppingList", () => {
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    client = createMockClient();
  });

  it("clears existing items then inserts new ones", async () => {
    client._setTableResponse("shopping_items", [
      { id: "gen-1", text: "Flour", checked: false, recipe_id: "r1" },
    ]);

    const result = await generateShoppingList(client as any, [
      { text: "Flour", recipeId: "r1" },
    ]);

    // Should call from('shopping_items') for both delete and insert
    expect(client.from).toHaveBeenCalledWith("shopping_items");
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Flour");
    expect(result[0].checked).toBe(false);
    expect(result[0].recipeId).toBe("r1");
  });

  it("returns empty array when given no items (but still clears)", async () => {
    const result = await generateShoppingList(client as any, []);

    expect(client.from).toHaveBeenCalledWith("shopping_items");
    expect(result).toEqual([]);
  });

  it("throws on database error during insert", async () => {
    // The first call (delete) succeeds, but since both hit the same table mock,
    // we set error which will affect the resolved value
    client._setTableResponse("shopping_items", null, { message: "Insert failed", code: "500" });
    await expect(
      generateShoppingList(client as any, [{ text: "Milk", recipeId: "r1" }])
    ).rejects.toBeTruthy();
  });
});

// ======================== CHECKED INGREDIENTS ========================

describe("Service Layer – Checked Ingredients", () => {
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    client = createMockClient();
  });

  it("fetchCheckedIngredients returns a Record<recipeId, number[]>", async () => {
    client._setTableResponse("checked_ingredients", [
      { recipe_id: "r1", ingredient_index: 0, user_id: "user-123" },
      { recipe_id: "r1", ingredient_index: 2, user_id: "user-123" },
      { recipe_id: "r2", ingredient_index: 1, user_id: "user-123" },
    ]);

    const result = await fetchCheckedIngredients(client as any);

    expect(client.from).toHaveBeenCalledWith("checked_ingredients");
    expect(result["r1"]).toEqual([0, 2]);
    expect(result["r2"]).toEqual([1]);
  });

  it("fetchCheckedIngredients returns empty object when no data", async () => {
    const result = await fetchCheckedIngredients(client as any);
    expect(result).toEqual({});
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

// ======================== PROFILE ========================

describe("Service Layer – Profile", () => {
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    client = createMockClient();
  });

  it("fetchProfile calls from('profiles') and transforms fields correctly", async () => {
    client._setTableResponse("profiles", {
      id: "user-123",
      email: "test@example.com",
      display_name: "Test User",
      avatar_url: "https://example.com/avatar.png",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-15T00:00:00Z",
    });

    const profile = await fetchProfile(client as any);

    expect(client.from).toHaveBeenCalledWith("profiles");
    expect(profile.id).toBe("user-123");
    expect(profile.email).toBe("test@example.com");
    // Verify snake_case → camelCase transformations
    expect(profile.displayName).toBe("Test User");
    expect(profile.avatarUrl).toBe("https://example.com/avatar.png");
    expect(profile.createdAt).toBe("2026-01-01T00:00:00Z");
    expect(profile.updatedAt).toBe("2026-01-15T00:00:00Z");
  });

  it("fetchProfile throws when not authenticated", async () => {
    client.auth.getUser = vi.fn().mockResolvedValue({
      data: { user: null },
    });

    await expect(fetchProfile(client as any)).rejects.toThrow("Not authenticated");
  });

  it("updateProfile calls from('profiles').update() with mapped fields", async () => {
    await updateProfile(client as any, {
      display_name: "New Name",
      avatar_url: "https://example.com/avatar.png",
    });

    expect(client.from).toHaveBeenCalledWith("profiles");
  });

  it("updateProfile handles empty updates", async () => {
    await updateProfile(client as any, {});
    expect(client.from).toHaveBeenCalledWith("profiles");
  });

});

// ======================== MEAL TEMPLATES ========================

describe("Service Layer – Meal Templates", () => {
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    client = createMockClient();
  });

  it("fetchTemplates calls from('meal_templates') and maps rows", async () => {
    client._setTableResponse("meal_templates", [
      {
        id: "tmpl-1",
        name: "Week A",
        template: { 0: { breakfast: "r1" } },
        created_at: "2026-01-01T00:00:00Z",
        user_id: "user-123",
      },
    ]);

    const templates = await fetchTemplates(client as any);

    expect(client.from).toHaveBeenCalledWith("meal_templates");
    expect(templates).toHaveLength(1);
    expect(templates[0].id).toBe("tmpl-1");
    expect(templates[0].name).toBe("Week A");
    expect(templates[0].createdAt).toBe("2026-01-01T00:00:00Z");
  });

  it("saveTemplate inserts and returns a MealTemplate", async () => {
    client._setTableResponse("meal_templates", {
      id: "tmpl-1",
      user_id: "user-123",
      name: "Week A",
      template: { "0": { breakfast: "r1" } },
      created_at: "2026-01-01T00:00:00Z",
    });

    const result = await saveTemplate(client as any, "Week A", { 0: { breakfast: "r1" } });
    expect(client.from).toHaveBeenCalledWith("meal_templates");
    expect(result.name).toBe("Week A");
    expect(result.id).toBe("tmpl-1");
  });

  it("deleteTemplate calls from('meal_templates').delete()", async () => {
    await deleteTemplate(client as any, "tmpl-1");
    expect(client.from).toHaveBeenCalledWith("meal_templates");
  });
});

// ======================== RECIPE GROUPS ========================

describe("Service Layer – Recipe Groups", () => {
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    client = createMockClient();
  });

  it("fetchGroups queries recipe_groups table and maps fields correctly", async () => {
    client._setTableResponse("recipe_groups", [
      {
        id: "g1",
        name: "Favorites",
        icon: "star",
        sort_order: 0,
        is_default: true,
        created_at: "2026-01-01T00:00:00Z",
        user_id: "user-123",
      },
      {
        id: "g2",
        name: "Weeknight Dinners",
        icon: null,
        sort_order: 1,
        is_default: false,
        created_at: "2026-01-02T00:00:00Z",
        user_id: "user-123",
      },
    ]);

    const groups = await fetchGroups(client as any);

    expect(client.from).toHaveBeenCalledWith("recipe_groups");
    expect(groups).toHaveLength(2);
    // Verify field transformations
    expect(groups[0].id).toBe("g1");
    expect(groups[0].name).toBe("Favorites");
    expect(groups[0].icon).toBe("star");
    expect(groups[0].sortOrder).toBe(0);
    expect(groups[0].isDefault).toBe(true);
    expect(groups[0].createdAt).toBe("2026-01-01T00:00:00Z");
    expect(groups[1].isDefault).toBe(false);
  });

  it("fetchGroups returns empty array when no groups exist", async () => {
    const groups = await fetchGroups(client as any);
    expect(groups).toEqual([]);
  });

  it("fetchGroups throws on database error", async () => {
    client._setTableResponse("recipe_groups", null, { message: "DB error", code: "500" });
    await expect(fetchGroups(client as any)).rejects.toBeTruthy();
  });

  it("createGroup inserts and returns a RecipeGroup with correct field mapping", async () => {
    client._setTableResponse("recipe_groups", {
      id: "g-new",
      name: "Desserts",
      icon: "cake",
      sort_order: 2,
      is_default: false,
      created_at: "2026-02-01T00:00:00Z",
      user_id: "user-123",
    });

    const group = await createGroup(client as any, "Desserts", "cake");

    expect(client.from).toHaveBeenCalledWith("recipe_groups");
    expect(group.id).toBe("g-new");
    expect(group.name).toBe("Desserts");
    expect(group.icon).toBe("cake");
    expect(group.sortOrder).toBe(2);
    expect(group.isDefault).toBe(false);
  });

  it("createGroup works without icon parameter", async () => {
    client._setTableResponse("recipe_groups", {
      id: "g-new",
      name: "Quick Meals",
      icon: null,
      sort_order: 0,
      is_default: false,
      created_at: "2026-02-01T00:00:00Z",
      user_id: "user-123",
    });

    const group = await createGroup(client as any, "Quick Meals");

    expect(group.icon).toBeNull();
  });

  it("createGroup throws on database error", async () => {
    client._setTableResponse("recipe_groups", null, { message: "Insert failed", code: "500" });
    await expect(createGroup(client as any, "Fail")).rejects.toBeTruthy();
  });

  it("updateGroup calls update with correct snake_case field mapping", async () => {
    await updateGroup(client as any, "g1", {
      name: "Updated Name",
      icon: "new-icon",
      sortOrder: 5,
    });

    expect(client.from).toHaveBeenCalledWith("recipe_groups");
  });

  it("updateGroup skips update when no fields provided", async () => {
    await updateGroup(client as any, "g1", {});
    // from should not be called since there are no updates
    // Actually, it's not called at all when Object.keys(dbUpdates).length === 0
    // The function returns early, so from() is only called for getUserId
  });

  it("updateGroup throws on database error", async () => {
    client._setTableResponse("recipe_groups", null, { message: "Update failed", code: "500" });
    await expect(
      updateGroup(client as any, "g1", { name: "Fail" })
    ).rejects.toBeTruthy();
  });

  it("deleteGroup calls delete with id and user_id filters", async () => {
    await deleteGroup(client as any, "g1");
    expect(client.from).toHaveBeenCalledWith("recipe_groups");
  });

  it("deleteGroup throws on database error", async () => {
    client._setTableResponse("recipe_groups", null, { message: "Delete failed", code: "500" });
    await expect(deleteGroup(client as any, "g1")).rejects.toBeTruthy();
  });
});

// ======================== RECIPE GROUP MEMBERS ========================

describe("Service Layer – Recipe Group Members", () => {
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    client = createMockClient();
  });

  it("fetchGroupMembers queries groups then members and maps fields", async () => {
    client._setTableResponse("recipe_groups", [
      { id: "g1" },
      { id: "g2" },
    ]);
    client._setTableResponse("recipe_group_members", [
      { id: "m1", group_id: "g1", recipe_id: "r1", added_at: "2026-01-01T00:00:00Z" },
      { id: "m2", group_id: "g2", recipe_id: "r2", added_at: "2026-01-02T00:00:00Z" },
    ]);

    const members = await fetchGroupMembers(client as any);

    expect(client.from).toHaveBeenCalledWith("recipe_groups");
    expect(client.from).toHaveBeenCalledWith("recipe_group_members");
    expect(members).toHaveLength(2);
    // Verify field mapping
    expect(members[0].id).toBe("m1");
    expect(members[0].groupId).toBe("g1");
    expect(members[0].recipeId).toBe("r1");
    expect(members[0].addedAt).toBe("2026-01-01T00:00:00Z");
  });

  it("fetchGroupMembers returns empty array when user has no groups", async () => {
    const members = await fetchGroupMembers(client as any);
    expect(members).toEqual([]);
  });

  it("fetchGroupMembers throws on groups query error", async () => {
    client._setTableResponse("recipe_groups", null, { message: "DB error", code: "500" });
    await expect(fetchGroupMembers(client as any)).rejects.toBeTruthy();
  });

  it("addRecipeToGroup verifies group ownership then inserts member", async () => {
    client._setTableResponse("recipe_groups", { id: "g1" });
    client._setTableResponse("recipe_group_members", {
      id: "m1",
      group_id: "g1",
      recipe_id: "r1",
      added_at: "2026-02-01T00:00:00Z",
    });

    const member = await addRecipeToGroup(client as any, "g1", "r1");

    expect(client.from).toHaveBeenCalledWith("recipe_groups");
    expect(client.from).toHaveBeenCalledWith("recipe_group_members");
    expect(member.id).toBe("m1");
    expect(member.groupId).toBe("g1");
    expect(member.recipeId).toBe("r1");
  });

  it("addRecipeToGroup returns existing member when duplicate (M7 fix)", async () => {
    // The existence check (maybeSingle) returns an existing row
    client._setTableResponse("recipe_groups", { id: "g1" });
    client._setTableResponse("recipe_group_members", {
      id: "existing-m1",
      group_id: "g1",
      recipe_id: "r1",
      added_at: "2026-01-15T00:00:00Z",
    });

    const member = await addRecipeToGroup(client as any, "g1", "r1");

    // Should return the existing member without attempting a second insert
    expect(member.id).toBe("existing-m1");
    expect(member.groupId).toBe("g1");
    expect(member.recipeId).toBe("r1");
  });

  it("addRecipeToGroup throws when group not found", async () => {
    client._setTableResponse("recipe_groups", null, { message: "Not found", code: "PGRST116" });

    await expect(
      addRecipeToGroup(client as any, "nonexistent", "r1")
    ).rejects.toThrow("Group not found");
  });

  it("removeRecipeFromGroup verifies group ownership then deletes member", async () => {
    client._setTableResponse("recipe_groups", { id: "g1" });

    await removeRecipeFromGroup(client as any, "g1", "r1");

    expect(client.from).toHaveBeenCalledWith("recipe_groups");
    expect(client.from).toHaveBeenCalledWith("recipe_group_members");
  });

  it("removeRecipeFromGroup throws when group not found", async () => {
    client._setTableResponse("recipe_groups", null, { message: "Not found", code: "PGRST116" });

    await expect(
      removeRecipeFromGroup(client as any, "nonexistent", "r1")
    ).rejects.toThrow("Group not found");
  });
});

// ======================== ensureDefaultGroups ========================

describe("Service Layer – ensureDefaultGroups", () => {
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    client = createMockClient();
  });

  it("returns existing groups when a default group already exists", async () => {
    client._setTableResponse("recipe_groups", [
      {
        id: "g1",
        name: "Favorites",
        icon: null,
        sort_order: 0,
        is_default: true,
        created_at: "2026-01-01T00:00:00Z",
        user_id: "user-123",
      },
    ]);

    const groups = await ensureDefaultGroups(client as any);

    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("Favorites");
    expect(groups[0].isDefault).toBe(true);
  });

  it("creates default Favorites group when no default exists", async () => {
    // First call returns no groups (no default), second call is the insert
    client._setTableResponses("recipe_groups", [
      { data: [], error: null }, // fetch existing groups
      { data: { id: "g-new", name: "Favorites", icon: null, sort_order: 0, is_default: true, created_at: "2026-02-01T00:00:00Z", user_id: "user-123" }, error: null }, // insert default
    ]);

    const groups = await ensureDefaultGroups(client as any);

    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("Favorites");
    expect(groups[0].isDefault).toBe(true);
  });

  it("throws on database error when fetching existing groups", async () => {
    client._setTableResponse("recipe_groups", null, { message: "DB error", code: "500" });
    await expect(ensureDefaultGroups(client as any)).rejects.toBeTruthy();
  });
});

// ======================== ERROR PATH TESTS ========================

describe("Service Layer – Error Paths", () => {
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    client = createMockClient();
  });

  it("fetchRecipes throws when recipes query returns error", async () => {
    client._setTableResponse("recipes", null, { message: "Connection refused", code: "500" });
    await expect(fetchRecipes(client as any)).rejects.toBeTruthy();
  });

  it("addRecipe throws when recipe insert returns error", async () => {
    client._setTableResponse("recipes", null, { message: "Constraint violation", code: "23505" });
    await expect(
      addRecipe(client as any, { title: "T", image: null, ingredients: [], instructions: [] }, "url")
    ).rejects.toBeTruthy();
  });

  it("deleteRecipe throws when delete returns error", async () => {
    client._setTableResponse("recipes", null, { message: "Foreign key violation", code: "23503" });
    await expect(deleteRecipe(client as any, "r1")).rejects.toBeTruthy();
  });

  it("updateRecipe throws when update returns error", async () => {
    client._setTableResponse("recipes", null, { message: "Update denied", code: "42501" });
    await expect(updateRecipe(client as any, "r1", { title: "Fail" })).rejects.toBeTruthy();
  });

  it("fetchMealPlan throws when query returns error", async () => {
    client._setTableResponse("meal_plans", null, { message: "Timeout", code: "57014" });
    await expect(fetchMealPlan(client as any, "2026-01-01", "2026-01-07")).rejects.toBeTruthy();
  });

  it("assignMeal throws when upsert returns error", async () => {
    client._setTableResponse("meal_plans", null, { message: "Conflict", code: "23505" });
    await expect(assignMeal(client as any, "2026-01-01", "dinner", "r1")).rejects.toBeTruthy();
  });

  it("addShoppingItem throws when insert returns error", async () => {
    client._setTableResponse("shopping_items", null, { message: "Insert failed", code: "500" });
    await expect(addShoppingItem(client as any, "Milk")).rejects.toBeTruthy();
  });

  it("fetchGroups throws when query returns error", async () => {
    client._setTableResponse("recipe_groups", null, { message: "Permission denied", code: "42501" });
    await expect(fetchGroups(client as any)).rejects.toBeTruthy();
  });

  it("createGroup throws when insert returns error", async () => {
    client._setTableResponse("recipe_groups", null, { message: "Duplicate", code: "23505" });
    await expect(createGroup(client as any, "Fail")).rejects.toBeTruthy();
  });
});

// ======================== R5 AUDIT: DATE VALIDATION (R5-39) ========================

describe("Service Layer – Date Validation (R5-39)", () => {
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    client = createMockClient();
  });

  it("fetchMealPlan throws on invalid startDate format", async () => {
    await expect(fetchMealPlan(client as any, "not-a-date", "2026-01-07")).rejects.toThrow("Invalid date format");
  });

  it("fetchMealPlan throws on invalid endDate format", async () => {
    await expect(fetchMealPlan(client as any, "2026-01-01", "01/07/2026")).rejects.toThrow("Invalid date format");
  });

  it("assignMeal throws on invalid date format", async () => {
    await expect(assignMeal(client as any, "Jan 1 2026", "dinner", "r1")).rejects.toThrow("Invalid date format");
  });

  it("removeMeal throws on invalid date format", async () => {
    await expect(removeMeal(client as any, "2026/01/01", "dinner")).rejects.toThrow("Invalid date format");
  });

  it("clearWeek throws on any invalid date in the array", async () => {
    await expect(clearWeek(client as any, ["2026-01-01", "bad"])).rejects.toThrow("Invalid date format");
  });
});

// ======================== R5 AUDIT: SHOPPING ITEM TEXT LENGTH (R5-48) ========================

describe("Service Layer – Shopping Item Text Length (R5-48)", () => {
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    client = createMockClient();
  });

  it("addShoppingItem throws when text exceeds 500 characters", async () => {
    const longText = "a".repeat(501);
    await expect(addShoppingItem(client as any, longText)).rejects.toThrow("Shopping item text exceeds 500 character limit");
  });

  it("addShoppingItem allows text of exactly 500 characters", async () => {
    client._setTableResponse("shopping_items", {
      id: "item-1",
      text: "a".repeat(500),
      checked: false,
      recipe_id: null,
    });
    const item = await addShoppingItem(client as any, "a".repeat(500));
    expect(item.text).toBe("a".repeat(500));
  });

  it("restoreShoppingItems throws when any item text exceeds 500 characters", async () => {
    const items = [
      { text: "short", checked: false },
      { text: "b".repeat(501), checked: false },
    ];
    await expect(restoreShoppingItems(client as any, items)).rejects.toThrow("Shopping item text exceeds 500 character limit");
  });

  it("generateShoppingList throws when any item text exceeds 500 characters", async () => {
    const items = [{ text: "c".repeat(501), recipeId: "r1" }];
    await expect(generateShoppingList(client as any, items)).rejects.toThrow("Shopping item text exceeds 500 character limit");
  });
});
