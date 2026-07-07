"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { StoreApi } from "zustand";
import { createClient } from "@/lib/supabase/client";
import * as db from "@/lib/supabase/service";
import type {
  Recipe,
  RecipeGroup,
  MealPlan,
  MealPlanDay,
  MealTemplate,
  ShoppingItem,
  GroceryItem,
  ScrapedRecipe,
  MealSlot,
} from "@/types";
import { SLOTS } from "@/lib/constants";
import { getWeekDates } from "@/lib/utils";
import { aggregateIngredients, normalizeIngredientName } from "@/lib/ingredient-aggregator";
import { parseIngredient } from "@/lib/ingredient-parser";
import { enqueueWrite, flushQueue } from "@/lib/offline-queue";

function getClient() {
  return createClient();
}

/** Extracts a readable message from Supabase PostgrestError or generic errors. */
function formatError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

/**
 * Bumped on every local meal-plan mutation so an in-flight week fetch (whose
 * snapshot predates the mutation) knows not to clobber optimistic state.
 */
let mealPlanMutations = 0;

let tempIdCounter = 0;
function nextTempId() {
  return `temp-${Date.now()}-${++tempIdCounter}`;
}

/**
 * Fire-and-forget: copy a scraped/captured image into Supabase Storage so the
 * recipe book doesn't rot when origin sites move their CDNs. On success the
 * recipe's local image is swapped to the durable storage URL (the server
 * already updated the database row). Failures are logged only — the original
 * URL keeps working in the meantime.
 */
function persistRecipeImage(
  recipeId: string,
  image: string | null,
  set: RecipeSet,
): void {
  if (typeof window === "undefined" || !image) return;
  if (!/^https?:\/\//.test(image) && !image.startsWith("data:image/")) return;
  // Already persisted (points at our own storage bucket)
  if (image.includes("/storage/v1/object/public/recipe-images/")) return;

  fetch("/api/persist-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipeId, imageUrl: image }),
  })
    .then(async (res) => {
      if (!res.ok) return;
      const body = (await res.json()) as { image?: string };
      if (typeof body.image !== "string") return;
      set((state) => ({
        recipes: state.recipes.map((r) =>
          r.id === recipeId ? { ...r, image: body.image ?? r.image } : r
        ),
      }));
    })
    .catch((e) => {
      console.error("Failed to persist recipe image:", formatError(e));
    });
}

/**
 * Converts old-format template days (string slot values + leftovers map)
 * to the new array-based MealPlanDay format. No-ops on already-migrated data.
 */
function migrateTemplateDays(
  days: Record<number, MealPlanDay>,
): Record<number, MealPlanDay> {
  const slots: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];
  const result: Record<number, MealPlanDay> = {};

  for (const [key, day] of Object.entries(days)) {
    const idx = Number(key);
    // Detect old format: slot value is a string (recipe ID) instead of an array
    const raw = day as unknown as Record<string, unknown>;
    const isOldFormat = slots.some(
      (s) => typeof raw[s] === "string",
    );

    if (!isOldFormat) {
      // Already new format — ensure all slots are arrays
      result[idx] = {
        breakfast: Array.isArray(day.breakfast) ? day.breakfast : [],
        lunch: Array.isArray(day.lunch) ? day.lunch : [],
        dinner: Array.isArray(day.dinner) ? day.dinner : [],
        snack: Array.isArray(day.snack) ? day.snack : [],
      };
      continue;
    }

    // Old format: { breakfast?: string, leftovers?: { breakfast?: boolean, ... } }
    const oldDay = day as unknown as Record<string, unknown>;
    const leftovers = (oldDay.leftovers as Record<string, boolean> | undefined) ?? {};
    const newDay: MealPlanDay = { breakfast: [], lunch: [], dinner: [], snack: [] };

    for (const slot of slots) {
      const recipeId = oldDay[slot];
      if (typeof recipeId === "string" && recipeId) {
        newDay[slot].push({
          recipeId,
          isLeftover: !!leftovers[slot],
          position: 0,
        });
      }
    }

    result[idx] = newDay;
  }

  return result;
}

