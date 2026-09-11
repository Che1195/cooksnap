"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { buildGeneratedItems, planShoppingMerge } from "@/lib/shopping-merge";
import type { MealPlan, Recipe, ShoppingItem } from "@/types";

export function useShoppingList(): ShoppingItem[] | undefined {
  return useQuery(api.shoppingItems.list, {});
}

export function useShoppingActions() {
  const add = useMutation(api.shoppingItems.add);
  const addMany = useMutation(api.shoppingItems.addMany);
  const updateText = useMutation(api.shoppingItems.updateText);
  const toggle = useMutation(api.shoppingItems.toggle).withOptimisticUpdate((store, { id }) => {
    const current = store.getQuery(api.shoppingItems.list, {});
    if (!current) return;
    store.setQuery(
      api.shoppingItems.list,
      {},
      current.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i)),
    );
  });
  const uncheckAll = useMutation(api.shoppingItems.uncheckAll);
  const clearChecked = useMutation(api.shoppingItems.clearChecked);
  const clear = useMutation(api.shoppingItems.clear);
  const restore = useMutation(api.shoppingItems.restore);

  return {
    addShoppingItem: async (text: string): Promise<void> => {
      await add({ text });
    },
    toggleShoppingItem: async (id: string): Promise<void> => {
      await toggle({ id: id as Id<"shoppingItems"> });
    },
    uncheckAllShoppingItems: async (): Promise<void> => {
      await uncheckAll({});
    },
    clearCheckedItems: async (): Promise<void> => {
      await clearChecked({});
    },
    clearShoppingList: async (): Promise<void> => {
      await clear({});
    },
    restoreShoppingItems: async (items: ShoppingItem[]): Promise<void> => {
      await restore({
        items: items.map((i) => ({
          text: i.text,
          checked: i.checked,
          recipeId: i.recipeId as Id<"recipes"> | undefined,
        })),
      });
    },
    /**
     * Folds `ingredients` into `current` (pass the list from
     * `useShoppingList()`). Merged quantities rewrite the existing line;
     * genuinely new lines are appended. Checked items are never touched.
     */
    addIngredientsToShoppingList: async (
      ingredients: string[],
      current: ShoppingItem[],
    ): Promise<void> => {
      const { toUpdate, toInsert } = planShoppingMerge(current, ingredients);
      for (const { id, text } of toUpdate) {
        await updateText({ id: id as Id<"shoppingItems">, text });
      }
      if (toInsert.length > 0) await addMany({ items: toInsert.map((text) => ({ text })) });
    },
    /**
     * REPLACES the whole shopping list with the week's aggregated ingredients.
     * Anything the user added or ticked off is discarded — callers should
     * confirm first.
     */
    generateShoppingList: async (
      weekDates: string[],
      plan: MealPlan,
      recipes: Recipe[],
    ): Promise<void> => {
      const items = buildGeneratedItems(weekDates, plan, recipes).map((item) => ({
        text: item.text,
        checked: false,
        recipeId: item.recipeId as Id<"recipes"> | undefined,
      }));
      await restore({ items });
    },
  };
}
