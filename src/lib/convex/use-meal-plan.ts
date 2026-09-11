"use client";

import { useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useConvexReady } from "./use-ready";
import type { MealPlan, MealSlot } from "@/types";

export function useMealPlan(startDate: string, endDate: string): MealPlan | undefined {
  const ready = useConvexReady();
  return useQuery(api.mealPlans.forRange, ready ? { startDate, endDate } : "skip");
}

export function useMealsForRecipe(
  recipeId: string,
): Array<{ date: string; mealType: MealSlot; isLeftover: boolean }> | undefined {
  const ready = useConvexReady();
  return useQuery(api.mealPlans.forRecipe, ready ? { recipeId: recipeId as Id<"recipes"> } : "skip");
}

export function useMealPlanActions() {
  const assign = useMutation(api.mealPlans.assign);
  const setLeftoverFlag = useMutation(api.mealPlans.setLeftover);
  const remove = useMutation(api.mealPlans.remove);
  const clearDates = useMutation(api.mealPlans.clearDates);
  return useMemo(
    () => ({
      /** Resolves false when the slot is already at capacity. */
      assignMeal: (date: string, slot: MealSlot, recipeId: string, isLeftover = false): Promise<boolean> =>
        assign({ date, mealType: slot, recipeId: recipeId as Id<"recipes">, isLeftover }),
      /** Flips the leftover flag on an entry that is already in the slot. */
      setLeftover: async (date: string, slot: MealSlot, recipeId: string, isLeftover: boolean): Promise<void> => {
        await setLeftoverFlag({ date, mealType: slot, recipeId: recipeId as Id<"recipes">, isLeftover });
      },
      removeMealFromSlot: async (date: string, slot: MealSlot, recipeId: string): Promise<void> => {
        await remove({ date, mealType: slot, recipeId: recipeId as Id<"recipes"> });
      },
      clearWeek: async (weekDates: string[]): Promise<void> => {
        await clearDates({ dates: weekDates });
      },
    }),
    [assign, setLeftoverFlag, remove, clearDates],
  );
}
