"use client";

import { create } from "zustand";
import { createClient } from "@/lib/supabase/client";
import * as db from "@/lib/supabase/service";
import type {
  Recipe,
  RecipeGroup,
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
  hydrated: boolean;
  error: string | null;

  // Cooking mode (ephemeral, not persisted to Supabase)
  cookingRecipeId: string | null;
  cookingCompletedSteps: Set<number>;

  // Recipe groups
  recipeGroups: RecipeGroup[];
  groupMembers: Record<string, string[]>; // groupId → recipeId[]

  // Lifecycle actions
  hydrate: () => Promise<void>;
  clear: () => void;
  clearError: () => void;
  migrateFromLocalStorage: () => Promise<{ migrated: boolean; recipeCount: number }>;

  // Recipe actions
  addRecipe: (scraped: ScrapedRecipe, sourceUrl: string) => void;
  updateRecipe: (id: string, updates: Partial<Omit<Recipe, "id" | "createdAt">>) => void;
  deleteRecipe: (id: string) => void;
  updateTags: (id: string, tags: string[]) => void;

  // Cooking mode actions
  startCooking: (recipeId: string) => void;
  stopCooking: () => void;
  toggleCookingStep: (index: number) => void;

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
  applyTemplate: (templateId: string, weekDates: string[]) => Promise<void>;
  deleteTemplate: (id: string) => void;

  // Recipe group actions
  createGroup: (name: string, icon?: string) => void;
  updateGroup: (id: string, updates: Partial<Pick<RecipeGroup, "name" | "icon" | "sortOrder">>) => void;
  deleteGroup: (id: string) => void;
  addRecipeToGroup: (groupId: string, recipeId: string) => void;
  removeRecipeFromGroup: (groupId: string, recipeId: string) => void;

  // Shopping list actions
  generateShoppingList: (weekDates: string[]) => void;
  addIngredientsToShoppingList: (ingredients: string[]) => void;
  addShoppingItem: (text: string) => void;
  toggleShoppingItem: (id: string) => void;
  uncheckAllShoppingItems: () => void;
  clearCheckedItems: () => void;
  clearShoppingList: () => void;
  restoreShoppingItems: (items: ShoppingItem[]) => void;
}

