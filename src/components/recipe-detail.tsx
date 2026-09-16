"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import {
  ExternalLink,
  Trash2,
  RotateCcw,
  Clock,
  Users,
  ChefHat,
  Minus,
  Plus,
  CalendarPlus,
  ChevronDown,
  Tag,
  Flame,
  FolderOpen,
  Heart,
  ShoppingCart,
  Copy,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useRecipeActions } from "@/lib/convex/use-recipes";
import {
  useCheckedActions,
  useCheckedIngredients,
} from "@/lib/convex/use-checked";
import {
  useGroupActions,
  useGroupMembers,
  useGroups,
} from "@/lib/convex/use-groups";
import { useShoppingActions, useShoppingList } from "@/lib/convex/use-shopping";
import { TagPicker } from "@/components/tag-picker";
import { GroupPicker } from "@/components/group-picker";
import { formatDuration } from "@/lib/utils";
import { projectRecipe } from "@/lib/recipe-interpretation";
import { exactServings, servingLabel } from "@/lib/recipe-serving";
import { groupIngredientsByCategory } from "@/lib/ingredient-categorizer";
import { highlightIngredients } from "@/lib/ingredient-highlighter";
import { MealPrepSheet } from "@/components/meal-prep-sheet";
import { SchedulePickerSheet } from "@/components/schedule-picker-sheet";
import type { Recipe } from "@/types";

/** Stable empty array to avoid re-renders when no ingredients are checked. */
const EMPTY_ARRAY: number[] = [];

interface RecipeDetailProps {
  recipe: Recipe;
  onDelete?: () => void;
  onCook?: (ratio: number) => void;
}

