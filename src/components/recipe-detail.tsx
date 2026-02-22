"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import { ExternalLink, Trash2, RotateCcw, Clock, Users, ChefHat, Minus, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useRecipeStore } from "@/stores/recipe-store";
import { TagPicker } from "@/components/tag-picker";
import { formatDuration } from "@/lib/utils";
import { scaleIngredient, parseServings } from "@/lib/ingredient-parser";
import { groupIngredientsByCategory } from "@/lib/ingredient-categorizer";
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

  const baseServings = parseServings(recipe.servings);
  const [currentServings, setCurrentServings] = useState(baseServings ?? 0);
  const scalingRatio = baseServings ? currentServings / baseServings : 1;
  const isScaled = baseServings !== null && currentServings !== baseServings;

  const ingredientGroups = useMemo(
    () => groupIngredientsByCategory(recipe.ingredients),
    [recipe.ingredients],
  );

  const prepDisplay = formatDuration(recipe.prepTime);
  const cookDisplay = formatDuration(recipe.cookTime);
  const totalDisplay = formatDuration(recipe.totalTime);

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
            sizes="(max-width: 640px) 100vw, 512px"
            priority
          />
        </div>
      )}

      <div className="space-y-6 p-4">
        {/* Title + source */}
        <div>
          <h1 className="text-2xl font-bold leading-tight">{recipe.title}</h1>
          {recipe.author && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              by {recipe.author}
            </p>
          )}
          <a
            href={recipe.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
            View original
          </a>
        </div>

        {/* Metadata pills */}
        {(prepDisplay || cookDisplay || totalDisplay || recipe.servings || recipe.cuisineType) && (
          <div className="flex flex-wrap gap-2">
            {prepDisplay && (
              <div className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs">
                <Clock className="h-3 w-3" aria-hidden="true" />
                <span>Prep: {prepDisplay}</span>
              </div>
            )}
            {cookDisplay && (
              <div className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs">
                <Clock className="h-3 w-3" aria-hidden="true" />
                <span>Cook: {cookDisplay}</span>
              </div>
            )}
            {totalDisplay && !prepDisplay && !cookDisplay && (
              <div className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs">
                <Clock className="h-3 w-3" aria-hidden="true" />
                <span>Total: {totalDisplay}</span>
              </div>
            )}
            {baseServings && (
              <div className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-1 text-xs">
                <Users className="h-3 w-3 ml-1" aria-hidden="true" />
                <button
                  onClick={() => setCurrentServings((s) => Math.max(1, s - 1))}
                  disabled={currentServings <= 1}
                  className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Decrease servings"
                >
                  <Minus className="h-3 w-3" />
                </button>
                <span className={`min-w-[2ch] text-center font-medium tabular-nums ${isScaled ? "text-primary" : ""}`}>
                  {currentServings}
                </span>
                <button
                  onClick={() => setCurrentServings((s) => s + 1)}
                  className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-accent"
                  aria-label="Increase servings"
                >
                  <Plus className="h-3 w-3" />
                </button>
                {isScaled && (
                  <button
                    onClick={() => setCurrentServings(baseServings)}
                    className="ml-0.5 mr-1 text-[10px] text-muted-foreground hover:text-foreground underline"
                  >
                    reset
                  </button>
                )}
              </div>
            )}
            {recipe.cuisineType && (
              <div className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs">
                <ChefHat className="h-3 w-3" aria-hidden="true" />
                <span>{recipe.cuisineType}</span>
              </div>
            )}
          </div>
        )}

        {/* Notes */}
        {recipe.notes && (
          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-sm italic text-muted-foreground">{recipe.notes}</p>
          </div>
        )}

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
            <div className="flex items-baseline gap-2">
              <h2 className="text-lg font-semibold">Ingredients</h2>
              {isScaled && (
                <span className="text-xs text-muted-foreground">
                  (adjusted for {currentServings} servings)
                </span>
              )}
            </div>
            {hasChecked && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                onClick={() => clearCheckedIngredients(recipe.id)}
              >
                <RotateCcw className="mr-1 h-3 w-3" aria-hidden="true" />
                Reset
              </Button>
            )}
          </div>
          <div className="space-y-4">
            {ingredientGroups.map((group) => (
              <div key={group.category}>
                <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {group.category}
                </h3>
                <ul className="space-y-2" role="list">
                  {group.items.map(({ originalIndex, raw, parsed }) => {
                    const isChecked = checked.includes(originalIndex);
                    return (
                      <li
                        key={originalIndex}
                        role="button"
                        tabIndex={0}
                        aria-checked={isChecked}
                        className="flex items-center gap-3 rounded-md px-1 py-1.5 transition-colors hover:bg-accent/50 cursor-pointer"
                        onClick={() => toggleIngredient(recipe.id, originalIndex)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleIngredient(recipe.id, originalIndex);
                          }
                        }}
                      >
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() => toggleIngredient(recipe.id, originalIndex)}
                          onClick={(e) => e.stopPropagation()}
                          className="shrink-0"
                          tabIndex={-1}
                          aria-hidden="true"
                        />
                        <span
                          className={`text-sm leading-relaxed ${
                            isChecked
                              ? "text-muted-foreground line-through"
                              : ""
                          }`}
                        >
                          {isScaled
                            ? scaleIngredient(parsed, scalingRatio)
                            : raw}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
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
              <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" />
              Delete
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}
