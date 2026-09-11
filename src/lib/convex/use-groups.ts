"use client";

import { useEffect, useMemo } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { RecipeGroup } from "@/types";

/**
 * Recipe groups, seeding the built-in defaults the first time a signed-in user
 * has none. `ensureDefaults` is idempotent on the server.
 */
export function useGroups(): RecipeGroup[] | undefined {
  const { isAuthenticated } = useConvexAuth();
  const ensureDefaults = useMutation(api.recipeGroups.ensureDefaults);
  const groups = useQuery(api.recipeGroups.list, {});
  useEffect(() => {
    if (isAuthenticated && groups && !groups.some((g) => g.isDefault)) void ensureDefaults({});
  }, [isAuthenticated, groups, ensureDefaults]);
  return groups;
}

/** Recipe ids per group id. Groups with no members are omitted. */
export function useGroupMembers(): Record<string, string[]> | undefined {
  return useQuery(api.recipeGroups.members, {});
}

export function useGroupActions() {
  const create = useMutation(api.recipeGroups.create);
  const update = useMutation(api.recipeGroups.update);
  const remove = useMutation(api.recipeGroups.remove);
  const addRecipe = useMutation(api.recipeGroups.addRecipe);
  const removeRecipe = useMutation(api.recipeGroups.removeRecipe);
  return useMemo(
    () => ({
      /** Resolves to the new group's id so callers can act on it immediately. */
      createGroup: async (name: string, icon?: string): Promise<string> => create({ name, icon }),
      updateGroup: async (
        id: string,
        updates: Partial<Pick<RecipeGroup, "name" | "icon" | "sortOrder">>,
      ): Promise<void> => {
        await update({ id: id as Id<"recipeGroups">, updates });
      },
      deleteGroup: async (id: string): Promise<void> => {
        await remove({ id: id as Id<"recipeGroups"> });
      },
      addRecipeToGroup: async (groupId: string, recipeId: string): Promise<void> => {
        await addRecipe({ groupId: groupId as Id<"recipeGroups">, recipeId: recipeId as Id<"recipes"> });
      },
      removeRecipeFromGroup: async (groupId: string, recipeId: string): Promise<void> => {
        await removeRecipe({ groupId: groupId as Id<"recipeGroups">, recipeId: recipeId as Id<"recipes"> });
      },
    }),
    [create, update, remove, addRecipe, removeRecipe],
  );
}
