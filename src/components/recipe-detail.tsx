"use client";

import Image from "next/image";
import { ExternalLink, Trash2, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useRecipeStore } from "@/stores/recipe-store";
import { TagPicker } from "@/components/tag-picker";
import type { Recipe } from "@/types";

interface RecipeDetailProps {
  recipe: Recipe;
  onDelete?: () => void;
}

export function RecipeDetail({ recipe, onDelete }: RecipeDetailProps) {
  const updateTags = useRecipeStore((s) => s.updateTags);
  const checkedIngredients = useRecipeStore((s) => s.checkedIngredients);
  const toggleIngredient = useRecipeStore((s) => s.toggleIngredient);
  const clearCheckedIngredients = useRecipeStore((s) => s.clearCheckedIngredients);

  const checked = checkedIngredients[recipe.id] || [];
  const hasChecked = checked.length > 0;

  return (
    <article className="pb-24">
      {/* Hero image */}
      {recipe.image && (
        <div className="relative aspect-[16/10] w-full bg-muted">
          <Image
            src={recipe.image}
            alt={recipe.title}
            fill
            className="object-cover"
            sizes="100vw"
            priority
          />
        </div>
      )}

      <div className="space-y-6 p-4">
        {/* Title + source */}
        <div>
          <h1 className="text-2xl font-bold leading-tight">{recipe.title}</h1>
          <a
            href={recipe.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="h-3 w-3" />
            View original
          </a>
        </div>

        {/* Tags */}
        <div>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">
            Tags
          </h2>
          <TagPicker
            selected={recipe.tags}
            onChange={(tags) => updateTags(recipe.id, tags)}
          />
        </div>

        {/* Ingredients */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Ingredients</h2>
            {hasChecked && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                onClick={() => clearCheckedIngredients(recipe.id)}
              >
                <RotateCcw className="mr-1 h-3 w-3" />
                Reset
              </Button>
            )}
          </div>
          <ul className="space-y-2">
            {recipe.ingredients.map((item, i) => {
              const isChecked = checked.includes(i);
              return (
                <li
                  key={i}
                  className="flex items-center gap-3 rounded-md px-1 py-1.5 transition-colors hover:bg-accent/50 cursor-pointer"
                  onClick={() => toggleIngredient(recipe.id, i)}
                >
                  <Checkbox
                    checked={isChecked}
                    onCheckedChange={() => toggleIngredient(recipe.id, i)}
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0"
                  />
                  <span
                    className={`text-sm leading-relaxed ${
                      isChecked
                        ? "text-muted-foreground line-through"
                        : ""
                    }`}
                  >
                    {item}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Instructions */}
        <div>
          <h2 className="mb-3 text-lg font-semibold">Instructions</h2>
          <ol className="space-y-4">
            {recipe.instructions.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                  {i + 1}
                </span>
                <p className="pt-0.5">{step}</p>
              </li>
            ))}
          </ol>
        </div>

        {/* Actions */}
        <div className="flex gap-2 border-t pt-4">
          {recipe.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {recipe.tags.map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
          <div className="ml-auto">
            <Button
              variant="destructive"
              size="sm"
              onClick={onDelete}
            >
              <Trash2 className="mr-1 h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}