interface RecipeStore {
  recipes: Recipe[];
  mealPlan: MealPlan;
  mealTemplates: MealTemplate[];
  shoppingList: ShoppingItem[];
  groceryList: GroceryItem[];
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
  /** Replay list toggles queued while offline (see src/lib/offline-queue.ts). */
  flushOfflineWrites: () => Promise<void>;
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
  /** Resolves true on success, false when the write failed (state rolled back). */
  assignMeal: (date: string, slot: MealSlot, recipeId: string, isLeftover?: boolean) => Promise<boolean>;
  removeMealFromSlot: (date: string, slot: MealSlot, recipeId: string) => void;
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

  // Grocery list actions
  addGroceryItem: (text: string) => void;
  toggleGroceryItem: (id: string) => void;
  uncheckAllGroceryItems: () => void;
  clearCheckedGroceryItems: () => void;
  clearGroceryList: () => void;
  restoreGroceryItems: (items: GroceryItem[]) => void;
}

type RecipeSet = StoreApi<RecipeStore>["setState"];
type RecipeGet = StoreApi<RecipeStore>["getState"];
type SupabaseClient = ReturnType<typeof getClient>;
type ListStateKey = "shoppingList" | "groceryList";
type ListKind = "shopping" | "grocery";
type ListItemForKey<Key extends ListStateKey> = RecipeStore[Key][number];
type RestoreInputForKey<Key extends ListStateKey> = Key extends "shoppingList"
  ? { text: string; checked: boolean; recipeId?: string }
  : { text: string; checked: boolean };

function listStatePatch<Key extends ListStateKey>(
  key: Key,
  items: RecipeStore[Key],
): Partial<RecipeStore> {
  return { [key]: items };
}

async function withOptimistic<Snapshot>(
  set: RecipeSet,
  snapshotFn: () => Snapshot,
  apply: (snapshot: Snapshot) => void,
  sync: (snapshot: Snapshot) => Promise<void>,
  rollback: (snapshot: Snapshot) => Partial<RecipeStore>,
  logMessage: string,
  errorMessage: string,
): Promise<void> {
  const snapshot = snapshotFn();
  apply(snapshot);

  try {
    await sync(snapshot);
  } catch (e) {
    console.error(logMessage, formatError(e));
    set({ ...rollback(snapshot), error: errorMessage });
  }
}

function listMessages(kind: ListKind) {
  const item = `${kind} item`;
  const items = `${kind} items`;
  const checkedItems = kind === "shopping" ? "checked items" : "checked grocery items";

  return {
    addLog: `Failed to add ${item}:`,
    addError: `Failed to add ${item}`,
    toggleLog: `Failed to toggle ${item}:`,
    toggleError: `Failed to update ${item}`,
    uncheckLog: `Failed to uncheck ${items}:`,
    uncheckError: `Failed to uncheck ${items}`,
    clearCheckedLog: `Failed to clear ${checkedItems}:`,
    clearCheckedError: `Failed to clear ${checkedItems}`,
    clearListLog: `Failed to clear ${kind} list:`,
    clearListError: `Failed to clear ${kind} list`,
    restoreLog: `Failed to restore ${items}:`,
    restoreError: "Failed to undo",
  };
}

