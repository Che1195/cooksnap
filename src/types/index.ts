export interface Recipe {
  id: string;
  title: string;
  image: string | null;
  ingredients: string[];
  instructions: string[];
  sourceUrl: string;
  tags: string[];
  createdAt: string;
}

export interface ScrapedRecipe {
  title: string;
  image: string | null;
  ingredients: string[];
  instructions: string[];
}

export interface MealPlanDay {
  breakfast?: string;
  lunch?: string;
  dinner?: string;
}

export interface MealPlan {
  [isoDate: string]: MealPlanDay;
}

export interface ShoppingItem {
  id: string;
  text: string;
  checked: boolean;
  recipeId?: string;
}

export type MealSlot = "breakfast" | "lunch" | "dinner";
