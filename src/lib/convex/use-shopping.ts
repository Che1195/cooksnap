"use client";

import { useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import type { OptimisticUpdate } from "convex/browser";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { buildGeneratedItems } from "@/lib/shopping-merge";
import { useConvexReady } from "./use-ready";
import type { MealPlan, Recipe, ShoppingItem } from "@/types";

export function useShoppingList(): ShoppingItem[] | undefined {
  const ready = useConvexReady();
  return useQuery(api.shoppingItems.list, ready ? {} : "skip");
}

/**
 * Module scope on purpose: `withOptimisticUpdate` builds a new mutation
 * function every call, so an inline callback would give the hook a fresh
 * `toggle` identity each render and defeat the memo below.
 */
const toggleOptimistically: OptimisticUpdate<{ id: Id<"shoppingItems"> }> = (store, { id }) => {
  const current = store.getQuery(api.shoppingItems.list, {});
  if (!current) return;
  store.setQuery(
    api.shoppingItems.list,
    {},
    current.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i)),
  );
};

export function useShoppingActions() {
  const add = useMutation(api.shoppingItems.add);
  const addIngredients = useMutation(api.shoppingItems.addIngredients);
  const baseToggle = useMutation(api.shoppingItems.toggle);
  const toggle = useMemo(() => baseToggle.withOptimisticUpdate(toggleOptimistically), [baseToggle]);
  const uncheckAll = useMutation(api.shoppingItems.uncheckAll);
  const clearChecked = useMutation(api.shoppingItems.clearChecked);
  const clear = useMutation(api.shoppingItems.clear);
  const addBack = useMutation(api.shoppingItems.addBack);
  const restore = useMutation(api.shoppingItems.restore);

  return useMemo(
    () => ({
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
      /** Undo for a clear: appends, so items added since survive. */
      restoreShoppingItems: async (items: ShoppingItem[]): Promise<void> => {
        await addBack({
          items: items.map((i) => ({
            text: i.text,
            checked: i.checked,
            recipeId: i.recipeId as Id<"recipes"> | undefined,
          })),
        });
      },
      /** Merge ingredients only with rows belonging to the same recipe. */
      addIngredientsToShoppingList: async (
        ingredients: string[],
        recipeId: string,
      ): Promise<void> => {
        await addIngredients({ ingredients, recipeId: recipeId as Id<"recipes"> });
      },
      /**
       * REPLACES the whole shopping list with the week's aggregated ingredients.
       * Anything the user added or ticked off is discarded — callers should
       * confirm first. A week with no planned meals is a no-op rather than a
       * wipe, so "generate" on an empty week cannot destroy a hand-built list.
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
        if (items.length === 0) return;
        await restore({ items });
      },
    }),
    [add, addIngredients, toggle, uncheckAll, clearChecked, clear, addBack, restore],
  );
}
