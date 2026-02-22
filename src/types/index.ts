export interface Recipe {
  id: string;
  title: string;
  image: string | null;
  ingredients: string[];
  instructions: string[];
  sourceUrl: string;
  tags: string[];
  createdAt: string;

  // Metadata (optional, extracted when available)
  prepTime?: string | null;
  cookTime?: string | null;
  totalTime?: string | null;
  servings?: string | null;
  author?: string | null;
  cuisineType?: string | null;
  difficulty?: "Easy" | "Medium" | "Hard" | null;
  rating?: number | null;
  isFavorite?: boolean;
  notes?: string | null;
}

export interface ScrapedRecipe {
  title: string;
  image: string | null;
  ingredients: string[];
  instructions: string[];

  // Metadata (optional)
  prepTime?: string | null;
  cookTime?: string | null;
  totalTime?: string | null;
  servings?: string | null;
  author?: string | null;
  cuisineType?: string | null;
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
