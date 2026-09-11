"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { MealPlan, MealSlot } from "@/types";

export function useMealPlan(startDate: string, endDate: string): MealPlan | undefined {
  return useQuery(api.mealPlans.forRange, { startDate, endDate });
}

export function useMealsForRecipe(
  recipeId: string,
): Array<{ date: string; mealType: MealSlot }> | undefined {
  return useQuery(api.mealPlans.forRecipe, { recipeId: recipeId as Id<"recipes"> });
}

export function useMealPlanActions() {
  const assign = useMutation(api.mealPlans.assign);
  const remove = useMutation(api.mealPlans.remove);
  const clearDates = useMutation(api.mealPlans.clearDates);
  return {
    /** Resolves false when the slot is already at capacity. */
    assignMeal: (date: string, slot: MealSlot, recipeId: string, isLeftover = false): Promise<boolean> =>
      assign({ date, mealType: slot, recipeId: recipeId as Id<"recipes">, isLeftover }),
    removeMealFromSlot: async (date: string, slot: MealSlot, recipeId: string): Promise<void> => {
      await remove({ date, mealType: slot, recipeId: recipeId as Id<"recipes"> });
    },
    clearWeek: async (weekDates: string[]): Promise<void> => {
      await clearDates({ dates: weekDates });
    },
  };
}