export function RecipeDetail({ recipe, onDelete, onCook }: RecipeDetailProps) {
  const { updateTags } = useRecipeActions();
  const checked = useCheckedIngredients()?.[recipe.id] ?? EMPTY_ARRAY;
  const { toggleIngredient, clearCheckedIngredients } = useCheckedActions();
  const recipeGroups = useGroups() ?? [];
  const groupMembers = useGroupMembers() ?? {};
  const { addRecipeToGroup, removeRecipeFromGroup, createGroup } =
    useGroupActions();
  const shoppingList = useShoppingList() ?? [];
  const { addIngredientsToShoppingList } = useShoppingActions();

  // Favorite toggle — mirrors the pattern in recipe-card.tsx
  const favoritesGroup = recipeGroups.find((g) => g.isDefault);
  const isFavorite = favoritesGroup
    ? (groupMembers[favoritesGroup.id] ?? []).includes(recipe.id)
    : false;

  const toggleFavorite = async () => {
    if (!favoritesGroup) return;
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

  /** Optimistic on the hook; the toast only fires if the server rejects it. */
  const toggleChecked = (index: number) => {
    void toggleIngredient(recipe.id, index).catch(() =>
      toast.error("Failed to update ingredient"),
    );
  };

  const [mealPrepOpen, setMealPrepOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const hasChecked = checked.length > 0;

  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  const baseServings = exactServings(recipe.servings);
  const [scalingRatio, setScalingRatio] = useState(1);
  const currentServings =
    baseServings === null ? undefined : baseServings * scalingRatio;
  const isScaled = scalingRatio !== 1;
  const projection = useMemo(
    () => projectRecipe(recipe, scalingRatio),
    [recipe, scalingRatio],
  );
  const ratioStep = baseServings === null ? 0.25 : 1 / baseServings;
  const minimumRatio = Math.min(1, ratioStep);

  const ingredientGroups = useMemo(
    () => groupIngredientsByCategory(recipe.ingredients),
    [recipe.ingredients],
  );

  const [ingredientView, setIngredientView] = useState<"category" | "original">(
    "original",
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
          <div className="flex items-start gap-2">
            <h1 className="text-2xl font-bold leading-tight flex-1">
              {recipe.title}
            </h1>
            {favoritesGroup && (
              <button
                type="button"
                onClick={() => void toggleFavorite()}
                className="mt-1 shrink-0"
                aria-label={
                  isFavorite ? "Remove from favorites" : "Add to favorites"
                }
              >
                <Heart
                  className={`h-6 w-6 transition-colors ${
                    isFavorite
                      ? "fill-red-500 text-red-500"
                      : "text-muted-foreground hover:text-red-400"
                  }`}
                />
              </button>
            )}
          </div>
          {recipe.author && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              by {recipe.author}
            </p>
          )}
          {/^https?:\/\//i.test(recipe.sourceUrl) && (
            <a
              href={recipe.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
              View original
            </a>
          )}
        </div>

        {/* Metadata pills */}
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
          <div className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-1 text-xs">
            <Users className="h-3 w-3 ml-1" aria-hidden="true" />
            <button
              onClick={() =>
                setScalingRatio((ratio) =>
                  Math.max(minimumRatio, ratio - ratioStep),
                )
              }
              disabled={scalingRatio <= minimumRatio}
              className="relative flex h-10 w-10 items-center justify-center rounded-full hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label={
                baseServings === null
                  ? "Decrease recipe multiplier"
                  : "Decrease servings"
              }
            >
              <Minus className="h-3 w-3" />
            </button>
            <span
              className={`min-w-[2ch] text-center font-medium tabular-nums ${isScaled ? "text-primary" : ""}`}
            >
              {baseServings === null
                ? `${scalingRatio}× recipe`
                : servingLabel(recipe.servings, scalingRatio)}
            </span>
            <button
              onClick={() =>
                setScalingRatio((ratio) => Math.min(100, ratio + ratioStep))
              }
              className="relative flex h-10 w-10 items-center justify-center rounded-full hover:bg-accent"
              disabled={scalingRatio >= 100}
              aria-label={
                baseServings === null
                  ? "Increase recipe multiplier"
                  : "Increase servings"
              }
            >
              <Plus className="h-3 w-3" />
            </button>
            {isScaled && (
              <button
                type="button"
                aria-label="Reset amounts"
                onClick={() => setScalingRatio(1)}
                className="ml-0.5 mr-1 min-h-10 px-2 text-xs text-muted-foreground hover:text-foreground underline"
              >
                reset
              </button>
            )}
          </div>
          {recipe.cuisineType && (
            <div className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs">
              <ChefHat className="h-3 w-3" aria-hidden="true" />
              <span>{recipe.cuisineType}</span>
            </div>
          )}
        </div>

        {baseServings === null && recipe.servings && (
          <p className="text-sm text-muted-foreground">
            Original yield: {recipe.servings}
          </p>
        )}
        {projection.warnings.map((warning) => (
          <p
            key={warning}
            role="status"
            className="text-sm text-muted-foreground"
          >
            {warning}
          </p>
        ))}

        {/* Action buttons */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => setScheduleOpen(true)}
          >
            <CalendarPlus className="mr-1 h-4 w-4" aria-hidden="true" />
            Schedule
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => setMealPrepOpen(true)}
          >
            <Copy className="mr-1 h-4 w-4" aria-hidden="true" />
            Meal Prep
          </Button>
          {onCook && (
            <Button className="flex-1" onClick={() => onCook(scalingRatio)}>
              <Flame className="mr-1 h-4 w-4" aria-hidden="true" />
              Cook
            </Button>
          )}
        </div>

        {/* Notes */}
        {recipe.notes && (
          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-sm italic text-muted-foreground">
              {recipe.notes}
            </p>
          </div>
        )}

        {/* Tags & Groups (side-by-side toggles, pickers expand below) */}
        <div>
          <div className="flex gap-3">
            <button
              type="button"
              className="flex items-center gap-2 py-1"
              onClick={() => {
                setTagsOpen((o) => !o);
                setGroupsOpen(false);
              }}
              aria-expanded={tagsOpen}
            >
              <Tag
                className="h-3.5 w-3.5 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="text-sm font-medium text-muted-foreground">
                Tags
              </span>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${tagsOpen ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
            </button>
            {recipeGroups.length > 0 && (
              <button
                type="button"
                className="flex items-center gap-2 py-1"
                onClick={() => {
                  setGroupsOpen((o) => !o);
                  setTagsOpen(false);
                }}
                aria-expanded={groupsOpen}
              >
                <FolderOpen
                  className="h-3.5 w-3.5 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="text-sm font-medium text-muted-foreground">
                  Groups
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform ${groupsOpen ? "rotate-180" : ""}`}
                  aria-hidden="true"
                />
              </button>
            )}
          </div>
          {/* Collapsed tag/group badges */}
          {(!tagsOpen || !groupsOpen) && (
            <div className="flex flex-wrap gap-1 mt-1">
              {!tagsOpen &&
                recipe.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              {!groupsOpen &&
                recipeGroups
                  .filter((g) => (groupMembers[g.id] ?? []).includes(recipe.id))
                  .map((g) => (
                    <Badge key={g.id} variant="secondary" className="text-xs">
                      {g.name}
                    </Badge>
                  ))}
            </div>
          )}
          {tagsOpen && (
            <div className="mt-2">
              <TagPicker
                selected={recipe.tags}
                onChange={(tags) => {
                  void updateTags(recipe.id, tags).catch(() =>
                    toast.error("Failed to update tags"),
                  );
                }}
              />
            </div>
          )}
          {groupsOpen && (
            <div className="mt-2">
              <GroupPicker
                recipeId={recipe.id}
                groups={recipeGroups}
                groupMembers={groupMembers}
                onToggle={(groupId, recipeId, isMember) => {
                  const run = isMember
                    ? removeRecipeFromGroup(groupId, recipeId)
                    : addRecipeToGroup(groupId, recipeId);
                  void run.catch(() => toast.error("Failed to update groups"));
                }}
                onCreateGroup={(name) => {
                  void (async () => {
                    try {
                      const groupId = await createGroup(name);
                      await addRecipeToGroup(groupId, recipe.id);
                    } catch {
                      toast.error("Failed to create group");
                    }
                  })();
                }}
              />
            </div>
          )}
        </div>

        {/* Ingredients */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-baseline gap-2">
              <h2 className="text-lg font-semibold">Ingredients</h2>
              {isScaled && (
                <span className="text-xs text-muted-foreground">
                  ({servingLabel(recipe.servings, scalingRatio)})
                </span>
              )}
            </div>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                onClick={() => {
                  const items = projection.ingredients;
                  void addIngredientsToShoppingList(items, shoppingList).then(
                    () => toast.success("Ingredients added to shopping list"),
                    () =>
                      toast.error("Failed to add ingredients to shopping list"),
                  );
                }}
              >
                <ShoppingCart className="mr-1 h-3 w-3" aria-hidden="true" />
                Add to list
              </Button>
              {hasChecked && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground"
                  onClick={() => {
                    void clearCheckedIngredients(recipe.id).catch(() =>
                      toast.error("Failed to reset checked ingredients"),
                    );
                  }}
                >
                  <RotateCcw className="mr-1 h-3 w-3" aria-hidden="true" />
                  Reset
                </Button>
              )}
            </div>
          </div>
          <Tabs
            value={ingredientView}
            onValueChange={(v) =>
              setIngredientView(v as "category" | "original")
            }
            className="mb-3"
          >
            <TabsList className="h-7">
              <TabsTrigger value="original" className="text-xs px-2.5 h-6">
                As Written
              </TabsTrigger>
              <TabsTrigger value="category" className="text-xs px-2.5 h-6">
                By Category
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {ingredientView === "category" ? (
            <div className="space-y-4">
              {ingredientGroups.map((group) => (
                <div key={group.category}>
                  <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {group.category}
                  </h3>
                  <ul className="space-y-0.5" role="list">
                    {group.items.map(({ originalIndex }) => {
                      const isChecked = checked.includes(originalIndex);
                      return (
                        <li
                          key={originalIndex}
                          role="checkbox"
                          tabIndex={0}
                          aria-checked={isChecked}
                          className="flex items-center gap-3 rounded-md px-1 py-0.5 transition-colors hover:bg-accent/50 cursor-pointer"
                          onClick={() => toggleChecked(originalIndex)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              toggleChecked(originalIndex);
                            }
                          }}
                        >
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={() => toggleChecked(originalIndex)}
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
                            {projection.ingredients[originalIndex]}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-0.5">
              {projection.ingredients.map((raw, i) => {
                if (raw.startsWith("## ")) {
                  return (
                    <h3
                      key={i}
                      className="mb-1 mt-3 first:mt-0 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                    >
                      {raw.slice(3).replace(/:$/, "")}
                    </h3>
                  );
                }
                const isChecked = checked.includes(i);
                return (
                  <div
                    key={i}
                    role="checkbox"
                    tabIndex={0}
                    aria-checked={isChecked}
                    className="flex items-center gap-3 rounded-md px-1 py-0.5 transition-colors hover:bg-accent/50 cursor-pointer"
                    onClick={() => toggleChecked(i)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleChecked(i);
                      }
                    }}
                  >
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={() => toggleChecked(i)}
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0"
                      tabIndex={-1}
                      aria-hidden="true"
                    />
                    <span
                      className={`text-sm leading-relaxed ${
                        isChecked ? "text-muted-foreground line-through" : ""
                      }`}
                    >
                      {raw}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Instructions */}
        <div>
          <h2 className="mb-3 text-lg font-semibold">Instructions</h2>
          <ol className="space-y-4">
            {projection.instructions.map((step, i) => {
              const isDone = completedSteps.has(i);
              return (
                <li
                  key={i}
                  role="button"
                  tabIndex={0}
                  className="flex gap-3 text-sm leading-relaxed cursor-pointer"
                  onClick={() =>
                    setCompletedSteps((prev) => {
                      const next = new Set(prev);
                      if (next.has(i)) next.delete(i);
                      else next.add(i);
                      return next;
                    })
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setCompletedSteps((prev) => {
                        const next = new Set(prev);
                        if (next.has(i)) next.delete(i);
                        else next.add(i);
                        return next;
                      });
                    }
                  }}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                      isDone
                        ? "bg-muted text-muted-foreground line-through"
                        : "bg-primary text-primary-foreground"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <p
                    className={`pt-0.5 transition-colors ${
                      isDone ? "text-muted-foreground line-through" : ""
                    }`}
                  >
                    {highlightIngredients(step.text, step.highlights)}
                  </p>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Actions */}
        <div className="flex justify-end border-t pt-4">
          <div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this recipe?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently remove the recipe and cannot be
                    undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={onDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>

      {/* Meal prep sheet — only mount when open */}
      {mealPrepOpen && (
        <MealPrepSheet
          recipe={recipe}
          open={mealPrepOpen}
          onOpenChange={setMealPrepOpen}
          servings={currentServings || undefined}
        />
      )}

      {/* Schedule picker sheet — only mount when open */}
      {scheduleOpen && (
        <SchedulePickerSheet
          recipe={recipe}
          open={scheduleOpen}
          onOpenChange={setScheduleOpen}
        />
      )}
    </article>
  );
}
