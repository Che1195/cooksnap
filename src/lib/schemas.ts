import { z } from "zod";

/** Validates a complete Recipe object with required core fields and optional metadata. */
export const recipeSchema = z.object({
  id: z.string(),
  title: z.string(),
  image: z.string().refine(
    (s) => /^https?:\/\//i.test(s) || /^data:/i.test(s),
    { message: "Must be a valid URL or data URI" }
  ).nullable().default(null),
  ingredients: z.array(z.string()),
  instructions: z.array(z.string()),
  sourceUrl: z.string().url().or(z.literal("")),
  tags: z.array(z.string()),
  createdAt: z.string(),
  // Optional metadata fields (added in v2)
  prepTime: z.string().nullable().optional().default(null),
  cookTime: z.string().nullable().optional().default(null),
  totalTime: z.string().nullable().optional().default(null),
  servings: z.string().nullable().optional().default(null),
  author: z.string().nullable().optional().default(null),
  cuisineType: z.string().nullable().optional().default(null),
  difficulty: z.enum(["Easy", "Medium", "Hard"]).nullable().optional().default(null),
  rating: z.number().int().min(1).max(5).nullable().optional().default(null),
  isFavorite: z.boolean().default(false),
  notes: z.string().nullable().optional().default(null),
});

/** Validates a single day's meal plan with optional slot assignments and leftover flags. */
export const mealPlanDaySchema = z.object({
  breakfast: z.string().optional(),
  lunch: z.string().optional(),
  dinner: z.string().optional(),
  snack: z.string().optional(),
  leftovers: z.record(z.string(), z.boolean()).optional(),
});

/** Validates a shopping list item with id, text, checked state, and optional recipe reference. */
export const shoppingItemSchema = z.object({
  id: z.string(),
  text: z.string(),
  checked: z.boolean(),
  recipeId: z.string().optional(),
});

/** Validates the persisted store state shape used for localStorage migration. */
export const storeStateSchema = z.object({
  recipes: z.array(recipeSchema),
  mealPlan: z.record(z.string(), mealPlanDaySchema),
  shoppingList: z.array(shoppingItemSchema),
  checkedIngredients: z.record(z.string(), z.array(z.number())),
});

export type ValidatedStoreState = z.infer<typeof storeStateSchema>;
