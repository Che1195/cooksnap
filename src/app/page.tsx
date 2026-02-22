"use client";

import { UrlInput } from "@/components/url-input";
import { RecipeCard } from "@/components/recipe-card";
import { useRecipeStore } from "@/stores/recipe-store";

export default function HomePage() {
  const recipes = useRecipeStore((s) => s.recipes);
  const recent = recipes.slice(0, 6);

  return (
    <div className="space-y-6 p-4 pt-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">CookSnap</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste a recipe link and snap it into your collection
        </p>
      </div>

      {/* URL Input */}
      <UrlInput />

      {/* Recent recipes */}
      {recent.length > 0 ? (
        <div>
          <h2 className="mb-3 text-lg font-semibold">Recent</h2>
          <div className="grid grid-cols-2 gap-3">
            {recent.map((recipe) => (
              <RecipeCard key={recipe.id} recipe={recipe} />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center py-16 text-center">
          <span className="text-5xl">🍽️</span>
          <p className="mt-4 text-sm text-muted-foreground">
            No recipes yet. Paste a URL above to get started!
          </p>
        </div>
      )}
    </div>
  );
}
