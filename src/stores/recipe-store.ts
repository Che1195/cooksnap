"use client";

import { create } from "zustand";
import { createClient } from "@/lib/supabase/client";
import * as db from "@/lib/supabase/service";
import type {
  Recipe,
  MealPlan,
  MealPlanDay,
  ShoppingItem,
  ScrapedRecipe,
  MealSlot,
} from "@/types";

function getClient() {
  return createClient();
}

let tempIdCounter = 0;
function nextTempId() {
  return `temp-${Date.now()}-${++tempIdCounter}`;
}

interface RecipeStore {
  recipes: Recipe[];
  mealPlan: MealPlan;
  shoppingList: ShoppingItem[];
  checkedIngredients: Record<string, number[]>;
  isLoading: boolean;
  error: string | null;

  // Lifecycle actions
  hydrate: () => Promise<void>;
  clear: () => void;
  migrateFromLocalStorage: () => Promise<{ migrated: boolean; recipeCount: number }>;

  // Recipe actions
  addRecipe: (scraped: ScrapedRecipe, sourceUrl: string) => void;
  updateRecipe: (id: string, updates: Partial<Omit<Recipe, "id" | "createdAt">>) => void;
  deleteRecipe: (id: string) => void;
  updateTags: (id: string, tags: string[]) => void;

  // Ingredient checklist actions
  toggleIngredient: (recipeId: string, index: number) => void;
  clearCheckedIngredients: (recipeId: string) => void;

  // Meal plan actions
  assignMeal: (date: string, slot: MealSlot, recipeId: string | undefined) => void;
  clearWeek: (weekDates: string[]) => void;

  // Shopping list actions
  generateShoppingList: (weekDates: string[]) => void;
  addShoppingItem: (text: string) => void;
  toggleShoppingItem: (id: string) => void;
  clearCheckedItems: () => void;
  clearShoppingList: () => void;
}

