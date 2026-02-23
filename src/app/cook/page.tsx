"use client";

import { useEffect } from "react";
import { useRecipeStore } from "@/stores/recipe-store";
import { useAuth } from "@/components/auth-provider";
import { CookingView } from "@/components/cooking-view";
import { BookOpen, Loader2 } from "lucide-react";
import Link from "next/link";

/**
 * Cook page — renders a focused cooking view when a recipe is active,
 * or an empty state prompting the user to pick a recipe.
 */
export default function CookPage() {
  const { user } = useAuth();
  const recipes = useRecipeStore((s) => s.recipes);
  const isLoading = useRecipeStore((s) => s.isLoading);
  const hydrate = useRecipeStore((s) => s.hydrate);
  const cookingRecipeId = useRecipeStore((s) => s.cookingRecipeId);
  const stopCooking = useRecipeStore((s) => s.stopCooking);

  useEffect(() => {
    if (user && recipes.length === 0 && !isLoading) {
      hydrate();
    }
  }, [user, recipes.length, isLoading, hydrate]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="mt-4 text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  // No recipe selected — empty state
  if (!cookingRecipeId) {
    return (
      <div className="flex min-h-[calc(100dvh-8rem)] flex-col items-center justify-center px-6 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <BookOpen className="h-8 w-8 text-muted-foreground" />
        </div>
        <h1 className="text-lg font-semibold">Ready to cook?</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick a recipe to start cooking
        </p>
        <Link
          href="/recipes"
          className="mt-4 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Browse Recipes
        </Link>
      </div>
    );
  }

  // Recipe set but not found (deleted) — auto-clear and show error
  const recipe = recipes.find((r) => r.id === cookingRecipeId);
  if (!recipe) {
    stopCooking();
    return (
      <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
        <p className="text-sm text-muted-foreground">
          That recipe is no longer available.
        </p>
        <Link
          href="/recipes"
          className="mt-4 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Browse Recipes
        </Link>
      </div>
    );
  }

  return <CookingView recipe={recipe} />;
}