function createListActions<Key extends ListStateKey>(
  set: RecipeSet,
  get: RecipeGet,
  config: {
    stateKey: Key;
    kind: ListKind;
    addItem: (client: SupabaseClient, text: string) => Promise<ListItemForKey<Key>>;
    toggleItem: (client: SupabaseClient, id: string, checked: boolean) => Promise<void>;
    uncheckAll: (client: SupabaseClient) => Promise<void>;
    clearChecked: (client: SupabaseClient) => Promise<void>;
    clearList: (client: SupabaseClient) => Promise<void>;
    restoreItems: (
      client: SupabaseClient,
      items: RestoreInputForKey<Key>[],
    ) => Promise<ListItemForKey<Key>[]>;
    toRestoreInput: (item: ListItemForKey<Key>) => RestoreInputForKey<Key>;
  },
) {
  const messages = listMessages(config.kind);
  const snapshot = () => get()[config.stateKey];
  const rollback = (items: RecipeStore[Key]) => listStatePatch(config.stateKey, items);
  const patchItems = (items: ListItemForKey<Key>[]) =>
    listStatePatch(config.stateKey, items as RecipeStore[Key]);
  const run = (
    apply: (items: RecipeStore[Key]) => void,
    sync: (items: RecipeStore[Key]) => Promise<void>,
    logMessage: string,
    errorMessage: string,
  ) => withOptimistic(set, snapshot, apply, sync, rollback, logMessage, errorMessage);

  return {
    addItem: async (text: string) => {
      const tempId = nextTempId();
      const optimisticItem = { id: tempId, text, checked: false } as ListItemForKey<Key>;

      await run(
        (items) => {
          set(patchItems([...items, optimisticItem]));
        },
        async () => {
          const client = getClient();
          const saved = await config.addItem(client, text);
          set((state) => patchItems(
            state[config.stateKey].map((item) =>
              item.id === tempId ? saved : item
            ) as ListItemForKey<Key>[],
          ));
        },
        messages.addLog,
        messages.addError,
      );
    },

    toggleItem: async (id: string) => {
      const item = snapshot().find((i) => i.id === id);
      if (!item) return;

      const newChecked = !item.checked;
      const prev = snapshot();
      set(patchItems(prev.map((i) =>
        i.id === id ? { ...i, checked: newChecked } : i
      ) as ListItemForKey<Key>[]));

      try {
        const client = getClient();
        await config.toggleItem(client, id, newChecked);
      } catch (e) {
        // Offline (grocery store, no reception): keep the optimistic check and
        // queue the write for replay instead of rolling back with an error.
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          enqueueWrite({
            kind: config.kind === "shopping" ? "shopping-toggle" : "grocery-toggle",
            id,
            checked: newChecked,
          });
          return;
        }
        console.error(messages.toggleLog, formatError(e));
        set({ ...rollback(prev), error: messages.toggleError });
      }
    },

    uncheckAll: async () => {
      if (!snapshot().some((i) => i.checked)) return;

      await run(
        (items) => {
          set(patchItems(items.map((item) =>
            item.checked ? { ...item, checked: false } : item
          ) as ListItemForKey<Key>[]));
        },
        async () => {
          const client = getClient();
          await config.uncheckAll(client);
        },
        messages.uncheckLog,
        messages.uncheckError,
      );
    },

    clearChecked: async () => {
      await run(
        (items) => {
          set(patchItems(items.filter((item) => !item.checked)));
        },
        async () => {
          const client = getClient();
          await config.clearChecked(client);
        },
        messages.clearCheckedLog,
        messages.clearCheckedError,
      );
    },

    clearList: async () => {
      await run(
        () => {
          set(patchItems([]));
        },
        async () => {
          const client = getClient();
          await config.clearList(client);
        },
        messages.clearListLog,
        messages.clearListError,
      );
    },

    restoreItems: async (items: ListItemForKey<Key>[]) => {
      await run(
        () => {
          set((state) => patchItems([
            ...state[config.stateKey],
            ...items,
          ] as ListItemForKey<Key>[]));
        },
        async () => {
          const client = getClient();
          const restored = await config.restoreItems(
            client,
            items.map(config.toRestoreInput),
          );
          const tempIds = new Set(items.map((i) => i.id));
          set((state) => patchItems([
            ...state[config.stateKey].filter((i) => !tempIds.has(i.id)),
            ...restored,
          ] as ListItemForKey<Key>[]));
        },
        messages.restoreLog,
        messages.restoreError,
      );
    },
  };
}

