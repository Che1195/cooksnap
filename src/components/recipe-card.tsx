"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Clock, Users, CalendarPlus, Heart, Copy } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { formatDuration } from "@/lib/utils";
import { useGroupActions, useGroupMembers, useGroups } from "@/lib/convex/use-groups";
import { MealPrepSheet } from "@/components/meal-prep-sheet";
import { SchedulePickerSheet } from "@/components/schedule-picker-sheet";
import { toast } from "sonner";
import type { Recipe } from "@/types";

interface RecipeCardProps {
  recipe: Recipe;
  /** When set, the card acts as a picker: tapping calls onPick instead of navigating. */
  onPick?: () => void;
  /** Offline: the card renders from a snapshot, so its write actions are off. */
  offline?: boolean;
}

/**
 * Compact recipe card for grid views. Shows image, truncated title (max 2 lines),
 * metadata, tags, and a quick "add to plan" button overlaid on the image.
 */
export function RecipeCard({ recipe, onPick, offline = false }: RecipeCardProps) {
  const recipeGroups = useGroups() ?? [];
  const groupMembers = useGroupMembers() ?? {};
  const { addRecipeToGroup, removeRecipeFromGroup } = useGroupActions();

  // Check if recipe is in the Favorites group (the default group)
  const favoritesGroup = recipeGroups.find((g) => g.isDefault);
  const isFavorite = favoritesGroup
    ? (groupMembers[favoritesGroup.id] ?? []).includes(recipe.id)
    : false;

  const toggleFavorite = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!favoritesGroup || offline) return;
    try {
      if (isFavorite) {
        await removeRecipeFromGroup(favoritesGroup.id, recipe.id);
      } else {
        await addRecipeToGroup(favoritesGroup.id, recipe.id);
      }
    } catch {
      toast.error("Failed to update favorites");
    }
  };

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [mealPrepOpen, setMealPrepOpen] = useState(false);

  const timeDisplay = formatDuration(recipe.totalTime) ??
    formatDuration(recipe.cookTime) ??
    formatDuration(recipe.prepTime);

  /** Shared card content — used by both Link and pick-mode wrapper. */
  const cardContent = (
    <Card className="relative gap-0 overflow-hidden py-0 transition-shadow hover:shadow-md">
      <div className="relative aspect-[4/3] bg-muted">
        {recipe.image ? (
          <Image
            src={recipe.image}
            alt={recipe.title}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-3xl" role="img" aria-label="No image available">
            🍳
          </div>
        )}
      </div>
      {/* Favorite toggle — top-left corner of image */}
      {favoritesGroup && (
        <button
          type="button"
          onClick={(e) => void toggleFavorite(e)}
          disabled={offline}
          className="absolute top-2 left-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/40 transition-all hover:scale-110 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          <Heart
            className={`h-4 w-4 ${
              isFavorite
                ? "fill-red-500 text-red-500"
                : "text-white/80"
            }`}
          />
        </button>
      )}
      {/* Quick add-to-plan button — hidden in pick mode */}
      {!onPick && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setScheduleOpen(true);
            }}
            disabled={offline}
            className="absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-all hover:bg-primary/90 hover:scale-110 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
            aria-label={`Add ${recipe.title} to meal plan`}
          >
            <CalendarPlus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMealPrepOpen(true);
            }}
            disabled={offline}
            className="absolute top-11 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-all hover:bg-primary/90 hover:scale-110 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
            aria-label={`Meal prep ${recipe.title}`}
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        </>
      )}
      <CardContent className="px-2 py-1.5">
        <h3 className="line-clamp-1 text-xs font-medium leading-snug">
          {recipe.title}
        </h3>
        {/* Metadata row */}
        {(timeDisplay || recipe.servings) && (
          <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
            {timeDisplay && (
              <span className="inline-flex items-center gap-0.5">
                <Clock className="h-2.5 w-2.5" aria-hidden="true" />
                {timeDisplay}
              </span>
            )}
            {recipe.servings && (
              <span className="inline-flex items-center gap-0.5">
                <Users className="h-2.5 w-2.5" aria-hidden="true" />
                {recipe.servings}
              </span>
            )}
          </div>
        )}

      </CardContent>
    </Card>
  );

  return (
    <>
      {onPick ? (
        <div
          role="button"
          tabIndex={0}
          aria-label={`Pick recipe: ${recipe.title}`}
          className="cursor-pointer"
          onClick={onPick}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onPick();
            }
          }}
        >
          {cardContent}
        </div>
      ) : (
        <Link href={`/recipes/${recipe.id}`} aria-label={`View recipe: ${recipe.title}`}>
          {cardContent}
        </Link>
      )}

      {/* Meal prep sheet — only mount when open, only in normal (non-pick) mode */}
      {!onPick && mealPrepOpen && (
        <MealPrepSheet
          recipe={recipe}
          open={mealPrepOpen}
          onOpenChange={setMealPrepOpen}
        />
      )}

      {/* Schedule picker sheet — only mount when open, only in normal (non-pick) mode */}
      {!onPick && scheduleOpen && (
        <SchedulePickerSheet
          recipe={recipe}
          open={scheduleOpen}
          onOpenChange={setScheduleOpen}
        />
      )}
    </>
  );
}
