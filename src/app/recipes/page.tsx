"use client";

import { useState, useMemo, useEffect } from "react";
import { Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RecipeCard } from "@/components/recipe-card";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { useRecipeStore } from "@/stores/recipe-store";
import { useAuth } from "@/components/auth-provider";
import { DEFAULT_TAGS } from "@/lib/constants";
import { toast } from "sonner";

export default function RecipesPage() {
  const { user } = useAuth();
  const recipes = useRecipeStore((s) => s.recipes);
  const isLoading = useRecipeStore((s) => s.isLoading);
  const error = useRecipeStore((s) => s.error);
  const hydrate = useRecipeStore((s) => s.hydrate);
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);

  useEffect(() => {
    if (user && recipes.length === 0 && !isLoading) {
      hydrate();
    }
  }, [user, recipes.length, isLoading, hydrate]);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  // Collect all used tags
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const r of recipes) {
      for (const t of r.tags) tagSet.add(t);
    }
    // Also include default tags that exist in recipes
    for (const t of DEFAULT_TAGS) {
      if (recipes.some((r) => r.tags.includes(t))) tagSet.add(t);
    }
    return Array.from(tagSet).sort();
  }, [recipes]);

  const filtered = useMemo(() => {
    let result = recipes;
    if (query) {
      const q = query.toLowerCase();
      result = result.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.ingredients.some((ing) => ing.toLowerCase().includes(q))
      );
    }
    if (activeTag) {
      result = result.filter((r) => r.tags.includes(activeTag));
    }
    return result;
  }, [recipes, query, activeTag]);

  return (
    <div className="space-y-4 p-4 pt-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Recipes</h1>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">Loading recipes...</p>
        </div>
      ) : (
        <>
          {/* Search */}
          <div className="relative">
            <label htmlFor="recipe-search" className="sr-only">Search recipes</label>
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              id="recipe-search"
              placeholder="Search recipes or ingredients..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Tag filters */}
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by tag">
              <button onClick={() => setActiveTag(null)} type="button">
                <Badge variant={activeTag === null ? "default" : "outline"}>
                  All
                </Badge>
              </button>
              {allTags.map((tag) => (
                <button key={tag} onClick={() => setActiveTag(activeTag === tag ? null : tag)} type="button">
                  <Badge variant={activeTag === tag ? "default" : "outline"}>
                    {tag}
                  </Badge>
                </button>
              ))}
            </div>
          )}

          {/* Results */}
          {filtered.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {filtered.map((recipe) => (
                <RecipeCard key={recipe.id} recipe={recipe} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center py-16 text-center">
              <span className="text-4xl" role="img" aria-label="Search">🔍</span>
              <p className="mt-4 text-sm text-muted-foreground">
                {recipes.length === 0
                  ? "No recipes saved yet."
                  : "No recipes match your search."}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