export const useRecipeStore = create<RecipeStore>()((set, get) => ({
  recipes: [],
  mealPlan: {},
  mealTemplates: [],
  shoppingList: [],
  checkedIngredients: {},
  isLoading: false,
  hydrated: false,
  error: null,
  cookingRecipeId: null,
  cookingCompletedSteps: new Set(),
  recipeGroups: [],
  groupMembers: {},

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

      // Fetch recipe groups and members
      const [recipeGroups, members] = await Promise.all([
        db.ensureDefaultGroups(client),
        db.fetchGroupMembers(client),
      ]);

      // Convert flat member list to groupId → recipeId[] map
      const groupMembers: Record<string, string[]> = {};
      for (const m of members) {
        if (!groupMembers[m.groupId]) groupMembers[m.groupId] = [];
        groupMembers[m.groupId].push(m.recipeId);
      }

      set({ recipes, shoppingList, checkedIngredients, mealPlan, recipeGroups, groupMembers, isLoading: false, hydrated: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load data";
      console.error("Hydrate error:", formatError(e));
      set({ error: msg, isLoading: false, hydrated: true });
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
      hydrated: false,
      error: null,
      cookingRecipeId: null,
      cookingCompletedSteps: new Set(),
      recipeGroups: [],
      groupMembers: {},
    });
  },

  clearError: () => set({ error: null }),

  migrateFromLocalStorage: async () => {
    const raw = typeof window !== "undefined"
      ? localStorage.getItem("cooksnap-storage")
      : null;

    if (!raw) return { migrated: false, recipeCount: 0 };

    try {
      const parsed = JSON.parse(raw);
      const state = parsed?.state ?? parsed;
      const rawRecipes = state?.recipes;

      // Validate that recipes is an array of objects with required fields (R4-7)
      if (!Array.isArray(rawRecipes)) return { migrated: false, recipeCount: 0 };

      const recipes: Recipe[] = rawRecipes.filter(
        (r: unknown): r is Recipe =>
          typeof r === "object" &&
          r !== null &&
          typeof (r as Record<string, unknown>).title === "string" &&
          Array.isArray((r as Record<string, unknown>).ingredients) &&
          Array.isArray((r as Record<string, unknown>).instructions)
      );

      if (recipes.length === 0) return { migrated: false, recipeCount: 0 };

      const client = getClient();

      // Build a set of existing sourceUrls to prevent duplicate imports on retry
      const existingRecipes = get().recipes;
      const existingUrls = new Set(
        existingRecipes.map((r) => r.sourceUrl).filter(Boolean),
      );

      let importedCount = 0;

      // Import each recipe into Supabase
      for (const recipe of recipes) {
        // Skip if a recipe with the same sourceUrl already exists
        if (recipe.sourceUrl && existingUrls.has(recipe.sourceUrl)) {
          continue;
        }

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

        importedCount++;
      }

      // Remove old localStorage data BEFORE hydrate so even if hydrate fails,
      // migration won't re-run and create duplicates
      localStorage.removeItem("cooksnap-storage");

      // Re-hydrate from Supabase to get consistent state
      await get().hydrate();

      return { migrated: true, recipeCount: importedCount };
    } catch (e) {
      console.error("Migration from localStorage failed:", formatError(e));
      return { migrated: false, recipeCount: 0 };
    }
  },

  // ------------------------------------------------------------------
  // Recipe actions
  // ------------------------------------------------------------------

  addRecipe: async (scraped, sourceUrl) => {
    // Optimistic: add a temporary recipe with a placeholder id
    const prevRecipes = get().recipes;
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
    try {
      const client = getClient();
      const saved = await db.addRecipe(client, scraped, sourceUrl);
      // Replace temp recipe with the real one from DB
      set((state) => ({
        recipes: state.recipes.map((r) => (r.id === tempId ? saved : r)),
      }));
    } catch (e) {
      console.error("Failed to save recipe:", formatError(e));
      set({ recipes: prevRecipes, error: "Failed to save recipe to cloud" });
    }
  },

  updateRecipe: async (id, updates) => {
    const prevRecipes = get().recipes;
    // Optimistic update
    set((state) => ({
      recipes: state.recipes.map((r) =>
        r.id === id ? { ...r, ...updates } : r
      ),
    }));

    try {
      const client = getClient();
      await db.updateRecipe(client, id, updates);
    } catch (e) {
      console.error("Failed to update recipe:", formatError(e));
      set({ recipes: prevRecipes, error: "Failed to update recipe in cloud" });
    }
  },

  deleteRecipe: async (id) => {
    const prevRecipes = get().recipes;
    // Optimistic delete
    set((state) => ({
      recipes: state.recipes.filter((r) => r.id !== id),
    }));

    try {
      const client = getClient();
      await db.deleteRecipe(client, id);
    } catch (e) {
      console.error("Failed to delete recipe:", formatError(e));
      set({ recipes: prevRecipes, error: "Failed to delete recipe from cloud" });
    }
  },

  updateTags: async (id, tags) => {
    const prevRecipes = get().recipes;
    // Optimistic update
    set((state) => ({
      recipes: state.recipes.map((r) =>
        r.id === id ? { ...r, tags } : r
      ),
    }));

    try {
      const client = getClient();
      await db.updateRecipeTags(client, id, tags);
    } catch (e) {
      console.error("Failed to update tags:", formatError(e));
      set({ recipes: prevRecipes, error: "Failed to update tags in cloud" });
    }
  },

  // ------------------------------------------------------------------
  // Cooking mode actions (ephemeral, no Supabase persistence)
  // ------------------------------------------------------------------

  startCooking: (recipeId) => {
    set({ cookingRecipeId: recipeId, cookingCompletedSteps: new Set() });
  },

  stopCooking: () => {
    set({ cookingRecipeId: null, cookingCompletedSteps: new Set() });
  },

  toggleCookingStep: (index) => {
    set((state) => {
      const next = new Set(state.cookingCompletedSteps);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return { cookingCompletedSteps: next };
    });
  },

  // ------------------------------------------------------------------
  // Ingredient checklist actions
  // ------------------------------------------------------------------

  toggleIngredient: async (recipeId, index) => {
    const prevCheckedIngredients = get().checkedIngredients;
    const current = prevCheckedIngredients[recipeId] || [];
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

    try {
      const client = getClient();
      await db.toggleIngredient(client, recipeId, index, !isChecked);
    } catch (e) {
      console.error("Failed to toggle ingredient:", formatError(e));
      set({ checkedIngredients: prevCheckedIngredients, error: "Failed to sync ingredient check" });
    }
  },

  clearCheckedIngredients: (recipeId) => {
    const prevCheckedIngredients = get().checkedIngredients;
    // Optimistic update
    set((state) => {
      const updated = { ...state.checkedIngredients };
      delete updated[recipeId];
      return { checkedIngredients: updated };
    });

    const client = getClient();
    db.clearCheckedIngredients(client, recipeId).catch((e) => {
      console.error("Failed to clear checked ingredients:", formatError(e));
      set({ checkedIngredients: prevCheckedIngredients, error: "Failed to sync ingredient checks" });
    });
  },

  // ------------------------------------------------------------------
  // Meal plan actions
  // ------------------------------------------------------------------

  assignMeal: async (date, slot, recipeId, isLeftover = false) => {
    const prevMealPlan = get().mealPlan;
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

    try {
      const client = getClient();
      if (recipeId) {
        await db.assignMeal(client, date, slot, recipeId, isLeftover);
      } else {
        await db.removeMeal(client, date, slot);
      }
    } catch (e) {
      const detail = formatError(e);
      console.error("Failed to assign/remove meal:", detail, e);
      set({ mealPlan: prevMealPlan, error: `Failed to save meal assignment: ${detail}` });
    }
  },

  clearWeek: (weekDates) => {
    const prevMealPlan = get().mealPlan;
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
      set({ mealPlan: prevMealPlan, error: "Failed to clear week in cloud" });
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
        set((state) => ({
          mealTemplates: state.mealTemplates.filter((t) => t.id !== tempId),
          error: "Failed to save template",
        }));
      });
  },

  applyTemplate: async (templateId, weekDates) => {
    const template = get().mealTemplates.find((t) => t.id === templateId);
    if (!template) return;

    // Collect all assignments first, then apply sequentially to avoid races (R4-6)
    const assignments: { date: string; slot: MealSlot; recipeId: string }[] = [];
    for (let i = 0; i < weekDates.length; i++) {
      const templateDay = template.days[i];
      if (!templateDay) continue;
      const date = weekDates[i];
      for (const slot of SLOTS) {
        const recipeId = templateDay[slot];
        if (recipeId) {
          assignments.push({ date, slot, recipeId });
        }
      }
    }

    for (const { date, slot, recipeId } of assignments) {
      await get().assignMeal(date, slot, recipeId);
    }
  },

  deleteTemplate: (id) => {
    const prevMealTemplates = get().mealTemplates;
    // Optimistic delete
    set((state) => ({
      mealTemplates: state.mealTemplates.filter((t) => t.id !== id),
    }));

    const client = getClient();
    db.deleteTemplate(client, id).catch((e) => {
      console.error("Failed to delete template:", formatError(e));
      set({ mealTemplates: prevMealTemplates, error: "Failed to delete template" });
    });
  },

  // ------------------------------------------------------------------
  // Recipe group actions
  // ------------------------------------------------------------------

  createGroup: (name, icon) => {
    const tempId = nextTempId();
    const optimistic: RecipeGroup = {
      id: tempId,
      name,
      icon: icon ?? null,
      sortOrder: get().recipeGroups.length,
      isDefault: false,
      createdAt: new Date().toISOString(),
    };
    set((state) => ({ recipeGroups: [...state.recipeGroups, optimistic] }));

    const client = getClient();
    db.createGroup(client, name, icon)
      .then((saved) => {
        set((state) => ({
          recipeGroups: state.recipeGroups.map((g) => (g.id === tempId ? saved : g)),
        }));
      })
      .catch((e) => {
        console.error("Failed to create group:", formatError(e));
        set((state) => ({
          recipeGroups: state.recipeGroups.filter((g) => g.id !== tempId),
          error: "Failed to create group",
        }));
      });
  },

  updateGroup: (id, updates) => {
    const prevRecipeGroups = get().recipeGroups;
    set((state) => ({
      recipeGroups: state.recipeGroups.map((g) =>
        g.id === id ? { ...g, ...updates } : g
      ),
    }));

    const client = getClient();
    db.updateGroup(client, id, updates).catch((e) => {
      console.error("Failed to update group:", formatError(e));
      set({ recipeGroups: prevRecipeGroups, error: "Failed to update group" });
    });
  },

  deleteGroup: (id) => {
    // Prevent deleting default groups
    const group = get().recipeGroups.find((g) => g.id === id);
    if (!group || group.isDefault) return;

    const prevRecipeGroups = get().recipeGroups;
    const prevGroupMembers = get().groupMembers;
    set((state) => ({
      recipeGroups: state.recipeGroups.filter((g) => g.id !== id),
      groupMembers: Object.fromEntries(
        Object.entries(state.groupMembers).filter(([gId]) => gId !== id)
      ),
    }));

    const client = getClient();
    db.deleteGroup(client, id).catch((e) => {
      console.error("Failed to delete group:", formatError(e));
      set({ recipeGroups: prevRecipeGroups, groupMembers: prevGroupMembers, error: "Failed to delete group" });
    });
  },

  addRecipeToGroup: (groupId, recipeId) => {
    const prevGroupMembers = get().groupMembers;
    set((state) => ({
      groupMembers: {
        ...state.groupMembers,
        [groupId]: [...(state.groupMembers[groupId] ?? []), recipeId],
      },
    }));

    const client = getClient();
    db.addRecipeToGroup(client, groupId, recipeId).catch((e) => {
      console.error("Failed to add recipe to group:", formatError(e));
      set({ groupMembers: prevGroupMembers, error: "Failed to add recipe to group" });
    });
  },

  removeRecipeFromGroup: (groupId, recipeId) => {
    const prevGroupMembers = get().groupMembers;
    set((state) => ({
      groupMembers: {
        ...state.groupMembers,
        [groupId]: (state.groupMembers[groupId] ?? []).filter((id) => id !== recipeId),
      },
    }));

    const client = getClient();
    db.removeRecipeFromGroup(client, groupId, recipeId).catch((e) => {
      console.error("Failed to remove recipe from group:", formatError(e));
      set({ groupMembers: prevGroupMembers, error: "Failed to remove recipe from group" });
    });
  },

  // ------------------------------------------------------------------
  // Shopping list actions
  // ------------------------------------------------------------------

  generateShoppingList: (weekDates) => {
    const { mealPlan, recipes } = get();
    const prevShoppingList = get().shoppingList;
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
        set({ shoppingList: prevShoppingList, error: "Failed to generate shopping list" });
      });
  },

  addIngredientsToShoppingList: async (ingredients) => {
    const prevShoppingList = get().shoppingList;
    const existingTexts = new Set(prevShoppingList.map((item) => item.text.toLowerCase().trim()));

    const newIngredients = ingredients.filter(
      (ing) => !existingTexts.has(ing.toLowerCase().trim()),
    );

    if (newIngredients.length === 0) return;

    // Optimistic: add all new items at once
    const optimisticItems: ShoppingItem[] = newIngredients.map((text) => ({
      id: nextTempId(),
      text,
      checked: false,
    }));
    set((state) => ({
      shoppingList: [...state.shoppingList, ...optimisticItems],
    }));

    // Batch insert to Supabase (replaces N+1 per-item calls)
    try {
      const client = getClient();
      const savedItems = await db.restoreShoppingItems(
        client,
        newIngredients.map((text) => ({ text, checked: false })),
      );

      // Replace temp IDs with real IDs from savedItems
      set((state) => ({
        shoppingList: state.shoppingList.map((item) => {
          const tempIdx = optimisticItems.findIndex((o) => o.id === item.id);
          if (tempIdx >= 0 && savedItems[tempIdx]) {
            return savedItems[tempIdx];
          }
          return item;
        }),
      }));
    } catch (e) {
      console.error("Failed to add ingredients to shopping list:", formatError(e));
      set({ shoppingList: prevShoppingList, error: "Failed to add ingredient to shopping list" });
    }
  },

  addShoppingItem: async (text) => {
    const prevShoppingList = get().shoppingList;
    const tempId = nextTempId();

    // Optimistic update
    set((state) => ({
      shoppingList: [
        ...state.shoppingList,
        { id: tempId, text, checked: false },
      ],
    }));

    try {
      const client = getClient();
      const saved = await db.addShoppingItem(client, text);
      set((state) => ({
        shoppingList: state.shoppingList.map((item) =>
          item.id === tempId ? saved : item
        ),
      }));
    } catch (e) {
      console.error("Failed to add shopping item:", formatError(e));
      set({ shoppingList: prevShoppingList, error: "Failed to add shopping item" });
    }
  },

  toggleShoppingItem: async (id) => {
    const prevShoppingList = get().shoppingList;
    const item = prevShoppingList.find((i) => i.id === id);
    if (!item) return;

    const newChecked = !item.checked;

    // Optimistic update
    set((state) => ({
      shoppingList: state.shoppingList.map((i) =>
        i.id === id ? { ...i, checked: newChecked } : i
      ),
    }));

    try {
      const client = getClient();
      await db.toggleShoppingItem(client, id, newChecked);
    } catch (e) {
      console.error("Failed to toggle shopping item:", formatError(e));
      set({ shoppingList: prevShoppingList, error: "Failed to update shopping item" });
    }
  },

  uncheckAllShoppingItems: async () => {
    const prevShoppingList = get().shoppingList;
    const checkedIds = prevShoppingList.filter((i) => i.checked).map((i) => i.id);
    if (checkedIds.length === 0) return;

    // Optimistic update
    set({
      shoppingList: prevShoppingList.map((item) =>
        item.checked ? { ...item, checked: false } : item
      ),
    });

    try {
      const client = getClient();
      await db.uncheckAllShoppingItems(client);
    } catch (e) {
      console.error("Failed to uncheck shopping items:", formatError(e));
      set({ shoppingList: prevShoppingList, error: "Failed to uncheck shopping items" });
    }
  },

  clearCheckedItems: async () => {
    const prevShoppingList = get().shoppingList;

    // Optimistic update
    set({ shoppingList: prevShoppingList.filter((item) => !item.checked) });

    try {
      const client = getClient();
      await db.clearCheckedItems(client);
    } catch (e) {
      console.error("Failed to clear checked items:", formatError(e));
      set({ shoppingList: prevShoppingList, error: "Failed to clear checked items" });
    }
  },

  clearShoppingList: async () => {
    const prevShoppingList = get().shoppingList;
    // Optimistic update
    set({ shoppingList: [] });

    try {
      const client = getClient();
      await db.clearShoppingList(client);
    } catch (e) {
      console.error("Failed to clear shopping list:", formatError(e));
      set({ shoppingList: prevShoppingList, error: "Failed to clear shopping list" });
    }
  },

  restoreShoppingItems: async (items) => {
    const prevShoppingList = get().shoppingList;
    // Optimistic update — add items back to local state immediately
    set((state) => ({
      shoppingList: [...state.shoppingList, ...items],
    }));

    try {
      const client = getClient();
      const restored = await db.restoreShoppingItems(
        client,
        items.map((i) => ({ text: i.text, checked: i.checked, recipeId: i.recipeId })),
      );
      // Replace temp items with real DB items (fresh IDs)
      const tempIds = new Set(items.map((i) => i.id));
      set((state) => ({
        shoppingList: [
          ...state.shoppingList.filter((i) => !tempIds.has(i.id)),
          ...restored,
        ],
      }));
    } catch (e) {
      console.error("Failed to restore shopping items:", formatError(e));
      set({ shoppingList: prevShoppingList, error: "Failed to undo" });
    }
  },
}));
