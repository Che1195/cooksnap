"use client";

import { UrlInput } from "@/components/url-input";
import { RecipeCard } from "@/components/recipe-card";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { useRecipes } from "@/lib/convex/use-recipes";
import { useCurrentUser } from "@/lib/convex/use-user";
import { Skeleton } from "@/components/ui/skeleton";

export default function HomePage() {
  const { isLoaded } = useCurrentUser();
  const authLoading = !isLoaded;
  const recipes = useRecipes();
  const recent = (recipes ?? []).slice(0, 6);
  const showLoading = authLoading || recipes === undefined;

  return (
    <div className="space-y-6 p-4 pt-6">
      {/* Header — always visible */}
      <div>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">CookSnap</h1>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            {!authLoading && <UserMenu />}
          </div>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste a recipe link and snap it into your collection
        </p>
      </div>

      {/* URL Input — always visible */}
      <UrlInput />

      {/* Recent recipes */}
      {showLoading ? (
        <div>
          <Skeleton className="mb-3 h-6 w-24" />
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="aspect-[4/3] w-full" />
            ))}
          </div>
        </div>
      ) : recent.length > 0 ? (
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
          <span className="text-5xl" role="img" aria-label="Empty plate">🍽️</span>
          <p className="mt-4 text-sm text-muted-foreground">
            No recipes yet. Paste a URL above to get started!
          </p>
        </div>
      )}
    </div>
  );
}