export const useRecipeStore = create<RecipeStore>()(persist((set, get) => {
  const shoppingListActions = createListActions(set, get, {
    stateKey: "shoppingList",
    kind: "shopping",
    addItem: db.addShoppingItem,
    toggleItem: db.toggleShoppingItem,
    uncheckAll: db.uncheckAllShoppingItems,
    clearChecked: db.clearCheckedItems,
    clearList: db.clearShoppingList,
    restoreItems: db.restoreShoppingItems,
    toRestoreInput: (item) => ({
      text: item.text,
      checked: item.checked,
      recipeId: item.recipeId,
    }),
  });

  const groceryListActions = createListActions(set, get, {
    stateKey: "groceryList",
    kind: "grocery",
    addItem: db.addGroceryItem,
    toggleItem: db.toggleGroceryItem,
    uncheckAll: db.uncheckAllGroceryItems,
    clearChecked: db.clearCheckedGroceryItems,
    clearList: db.clearGroceryList,
    restoreItems: db.restoreGroceryItems,
    toRestoreInput: (item) => ({
      text: item.text,
      checked: item.checked,
    }),
  });

  return {
  recipes: [],
  mealPlan: {},
  mealTemplates: [],
  shoppingList: [],
  groceryList: [],
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
    // Stale-while-revalidate: when the persisted snapshot restored data,
    // render it immediately (hydrated: true, no spinner) and refresh silently.
    const hasCache =
      get().recipes.length > 0 || Object.keys(get().mealPlan).length > 0;
    if (hasCache) {
      set({ hydrated: true, error: null });
    } else {
      set({ isLoading: true, error: null });
    }
    try {
      const client = getClient();
      // Compute a 3-week window (prev, current, next) around today
      const prevWeek = getWeekDates(-1);
      const nextWeek = getWeekDates(1);
      const startStr = prevWeek[0];
      const endStr = nextWeek[6];

      const [recipes, shoppingList, groceryList, checkedIngredients, mealPlan, rawTemplates] = await Promise.all([
        db.fetchRecipes(client),
        db.fetchShoppingList(client),
        db.fetchGroceryList(client),
        db.fetchCheckedIngredients(client),
        db.fetchMealPlan(client, startStr, endStr),
        db.fetchTemplates(client),
      ]);

      // Migrate old-format templates (string slots) to new array format on read
      const mealTemplates = rawTemplates.map((t) => ({
        ...t,
        days: migrateTemplateDays(t.days),
      }));

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

      // Restore cooking state from localStorage (survives page refresh)
      let cookingRecipeId: string | null = null;
      let cookingCompletedSteps = new Set<number>();
      try {
        const raw = localStorage.getItem("cooksnap:cooking");
        if (raw) {
          const parsed = JSON.parse(raw) as { recipeId?: unknown; steps?: unknown };
          // Only restore if the shape is valid and the recipe still exists —
          // corrupt data (e.g. steps as a string) would poison progress display
          if (
            typeof parsed.recipeId === "string" &&
            recipes.some((r) => r.id === parsed.recipeId)
          ) {
            cookingRecipeId = parsed.recipeId;
            const steps = Array.isArray(parsed.steps)
              ? parsed.steps.filter((s): s is number => typeof s === "number")
              : [];
            cookingCompletedSteps = new Set(steps);
          } else {
            localStorage.removeItem("cooksnap:cooking");
          }
        }
      } catch { /* localStorage unavailable or corrupt */ }

      set({ recipes, shoppingList, groceryList, checkedIngredients, mealPlan, mealTemplates, recipeGroups, groupMembers, cookingRecipeId, cookingCompletedSteps, isLoading: false, hydrated: true });
    } catch (e) {
      console.error("Hydrate error:", formatError(e));
      if (hasCache) {
        // Silent refresh failed (likely offline) — keep showing cached data
        // without surfacing an error toast on every launch.
        set({ isLoading: false, hydrated: true });
      } else {
        const msg = e instanceof Error ? e.message : "Failed to load data";
        set({ error: msg, isLoading: false, hydrated: true });
      }
    }
  },

  flushOfflineWrites: async () => {
    const client = getClient();
    const { flushed } = await flushQueue(async (w) => {
      if (w.kind === "shopping-toggle") {
        await db.toggleShoppingItem(client, w.id, w.checked);
      } else {
        await db.toggleGroceryItem(client, w.id, w.checked);
      }
    });
    if (flushed > 0) {
      console.info(`Synced ${flushed} offline change${flushed === 1 ? "" : "s"}`);
    }
  },

  clear: () => {
    try { localStorage.removeItem("cooksnap:cooking"); } catch { /* noop */ }
    set({
      recipes: [],
      mealPlan: {},
      mealTemplates: [],
      shoppingList: [],
      groceryList: [],
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
      difficulty: null,
      rating: null,
      isFavorite: false,
      notes: null,
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
      persistRecipeImage(saved.id, saved.image, set);
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
      throw e;
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
  // Cooking mode actions — persisted to localStorage so state survives refresh
  // ------------------------------------------------------------------

  startCooking: (recipeId) => {
    set({ cookingRecipeId: recipeId, cookingCompletedSteps: new Set() });
    try {
      localStorage.setItem("cooksnap:cooking", JSON.stringify({ recipeId, steps: [] }));
    } catch { /* localStorage unavailable */ }
  },

  stopCooking: () => {
    set({ cookingRecipeId: null, cookingCompletedSteps: new Set() });
    try {
      localStorage.removeItem("cooksnap:cooking");
    } catch { /* localStorage unavailable */ }
  },

  toggleCookingStep: (index) => {
    set((state) => {
      const next = new Set(state.cookingCompletedSteps);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      // Persist completed steps to localStorage
      try {
        const recipeId = state.cookingRecipeId;
        if (recipeId) {
          localStorage.setItem("cooksnap:cooking", JSON.stringify({ recipeId, steps: [...next] }));
        }
      } catch { /* localStorage unavailable */ }
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
    mealPlanMutations++;
    // Optimistic update
    set((state) => {
      const day: MealPlanDay = state.mealPlan[date] || { breakfast: [], lunch: [], dinner: [], snack: [] };
      const slotEntries = [...day[slot]];
      const existingIdx = slotEntries.findIndex((e) => e.recipeId === recipeId);

      if (existingIdx >= 0) {
        // Update existing entry (e.g., toggle leftover)
        slotEntries[existingIdx] = { ...slotEntries[existingIdx], isLeftover };
      } else {
        // Add new entry
        const nextPosition = slotEntries.length > 0 ? Math.max(...slotEntries.map((e) => e.position)) + 1 : 0;
        slotEntries.push({ recipeId, isLeftover, position: nextPosition });
      }

      return {
        mealPlan: {
          ...state.mealPlan,
          [date]: { ...day, [slot]: slotEntries },
        },
      };
    });

    try {
      const client = getClient();
      await db.assignMeal(client, date, slot, recipeId, isLeftover);
      return true;
    } catch (e) {
      const detail = formatError(e);
      console.error("Failed to assign meal:", detail, e);
      mealPlanMutations++;
      set({ mealPlan: prevMealPlan, error: `Failed to save meal assignment: ${detail}` });
      return false;
    }
  },

  removeMealFromSlot: async (date, slot, recipeId) => {
    const prevMealPlan = get().mealPlan;
    mealPlanMutations++;
    // Optimistic update — filter the entry out of the slot array
    set((state) => {
      const day = state.mealPlan[date];
      if (!day) return state;
      const slotEntries = day[slot].filter((e) => e.recipeId !== recipeId);
      return {
        mealPlan: {
          ...state.mealPlan,
          [date]: { ...day, [slot]: slotEntries },
        },
      };
    });

    try {
      const client = getClient();
      await db.removeMeal(client, date, slot, recipeId);
    } catch (e) {
      const detail = formatError(e);
      console.error("Failed to remove meal:", detail, e);
      mealPlanMutations++;
      set({ mealPlan: prevMealPlan, error: `Failed to remove meal: ${detail}` });
    }
  },

  clearWeek: (weekDates) => {
    const prevMealPlan = get().mealPlan;
    mealPlanMutations++;
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
      mealPlanMutations++;
      set({ mealPlan: prevMealPlan, error: "Failed to clear week in cloud" });
    });
  },


  fetchMealPlanForWeek: async (startDate, endDate) => {
    try {
      const client = getClient();
      const mutationsAtFetch = mealPlanMutations;
      const fetched = await db.fetchMealPlan(client, startDate, endDate);
      // A local mutation landed while this fetch was in flight — the fetched
      // snapshot is stale and merging it would erase the optimistic entry.
      // Skip; the next fetch will pick up the reconciled server state.
      if (mealPlanMutations !== mutationsAtFetch) return;
      // Merge fetched data into existing mealPlan state
      set((state) => ({
        mealPlan: { ...state.mealPlan, ...fetched },
      }));
    } catch (e) {
      console.error("Failed to fetch meal plan for week:", formatError(e));
      set({ error: "Failed to load meal plan for this week" });
    }
  },

  // ------------------------------------------------------------------
  // Meal template actions
  // ------------------------------------------------------------------

  fetchTemplates: async () => {
    try {
      const client = getClient();
      const templates = await db.fetchTemplates(client);
      // Migrate old-format templates (string slots) to new array format on read
      const migrated = templates.map((t) => ({
        ...t,
        days: migrateTemplateDays(t.days),
      }));
      set({ mealTemplates: migrated });
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
    const assignments: { date: string; slot: MealSlot; recipeId: string; isLeftover: boolean }[] = [];
    for (let i = 0; i < weekDates.length; i++) {
      const templateDay = template.days[i];
      if (!templateDay) continue;
      const date = weekDates[i];
      for (const slot of SLOTS) {
        for (const entry of templateDay[slot]) {
          assignments.push({ date, slot, recipeId: entry.recipeId, isLeftover: entry.isLeftover });
        }
      }
    }

    let failures = 0;
    for (const { date, slot, recipeId, isLeftover } of assignments) {
      const ok = await get().assignMeal(date, slot, recipeId, isLeftover);
      if (!ok) failures++;
    }
    if (failures > 0) {
      throw new Error(`Failed to apply ${failures} of ${assignments.length} template assignments`);
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
        set((state) => {
          // Migrate any groupMembers entries from the temp ID to the real ID
          const members = state.groupMembers[tempId];
          const updatedGroupMembers = { ...state.groupMembers };
          if (members) {
            delete updatedGroupMembers[tempId];
            updatedGroupMembers[saved.id] = members;
          }
          return {
            recipeGroups: state.recipeGroups.map((g) => (g.id === tempId ? saved : g)),
            groupMembers: updatedGroupMembers,
          };
        });
        // Persist any recipe-to-group memberships that were added optimistically
        const members = get().groupMembers[saved.id] ?? [];
        for (const recipeId of members) {
          db.addRecipeToGroup(client, saved.id, recipeId).catch((e) => {
            console.error("Failed to persist recipe-to-group membership:", formatError(e));
          });
        }
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

    // Skip DB call for temp IDs — createGroup's .then() handler will persist
    // the membership once the real group ID is available from the database.
    if (groupId.startsWith("temp-")) return;

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

    // Skip DB call for temp IDs — group doesn't exist in the database yet
    if (groupId.startsWith("temp-")) return;

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

    // Collect all raw ingredient strings and track which recipe contributed each
    const allRaw: string[] = [];
    const recipeForIngredient = new Map<string, string>(); // lowered ingredient → recipeId

    for (const date of weekDates) {
      const day = mealPlan[date];
      if (!day) continue;
      for (const slot of SLOTS) {
        for (const entry of day[slot]) {
          if (entry.isLeftover) continue;
          const recipe = recipes.find((r) => r.id === entry.recipeId);
          if (!recipe) continue;
          for (const ingredient of recipe.ingredients) {
            // Skip section headers — they aren't real ingredients
            if (ingredient.startsWith("## ")) continue;
            allRaw.push(ingredient);
            // Track first recipe that contributed this ingredient, keyed by
            // normalized name so the key survives quantity merging
            const key = normalizeIngredientName(parseIngredient(ingredient).name);
            if (!recipeForIngredient.has(key)) {
              recipeForIngredient.set(key, recipe.id);
            }
          }
        }
      }
    }

    // Aggregate duplicates (sums quantities, converts units)
    const aggregated = aggregateIngredients(allRaw);

    // Build items with recipeId from the first contributing recipe. No
    // fallback — an unattributed item is better than a wrong attribution.
    const items = aggregated.map((text) => {
      const key = normalizeIngredientName(parseIngredient(text).name);
      return { text, recipeId: recipeForIngredient.get(key) ?? "" };
    });

    // Optimistic: set a local placeholder list
    set({
      shoppingList: items.map((item) => ({
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

    // Combine existing unchecked item texts with new ingredients, then aggregate
    // Filter out section headers — they aren't real ingredients
    const existingUnchecked = prevShoppingList.filter((item) => !item.checked);
    const filteredNew = ingredients.filter((ing) => !ing.startsWith("## "));
    const allTexts = [
      ...existingUnchecked.map((item) => item.text),
      ...filteredNew,
    ];
    const aggregated = aggregateIngredients(allTexts);

    // Build a map of existing items by their text for diffing
    const existingByText = new Map<string, ShoppingItem>();
    for (const item of existingUnchecked) {
      existingByText.set(item.text.toLowerCase().trim(), item);
    }

    // Determine which aggregated items are new vs updated vs unchanged
    const toUpdate: { id: string; newText: string }[] = [];
    const toInsert: string[] = [];
    const matchedExistingIds = new Set<string>();

    // Index existing items by normalized ingredient name so a merged line
    // ("3 tsp salt") finds its original ("1 tsp salt") without fuzzy word
    // overlap — which conflated distinct groceries like "red pepper" and
    // "red pepper flakes".
    const existingByName = new Map<string, ShoppingItem>();
    for (const item of existingUnchecked) {
      const name = normalizeIngredientName(parseIngredient(item.text).name);
      if (!existingByName.has(name)) existingByName.set(name, item);
    }

    for (const text of aggregated) {
      const key = text.toLowerCase().trim();
      const existing = existingByText.get(key);
      if (existing) {
        // Exact match — unchanged
        matchedExistingIds.add(existing.id);
        continue;
      }
      // Same ingredient with merged quantities → update the existing item
      const name = normalizeIngredientName(parseIngredient(text).name);
      const sameName = existingByName.get(name);
      if (sameName && !matchedExistingIds.has(sameName.id)) {
        toUpdate.push({ id: sameName.id, newText: text });
        matchedExistingIds.add(sameName.id);
      } else {
        toInsert.push(text);
      }
    }

    if (toUpdate.length === 0 && toInsert.length === 0) return;

    // Optimistic update
    const optimisticItems: ShoppingItem[] = toInsert.map((text) => ({
      id: nextTempId(),
      text,
      checked: false,
    }));

    set((state) => ({
      shoppingList: [
        ...state.shoppingList.map((item) => {
          const update = toUpdate.find((u) => u.id === item.id);
          return update ? { ...item, text: update.newText } : item;
        }),
        ...optimisticItems,
      ],
    }));

    // Sync to Supabase
    try {
      const client = getClient();

      // Update existing items with new merged text
      for (const { id, newText } of toUpdate) {
        await db.updateShoppingItemText(client, id, newText);
      }

      // Insert net-new items
      if (toInsert.length > 0) {
        const savedItems = await db.restoreShoppingItems(
          client,
          toInsert.map((text) => ({ text, checked: false })),
        );

        // Replace temp IDs with real IDs
        set((state) => ({
          shoppingList: state.shoppingList.map((item) => {
            if (!optimisticItems.some((o) => o.id === item.id)) return item;
            const match = savedItems.find((s) => s.text === item.text);
            return match ?? item;
          }),
        }));
      }
    } catch (e) {
      console.error("Failed to add ingredients to shopping list:", formatError(e));
      set({ shoppingList: prevShoppingList, error: "Failed to add ingredient to shopping list" });
    }
  },

  addShoppingItem: shoppingListActions.addItem,
  toggleShoppingItem: shoppingListActions.toggleItem,
  uncheckAllShoppingItems: shoppingListActions.uncheckAll,
  clearCheckedItems: shoppingListActions.clearChecked,
  clearShoppingList: shoppingListActions.clearList,
  restoreShoppingItems: shoppingListActions.restoreItems,

  // ------------------------------------------------------------------
  // Grocery list actions
  // ------------------------------------------------------------------

  addGroceryItem: groceryListActions.addItem,
  toggleGroceryItem: groceryListActions.toggleItem,
  uncheckAllGroceryItems: groceryListActions.uncheckAll,
  clearCheckedGroceryItems: groceryListActions.clearChecked,
  clearGroceryList: groceryListActions.clearList,
  restoreGroceryItems: groceryListActions.restoreItems,
  };
}, {
  // Snapshot cache for instant cold starts: pages render the cached data
  // immediately while hydrate() refreshes from Supabase in the background.
  // Distinct from "cooksnap-storage" (the legacy pre-Supabase data read by
  // migrateFromLocalStorage). Ephemeral state (loading/error/cooking) and
  // non-serializable Sets are excluded.
  name: "cooksnap-cache",
  storage: createJSONStorage(() => localStorage),
  partialize: (s) => ({
    recipes: s.recipes,
    mealPlan: s.mealPlan,
    mealTemplates: s.mealTemplates,
    shoppingList: s.shoppingList,
    groceryList: s.groceryList,
    checkedIngredients: s.checkedIngredients,
    recipeGroups: s.recipeGroups,
    groupMembers: s.groupMembers,
  }),
}));