export const useRecipeStore = create<RecipeStore>()((set, get) => ({
  recipes: [],
  mealPlan: {},
  shoppingList: [],
  checkedIngredients: {},
  isLoading: false,
  error: null,

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------

  hydrate: async () => {
    set({ isLoading: true, error: null });
    try {
      const client = getClient();
      const [recipes, shoppingList, checkedIngredients] = await Promise.all([
        db.fetchRecipes(client),
        db.fetchShoppingList(client),
        db.fetchCheckedIngredients(client),
      ]);
      set({ recipes, shoppingList, checkedIngredients, isLoading: false });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load data";
      console.error("Hydrate error:", e);
      set({ error: msg, isLoading: false });
    }
  },

  clear: () => {
    set({
      recipes: [],
      mealPlan: {},
      shoppingList: [],
      checkedIngredients: {},
      isLoading: false,
      error: null,
    });
  },

  migrateFromLocalStorage: async () => {
    const raw = typeof window !== "undefined"
      ? localStorage.getItem("cooksnap-storage")
      : null;

    if (!raw) return { migrated: false, recipeCount: 0 };

    try {
      const parsed = JSON.parse(raw);
      const state = parsed?.state ?? parsed;
      const recipes: Recipe[] = state?.recipes ?? [];

      if (recipes.length === 0) return { migrated: false, recipeCount: 0 };

      const client = getClient();

      // Import each recipe into Supabase
      for (const recipe of recipes) {
        const scraped: ScrapedRecipe = {
          title: recipe.title,
          image: recipe.image,
          ingredients: recipe.ingredients,
          instructions: recipe.instructions,
          prepTime: recipe.prepTime,
          cookTime: recipe.cookTime,
          totalTime: recipe.totalTime,
          servings: recipe.servings,
          author: recipe.author,
          cuisineType: recipe.cuisineType,
        };
        const newRecipe = await db.addRecipe(client, scraped, recipe.sourceUrl);

        // Migrate tags
        if (recipe.tags && recipe.tags.length > 0) {
          await db.updateRecipeTags(client, newRecipe.id, recipe.tags);
        }

        // Migrate extra fields (difficulty, rating, isFavorite, notes)
        const extras: Partial<Omit<Recipe, "id" | "createdAt">> = {};
        if (recipe.difficulty) extras.difficulty = recipe.difficulty;
        if (recipe.rating != null) extras.rating = recipe.rating;
        if (recipe.isFavorite) extras.isFavorite = recipe.isFavorite;
        if (recipe.notes) extras.notes = recipe.notes;
        if (Object.keys(extras).length > 0) {
          await db.updateRecipe(client, newRecipe.id, extras);
        }
      }

      // Remove old localStorage data after successful migration
      localStorage.removeItem("cooksnap-storage");

      // Re-hydrate from Supabase to get consistent state
      await get().hydrate();

      return { migrated: true, recipeCount: recipes.length };
    } catch (e) {
      console.error("Migration from localStorage failed:", e);
      return { migrated: false, recipeCount: 0 };
    }
  },

  // ------------------------------------------------------------------
  // Recipe actions
  // ------------------------------------------------------------------

  addRecipe: (scraped, sourceUrl) => {
    // Optimistic: add a temporary recipe with a placeholder id
    const tempId = nextTempId();
    const optimistic: Recipe = {
      id: tempId,
      title: scraped.title,
      image: scraped.image,
      ingredients: scraped.ingredients,
      instructions: scraped.instructions,
      sourceUrl,
      tags: [],
      createdAt: new Date().toISOString(),
      prepTime: scraped.prepTime ?? null,
      cookTime: scraped.cookTime ?? null,
      totalTime: scraped.totalTime ?? null,
      servings: scraped.servings ?? null,
      author: scraped.author ?? null,
      cuisineType: scraped.cuisineType ?? null,
    };
    set((state) => ({ recipes: [optimistic, ...state.recipes] }));

    // Sync to Supabase
    const client = getClient();
    db.addRecipe(client, scraped, sourceUrl)
      .then((saved) => {
        // Replace temp recipe with the real one from DB
        set((state) => ({
          recipes: state.recipes.map((r) => (r.id === tempId ? saved : r)),
        }));
      })
      .catch((e) => {
        console.error("Failed to save recipe:", e);
        set({ error: "Failed to save recipe to cloud" });
      });
  },

  updateRecipe: (id, updates) => {
    // Optimistic update
    set((state) => ({
      recipes: state.recipes.map((r) =>
        r.id === id ? { ...r, ...updates } : r
      ),
    }));

    const client = getClient();
    db.updateRecipe(client, id, updates).catch((e) => {
      console.error("Failed to update recipe:", e);
      set({ error: "Failed to update recipe in cloud" });
    });
  },

  deleteRecipe: (id) => {
    // Optimistic delete
    set((state) => ({
      recipes: state.recipes.filter((r) => r.id !== id),
    }));

    const client = getClient();
    db.deleteRecipe(client, id).catch((e) => {
      console.error("Failed to delete recipe:", e);
      set({ error: "Failed to delete recipe from cloud" });
    });
  },

  updateTags: (id, tags) => {
    // Optimistic update
    set((state) => ({
      recipes: state.recipes.map((r) =>
        r.id === id ? { ...r, tags } : r
      ),
    }));

    const client = getClient();
    db.updateRecipeTags(client, id, tags).catch((e) => {
      console.error("Failed to update tags:", e);
      set({ error: "Failed to update tags in cloud" });
    });
  },

  // ------------------------------------------------------------------
  // Ingredient checklist actions
  // ------------------------------------------------------------------

  toggleIngredient: (recipeId, index) => {
    const current = get().checkedIngredients[recipeId] || [];
    const isChecked = current.includes(index);
    const updated = isChecked
      ? current.filter((i) => i !== index)
      : [...current, index];

    // Optimistic update
    set((state) => ({
      checkedIngredients: {
        ...state.checkedIngredients,
        [recipeId]: updated,
      },
    }));

    const client = getClient();
    db.toggleIngredient(client, recipeId, index, !isChecked).catch((e) => {
      console.error("Failed to toggle ingredient:", e);
      set({ error: "Failed to sync ingredient check" });
    });
  },

  clearCheckedIngredients: (recipeId) => {
    // Optimistic update
    set((state) => {
      const updated = { ...state.checkedIngredients };
      delete updated[recipeId];
      return { checkedIngredients: updated };
    });

    const client = getClient();
    db.clearCheckedIngredients(client, recipeId).catch((e) => {
      console.error("Failed to clear checked ingredients:", e);
      set({ error: "Failed to sync ingredient checks" });
    });
  },

  // ------------------------------------------------------------------
  // Meal plan actions
  // ------------------------------------------------------------------

  assignMeal: (date, slot, recipeId) => {
    // Optimistic update
    set((state) => {
      const day: MealPlanDay = state.mealPlan[date] || {};
      return {
        mealPlan: {
          ...state.mealPlan,
          [date]: { ...day, [slot]: recipeId },
        },
      };
    });

    const client = getClient();
    if (recipeId) {
      db.assignMeal(client, date, slot, recipeId).catch((e) => {
        console.error("Failed to assign meal:", e);
        set({ error: "Failed to save meal assignment" });
      });
    } else {
      db.removeMeal(client, date, slot).catch((e) => {
        console.error("Failed to remove meal:", e);
        set({ error: "Failed to remove meal assignment" });
      });
    }
  },

  clearWeek: (weekDates) => {
    // Optimistic update
    set((state) => {
      const newPlan = { ...state.mealPlan };
      for (const date of weekDates) {
        delete newPlan[date];
      }
      return { mealPlan: newPlan };
    });

    const client = getClient();
    db.clearWeek(client, weekDates).catch((e) => {
      console.error("Failed to clear week:", e);
      set({ error: "Failed to clear week in cloud" });
    });
  },

  // ------------------------------------------------------------------
  // Shopping list actions
  // ------------------------------------------------------------------

  generateShoppingList: (weekDates) => {
    const { mealPlan, recipes } = get();
    const items: { text: string; recipeId: string }[] = [];
    const seen = new Set<string>();

    for (const date of weekDates) {
      const day = mealPlan[date];
      if (!day) continue;
      const slots: MealSlot[] = ["breakfast", "lunch", "dinner"];
      for (const slot of slots) {
        const recipeId = day[slot];
        if (!recipeId) continue;
        const recipe = recipes.find((r) => r.id === recipeId);
        if (!recipe) continue;
        for (const ingredient of recipe.ingredients) {
          const key = ingredient.toLowerCase().trim();
          if (!seen.has(key)) {
            seen.add(key);
            items.push({ text: ingredient, recipeId: recipe.id });
          }
        }
      }
    }

    // Optimistic: set a local placeholder list
    set({
      shoppingList: items.map((item, i) => ({
        id: nextTempId(),
        text: item.text,
        checked: false,
        recipeId: item.recipeId,
      })),
    });

    // Sync to Supabase
    const client = getClient();
    db.generateShoppingList(client, items)
      .then((saved) => {
        set({ shoppingList: saved });
      })
      .catch((e) => {
        console.error("Failed to generate shopping list:", e);
        set({ error: "Failed to generate shopping list" });
      });
  },

  addShoppingItem: (text) => {
    const tempId = nextTempId();

    // Optimistic update
    set((state) => ({
      shoppingList: [
        ...state.shoppingList,
        { id: tempId, text, checked: false },
      ],
    }));

    const client = getClient();
    db.addShoppingItem(client, text)
      .then((saved) => {
        set((state) => ({
          shoppingList: state.shoppingList.map((item) =>
            item.id === tempId ? saved : item
          ),
        }));
      })
      .catch((e) => {
        console.error("Failed to add shopping item:", e);
        set({ error: "Failed to add shopping item" });
      });
  },

  toggleShoppingItem: (id) => {
    const item = get().shoppingList.find((i) => i.id === id);
    if (!item) return;

    const newChecked = !item.checked;

    // Optimistic update
    set((state) => ({
      shoppingList: state.shoppingList.map((i) =>
        i.id === id ? { ...i, checked: newChecked } : i
      ),
    }));

    const client = getClient();
    db.toggleShoppingItem(client, id, newChecked).catch((e) => {
      console.error("Failed to toggle shopping item:", e);
      set({ error: "Failed to update shopping item" });
    });
  },

  clearCheckedItems: () => {
    const prev = get().shoppingList;

    // Optimistic update
    set({ shoppingList: prev.filter((item) => !item.checked) });

    const client = getClient();
    db.clearCheckedItems(client).catch((e) => {
      console.error("Failed to clear checked items:", e);
      set({ error: "Failed to clear checked items" });
    });
  },

  clearShoppingList: () => {
    // Optimistic update
    set({ shoppingList: [] });

    const client = getClient();
    db.clearShoppingList(client).catch((e) => {
      console.error("Failed to clear shopping list:", e);
      set({ error: "Failed to clear shopping list" });
    });
  },
}));
