"use client";

import { create } from "zustand";
import { createClient } from "@/lib/supabase/client";
import * as db from "@/lib/supabase/service";
import type {
  Recipe,
  MealPlan,
  MealPlanDay,
  MealTemplate,
  ShoppingItem,
  ScrapedRecipe,
  MealSlot,
} from "@/types";
import { SLOTS } from "@/lib/constants";
import { getTodayISO, getWeekDates } from "@/lib/utils";

function getClient() {
  return createClient();
}

/** Extracts a readable message from Supabase PostgrestError or generic errors. */
function formatError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

let tempIdCounter = 0;
function nextTempId() {
  return `temp-${Date.now()}-${++tempIdCounter}`;
}

interface RecipeStore {
  recipes: Recipe[];
  mealPlan: MealPlan;
  mealTemplates: MealTemplate[];
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
  assignMeal: (date: string, slot: MealSlot, recipeId: string | undefined, isLeftover?: boolean) => void;
  clearWeek: (weekDates: string[]) => void;
  fetchMealPlanForWeek: (startDate: string, endDate: string) => Promise<void>;

  // Meal template actions
  fetchTemplates: () => Promise<void>;
  saveWeekAsTemplate: (name: string, weekDates: string[]) => void;
  applyTemplate: (templateId: string, weekDates: string[]) => void;
  deleteTemplate: (id: string) => void;

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
  mealTemplates: [],
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
      // Compute a 3-week window (prev, current, next) around today
      const prevWeek = getWeekDates(-1);
      const nextWeek = getWeekDates(1);
      const startStr = prevWeek[0];
      const endStr = nextWeek[6];

