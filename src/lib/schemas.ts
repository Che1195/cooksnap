import { z } from "zod";

export const recipeSchema = z.object({
  id: z.string(),
  title: z.string(),
  image: z.string().nullable().default(null),
  ingredients: z.array(z.string()),
  instructions: z.array(z.string()),
  sourceUrl: z.string(),
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
  rating: z.number().nullable().optional().default(null),
  isFavorite: z.boolean().optional().default(false),
  notes: z.string().nullable().optional().default(null),
});

export const mealPlanDaySchema = z.object({
  breakfast: z.string().optional(),
  lunch: z.string().optional(),
  dinner: z.string().optional(),
});

export const shoppingItemSchema = z.object({
  id: z.string(),
  text: z.string(),
  checked: z.boolean(),
  recipeId: z.string().optional(),
});

export const storeStateSchema = z.object({
  recipes: z.array(recipeSchema),
  mealPlan: z.record(z.string(), mealPlanDaySchema),
  shoppingList: z.array(shoppingItemSchema),
  checkedIngredients: z.record(z.string(), z.array(z.number())),
});

export type ValidatedStoreState = z.infer<typeof storeStateSchema>;
