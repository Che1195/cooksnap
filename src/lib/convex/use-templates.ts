"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { MealPlan, MealPlanDay, MealTemplate } from "@/types";

export function useTemplates(): MealTemplate[] | undefined {
  return useQuery(api.mealTemplates.list, {});
}

export function useTemplateActions() {
  const save = useMutation(api.mealTemplates.save);
  const apply = useMutation(api.mealTemplates.apply);
  const remove = useMutation(api.mealTemplates.remove);
  return {
    /**
     * Stores the week's plan keyed by day index (0 = first entry in
     * `weekDates`) so it can be applied to any later week. Empty days are
     * omitted.
     */
    saveWeekAsTemplate: async (name: string, weekDates: string[], plan: MealPlan): Promise<void> => {
      const days: Record<string, MealPlanDay> = {};
      weekDates.forEach((date, index) => {
        const day = plan[date];
        if (day) days[String(index)] = day;
      });
      await save({ name, days });
    },
    applyTemplate: async (templateId: string, weekDates: string[]): Promise<void> => {
      await apply({ templateId: templateId as Id<"mealTemplates">, weekDates });
    },
    deleteTemplate: async (id: string): Promise<void> => {
      await remove({ id: id as Id<"mealTemplates"> });
    },
  };
}
