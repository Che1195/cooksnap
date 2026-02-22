"use client";

import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RecipeCard } from "@/components/recipe-card";
import { useRecipeStore } from "@/stores/recipe-store";
import { DEFAULT_TAGS } from "@/lib/constants";

export default function RecipesPage() {
  const recipes = useRecipeStore((s) => s.recipes);
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);

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
      <h1 className="text-2xl font-bold">Recipes</h1>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search recipes or ingredients..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Tag filters */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <Badge
            variant={activeTag === null ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setActiveTag(null)}
          >
            All
          </Badge>
          {allTags.map((tag) => (
            <Badge
              key={tag}
              variant={activeTag === tag ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
            >
              {tag}
            </Badge>
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
          <span className="text-4xl">🔍</span>
          <p className="mt-4 text-sm text-muted-foreground">
            {recipes.length === 0
              ? "No recipes saved yet."
              : "No recipes match your search."}
          </p>
        </div>
      )}
    </div>
  );
}