      const [recipes, shoppingList, checkedIngredients, mealPlan] = await Promise.all([
        db.fetchRecipes(client),
        db.fetchShoppingList(client),
        db.fetchCheckedIngredients(client),
        db.fetchMealPlan(client, startStr, endStr),
      ]);
      set({ recipes, shoppingList, checkedIngredients, mealPlan, isLoading: false });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load data";
      console.error("Hydrate error:", formatError(e));
      set({ error: msg, isLoading: false });
    }
  },

  clear: () => {
    set({
      recipes: [],
      mealPlan: {},
      mealTemplates: [],
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
      console.error("Migration from localStorage failed:", formatError(e));
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
        console.error("Failed to save recipe:", formatError(e));
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
      console.error("Failed to update recipe:", formatError(e));
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
      console.error("Failed to delete recipe:", formatError(e));
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
      console.error("Failed to update tags:", formatError(e));
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
      console.error("Failed to toggle ingredient:", formatError(e));
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
      console.error("Failed to clear checked ingredients:", formatError(e));
      set({ error: "Failed to sync ingredient checks" });
    });
  },

  // ------------------------------------------------------------------
  // Meal plan actions
  // ------------------------------------------------------------------

  assignMeal: (date, slot, recipeId, isLeftover = false) => {
    // Optimistic update
    set((state) => {
      const day: MealPlanDay = state.mealPlan[date] || {};
      const updatedDay = { ...day, [slot]: recipeId };
      if (isLeftover) {
        updatedDay.leftovers = { ...(day.leftovers || {}), [slot]: true };
      } else if (recipeId) {
        // Clear leftover flag if assigning a non-leftover recipe
        const leftovers = { ...(day.leftovers || {}) };
        delete leftovers[slot];
        updatedDay.leftovers = Object.keys(leftovers).length > 0 ? leftovers : undefined;
      }
      return {
        mealPlan: {
          ...state.mealPlan,
          [date]: updatedDay,
        },
      };
    });

    const client = getClient();
    if (recipeId) {
      db.assignMeal(client, date, slot, recipeId, isLeftover).catch((e) => {
        console.error("Failed to assign meal:", formatError(e));
        set({ error: "Failed to save meal assignment" });
      });
    } else {
      db.removeMeal(client, date, slot).catch((e) => {
        console.error("Failed to remove meal:", formatError(e));
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
      console.error("Failed to clear week:", formatError(e));
      set({ error: "Failed to clear week in cloud" });
    });
  },

  fetchMealPlanForWeek: async (startDate, endDate) => {
    try {
      const client = getClient();
      const fetched = await db.fetchMealPlan(client, startDate, endDate);
      // Merge fetched data into existing mealPlan state
      set((state) => ({
        mealPlan: { ...state.mealPlan, ...fetched },
      }));
    } catch (e) {
      console.error("Failed to fetch meal plan for week:", formatError(e));
    }
  },

  // ------------------------------------------------------------------
  // Meal template actions
  // ------------------------------------------------------------------

  fetchTemplates: async () => {
    try {
      const client = getClient();
      const templates = await db.fetchTemplates(client);
      set({ mealTemplates: templates });
    } catch (e) {
      console.error("Failed to fetch templates:", formatError(e));
      set({ error: "Failed to load meal templates" });
    }
  },

  saveWeekAsTemplate: (name, weekDates) => {
    const { mealPlan } = get();
    const days: Record<number, MealPlanDay> = {};
    for (let i = 0; i < weekDates.length; i++) {
      const day = mealPlan[weekDates[i]];
      if (day) days[i] = day;
    }

    // Optimistic: add a temporary template
    const tempId = nextTempId();
    const optimistic: MealTemplate = {
      id: tempId,
      name,
      days,
      createdAt: new Date().toISOString(),
    };
    set((state) => ({ mealTemplates: [optimistic, ...state.mealTemplates] }));

    const client = getClient();
    db.saveTemplate(client, name, days)
      .then((saved) => {
        set((state) => ({
          mealTemplates: state.mealTemplates.map((t) => (t.id === tempId ? saved : t)),
        }));
      })
      .catch((e) => {
        console.error("Failed to save template:", formatError(e));
        set({ error: "Failed to save template" });
      });
  },

  applyTemplate: (templateId, weekDates) => {
    const template = get().mealTemplates.find((t) => t.id === templateId);
    if (!template) return;

    const client = getClient();
    // Apply template days to the target week dates
    for (let i = 0; i < weekDates.length; i++) {
      const templateDay = template.days[i];
      if (!templateDay) continue;
      const date = weekDates[i];
      for (const slot of SLOTS) {
        const recipeId = templateDay[slot];
        if (recipeId) {
          get().assignMeal(date, slot, recipeId);
        }
      }
    }
  },

  deleteTemplate: (id) => {
    // Optimistic delete
    set((state) => ({
      mealTemplates: state.mealTemplates.filter((t) => t.id !== id),
    }));

    const client = getClient();
    db.deleteTemplate(client, id).catch((e) => {
      console.error("Failed to delete template:", formatError(e));
      set({ error: "Failed to delete template" });
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
      for (const slot of SLOTS) {
        // Skip slots flagged as leftovers — no new ingredients needed
        if (day.leftovers?.[slot]) continue;
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
        console.error("Failed to generate shopping list:", formatError(e));
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
        console.error("Failed to add shopping item:", formatError(e));
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
      console.error("Failed to toggle shopping item:", formatError(e));
      set({ error: "Failed to update shopping item" });
    });
  },

  clearCheckedItems: () => {
    const prev = get().shoppingList;

    // Optimistic update
    set({ shoppingList: prev.filter((item) => !item.checked) });

    const client = getClient();
    db.clearCheckedItems(client).catch((e) => {
      console.error("Failed to clear checked items:", formatError(e));
      set({ error: "Failed to clear checked items" });
    });
  },

  clearShoppingList: () => {
    // Optimistic update
    set({ shoppingList: [] });

    const client = getClient();
    db.clearShoppingList(client).catch((e) => {
      console.error("Failed to clear shopping list:", formatError(e));
      set({ error: "Failed to clear shopping list" });
    });
  },
}));
