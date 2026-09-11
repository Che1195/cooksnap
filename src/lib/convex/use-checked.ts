"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

/** Checked ingredient indices per recipe id. */
export function useCheckedIngredients(): Record<string, number[]> | undefined {
  return useQuery(api.checkedIngredients.list, {});
}

export function useCheckedActions() {
  const toggle = useMutation(api.checkedIngredients.toggle).withOptimisticUpdate(
    (store, { recipeId, index }) => {
      const current = store.getQuery(api.checkedIngredients.list, {});
      if (!current) return;
      const list = current[recipeId] ?? [];
      const next = list.includes(index)
        ? list.filter((i) => i !== index)
        : [...list, index].sort((a, b) => a - b);
      store.setQuery(api.checkedIngredients.list, {}, { ...current, [recipeId]: next });
    },
  );
  const clear = useMutation(api.checkedIngredients.clear);
  return {
    toggleIngredient: async (recipeId: string, index: number): Promise<void> => {
      await toggle({ recipeId: recipeId as Id<"recipes">, index });
    },
    clearCheckedIngredients: async (recipeId: string): Promise<void> => {
      await clear({ recipeId: recipeId as Id<"recipes"> });
    },
  };
}
