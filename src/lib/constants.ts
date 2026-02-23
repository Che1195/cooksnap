/**
 * App-wide constants: default recipe tags, meal slot labels, day names,
 * and other shared configuration for meal planning.
 */

export const DEFAULT_TAGS = [
  "Breakfast",
  "Lunch",
  "Dinner",
  "Snack",
  "Dessert",
  "Quick",
  "Vegetarian",
  "Vegan",
] as const;

import type { MealSlot } from "@/types";

export const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

export const SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];

export const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
