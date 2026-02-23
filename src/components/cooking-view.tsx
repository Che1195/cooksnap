"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Flame, Clock, Users, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useRecipeStore } from "@/stores/recipe-store";
import { formatDuration } from "@/lib/utils";
import { formatIngredientMain } from "@/lib/ingredient-parser";
import { groupIngredientsByCategory } from "@/lib/ingredient-categorizer";
import type { Recipe } from "@/types";

interface CookingViewProps {
  recipe: Recipe;
}

/**
 * Kitchen-optimized recipe view with large text, full-width step tap targets,
 * and minimal chrome. Designed for hands-free/messy-hands cooking.
 */
export function CookingView({ recipe }: CookingViewProps) {
  const router = useRouter();
  const stopCooking = useRecipeStore((s) => s.stopCooking);
  const cookingCompletedSteps = useRecipeStore((s) => s.cookingCompletedSteps);
  const toggleCookingStep = useRecipeStore((s) => s.toggleCookingStep);
  const checkedIngredients = useRecipeStore((s) => s.checkedIngredients);
  const toggleIngredient = useRecipeStore((s) => s.toggleIngredient);

  const checked = checkedIngredients[recipe.id] || [];
  const completedCount = cookingCompletedSteps.size;
  const totalSteps = recipe.instructions.length;
  const progress = totalSteps > 0 ? (completedCount / totalSteps) * 100 : 0;

  const cookDisplay = formatDuration(recipe.cookTime);
  const totalDisplay = formatDuration(recipe.totalTime);
  const timeDisplay = cookDisplay || totalDisplay;

  const ingredientGroups = useMemo(
    () => groupIngredientsByCategory(recipe.ingredients),
    [recipe.ingredients],
  );

  const handleDone = () => {
    stopCooking();
    toast.success("Nice work! Recipe complete.");
    router.push("/");
  };

  return (
    <div className="pb-24">
      {/* Progress bar */}
      <div className="sticky top-0 z-10 bg-background">
        <div className="h-1 w-full bg-muted">
          <div
            className="h-1 bg-primary transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b">
          <h1 className="text-lg font-bold leading-tight line-clamp-2 flex-1">
            {recipe.title}
          </h1>
          <Button size="sm" variant="outline" onClick={handleDone}>
            <Check className="mr-1 h-4 w-4" aria-hidden="true" />
            Done
          </Button>
        </div>
      </div>

      <div className="space-y-6 p-4">
        {/* Info strip */}
        {(timeDisplay || recipe.servings) && (
          <div className="flex flex-wrap gap-3">
            {timeDisplay && (
              <div className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-sm">
                <Clock className="h-4 w-4" aria-hidden="true" />
                <span>{timeDisplay}</span>
              </div>
            )}
            {recipe.servings && (
              <div className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-sm">
                <Users className="h-4 w-4" aria-hidden="true" />
                <span>{recipe.servings} servings</span>
              </div>
            )}
          </div>
        )}

        {/* Ingredients */}
        <div>
          <h2 className="mb-3 text-lg font-semibold">Ingredients</h2>
          <div className="space-y-3">
            {ingredientGroups.map((group) => (
              <div key={group.category}>
                <h3 className="mb-1 text-sm font-medium uppercase tracking-wide text-muted-foreground">
                  {group.category}
                </h3>
                <ul className="space-y-0" role="list">
                  {group.items.map(({ originalIndex, parsed }) => {
                    const isChecked = checked.includes(originalIndex);
                    return (
                      <li
                        key={originalIndex}
                        role="button"
                        tabIndex={0}
                        aria-checked={isChecked}
                        className="flex items-center gap-3 rounded-md px-2 py-1 transition-colors hover:bg-accent/50 cursor-pointer"
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
                          className={`text-base leading-relaxed ${
                            isChecked
                              ? "text-muted-foreground line-through"
                              : ""
                          }`}
                        >
                          {formatIngredientMain(parsed)}
                          {parsed.prepNote && (
                            <span className="italic text-muted-foreground/70">, {parsed.prepNote}</span>
                          )}
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
          <h2 className="mb-3 text-lg font-semibold">
            Steps
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {completedCount}/{totalSteps}
            </span>
          </h2>
          <div className="space-y-3">
            {recipe.instructions.map((step, i) => {
              const isDone = cookingCompletedSteps.has(i);
              return (
                <button
                  key={i}
                  type="button"
                  className={`flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-colors ${
                    isDone
                      ? "border-muted bg-muted/50"
                      : "border-border hover:bg-accent/30"
                  }`}
                  onClick={() => toggleCookingStep(i)}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                      isDone
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isDone ? <Check className="h-4 w-4" /> : i + 1}
                  </span>
                  <p
                    className={`text-base leading-relaxed pt-0.5 ${
                      isDone ? "text-muted-foreground line-through" : ""
                    }`}
                  >
                    {step}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Done cooking button at bottom */}
        <Button className="w-full" size="lg" onClick={handleDone}>
          <Flame className="mr-2 h-5 w-5" aria-hidden="true" />
          Done Cooking
        </Button>
      </div>
    </div>
  );
}
