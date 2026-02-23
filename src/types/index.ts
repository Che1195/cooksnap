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
  snack?: string;
  leftovers?: Partial<Record<MealSlot, boolean>>;
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

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";

export interface MealTemplate {
  id: string;
  name: string;
  days: Record<number, MealPlanDay>;
  createdAt: string;
}

export interface Profile {
  id: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeGroup {
  id: string;
  name: string;
  icon: string | null;
  sortOrder: number;
  isDefault: boolean;
  createdAt: string;
}

export interface RecipeGroupMember {
  id: string;
  groupId: string;
  recipeId: string;
  addedAt: string;
}
