"use client";

import { useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import type { OptimisticUpdate } from "convex/browser";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { GroceryItem } from "@/types";

export function useGroceryList(): GroceryItem[] | undefined {
  return useQuery(api.groceryItems.list, {});
}

/** Module scope so the memoized `toggle` below keeps a stable identity. */
const toggleOptimistically: OptimisticUpdate<{ id: Id<"groceryItems"> }> = (store, { id }) => {
  const current = store.getQuery(api.groceryItems.list, {});
  if (!current) return;
  store.setQuery(
    api.groceryItems.list,
    {},
    current.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i)),
  );
};

export function useGroceryActions() {
  const add = useMutation(api.groceryItems.add);
  const baseToggle = useMutation(api.groceryItems.toggle);
  const toggle = useMemo(() => baseToggle.withOptimisticUpdate(toggleOptimistically), [baseToggle]);
  const uncheckAll = useMutation(api.groceryItems.uncheckAll);
  const clearChecked = useMutation(api.groceryItems.clearChecked);
  const clear = useMutation(api.groceryItems.clear);
  const restore = useMutation(api.groceryItems.restore);

  return useMemo(
    () => ({
      addGroceryItem: async (text: string): Promise<void> => {
        await add({ text });
      },
      toggleGroceryItem: async (id: string): Promise<void> => {
        await toggle({ id: id as Id<"groceryItems"> });
      },
      uncheckAllGroceryItems: async (): Promise<void> => {
        await uncheckAll({});
      },
      clearCheckedGroceryItems: async (): Promise<void> => {
        await clearChecked({});
      },
      clearGroceryList: async (): Promise<void> => {
        await clear({});
      },
      /** REPLACES the whole grocery list — used to undo a clear. */
      restoreGroceryItems: async (items: GroceryItem[]): Promise<void> => {
        await restore({ items: items.map((i) => ({ text: i.text, checked: i.checked })) });
      },
    }),
    [add, toggle, uncheckAll, clearChecked, clear, restore],
  );
}
