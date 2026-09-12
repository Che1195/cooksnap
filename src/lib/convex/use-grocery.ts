"use client";

import { useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import type { OptimisticUpdate } from "convex/browser";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useConvexReady } from "./use-ready";
import type { GroceryItem } from "@/types";

export function useGroceryList(): GroceryItem[] | undefined {
  const ready = useConvexReady();
  return useQuery(api.groceryItems.list, ready ? {} : "skip");
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
  const addBack = useMutation(api.groceryItems.addBack);

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
      /** Undo for a clear: appends, so items added since survive. */
      restoreGroceryItems: async (items: GroceryItem[]): Promise<void> => {
        await addBack({ items: items.map((i) => ({ text: i.text, checked: i.checked })) });
      },
    }),
    [add, toggle, uncheckAll, clearChecked, clear, addBack],
  );
}
