"use client";

import { useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import type { OptimisticUpdate } from "convex/browser";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

/** Checked ingredient indices per recipe id. */
export function useCheckedIngredients(): Record<string, number[]> | undefined {
  return useQuery(api.checkedIngredients.list, {});
}

/** Module scope so the memoized `toggle` below keeps a stable identity. */
const toggleOptimistically: OptimisticUpdate<{ recipeId: Id<"recipes">; index: number }> = (
  store,
  { recipeId, index },
) => {
  const current = store.getQuery(api.checkedIngredients.list, {});
  if (!current) return;
  const list = current[recipeId] ?? [];
  const next = list.includes(index)
    ? list.filter((i) => i !== index)
    : [...list, index].sort((a, b) => a - b);
  store.setQuery(api.checkedIngredients.list, {}, { ...current, [recipeId]: next });
};

export function useCheckedActions() {
  const baseToggle = useMutation(api.checkedIngredients.toggle);
  const toggle = useMemo(() => baseToggle.withOptimisticUpdate(toggleOptimistically), [baseToggle]);
  const clear = useMutation(api.checkedIngredients.clear);
  return useMemo(
    () => ({
      toggleIngredient: async (recipeId: string, index: number): Promise<void> => {
        await toggle({ recipeId: recipeId as Id<"recipes">, index });
      },
      clearCheckedIngredients: async (recipeId: string): Promise<void> => {
        await clear({ recipeId: recipeId as Id<"recipes"> });
      },
    }),
    [toggle, clear],
  );
}
