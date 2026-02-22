"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { nanoid } from "nanoid";
import type {
  Recipe,
  MealPlan,
  MealPlanDay,
  ShoppingItem,
  ScrapedRecipe,
  MealSlot,
} from "@/types";

interface RecipeStore {
  recipes: Recipe[];
  mealPlan: MealPlan;
  shoppingList: ShoppingItem[];
  checkedIngredients: Record<string, number[]>;

  // Recipe actions
  addRecipe: (scraped: ScrapedRecipe, sourceUrl: string) => Recipe;
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

export const useRecipeStore = create<RecipeStore>()(
  persist(
    (set, get) => ({
      recipes: [],
      mealPlan: {},
      shoppingList: [],
      checkedIngredients: {},

      addRecipe: (scraped, sourceUrl) => {
        const recipe: Recipe = {
          id: nanoid(),
          title: scraped.title,
          image: scraped.image,
          ingredients: scraped.ingredients,
          instructions: scraped.instructions,
          sourceUrl,
          tags: [],
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ recipes: [recipe, ...state.recipes] }));
        return recipe;
      },

      deleteRecipe: (id) => {
        set((state) => ({
          recipes: state.recipes.filter((r) => r.id !== id),
        }));
      },

      updateTags: (id, tags) => {
        set((state) => ({
          recipes: state.recipes.map((r) =>
            r.id === id ? { ...r, tags } : r
          ),
        }));
      },

      assignMeal: (date, slot, recipeId) => {
        set((state) => {
          const day: MealPlanDay = state.mealPlan[date] || {};
          return {
            mealPlan: {
              ...state.mealPlan,
              [date]: { ...day, [slot]: recipeId },
            },
          };
        });
      },

      clearWeek: (weekDates) => {
        set((state) => {
          const newPlan = { ...state.mealPlan };
          for (const date of weekDates) {
            delete newPlan[date];
          }
          return { mealPlan: newPlan };
        });
      },

      generateShoppingList: (weekDates) => {
        const { mealPlan, recipes } = get();
        const items: ShoppingItem[] = [];
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
                items.push({
                  id: nanoid(),
                  text: ingredient,
                  checked: false,
                  recipeId: recipe.id,
                });
              }
            }
          }
        }

        set({ shoppingList: items });
      },

      addShoppingItem: (text) => {
        set((state) => ({
          shoppingList: [
            ...state.shoppingList,
            { id: nanoid(), text, checked: false },
          ],
        }));
      },

      toggleShoppingItem: (id) => {
        set((state) => ({
          shoppingList: state.shoppingList.map((item) =>
            item.id === id ? { ...item, checked: !item.checked } : item
          ),
        }));
      },

      clearCheckedItems: () => {
        set((state) => ({
          shoppingList: state.shoppingList.filter((item) => !item.checked),
        }));
      },

      clearShoppingList: () => {
        set({ shoppingList: [] });
      },

      toggleIngredient: (recipeId, index) => {
        set((state) => {
          const current = state.checkedIngredients[recipeId] || [];
          const updated = current.includes(index)
            ? current.filter((i) => i !== index)
            : [...current, index];
          return {
            checkedIngredients: {
              ...state.checkedIngredients,
              [recipeId]: updated,
            },
          };
        });
      },

      clearCheckedIngredients: (recipeId) => {
        set((state) => {
          const updated = { ...state.checkedIngredients };
          delete updated[recipeId];
          return { checkedIngredients: updated };
        });
      },
    }),
    {
      name: "cooksnap-storage",
    }
  )
);
