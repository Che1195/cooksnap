"use client";

import { useState, useMemo, useEffect } from "react";
import Image from "next/image";
import { ExternalLink, Trash2, RotateCcw, Clock, Users, ChefHat, Minus, Plus, CalendarPlus, CalendarDays, ChevronLeft, ChevronRight, ChevronDown, Tag, Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useRecipeStore } from "@/stores/recipe-store";
import { TagPicker } from "@/components/tag-picker";
import { formatDuration, getWeekDates, formatWeekRange, getWeekOffsetForDate } from "@/lib/utils";
import { scaleIngredient, parseServings } from "@/lib/ingredient-parser";
import { groupIngredientsByCategory } from "@/lib/ingredient-categorizer";
import { SLOT_LABELS, DAY_LABELS, SLOTS } from "@/lib/constants";
import type { Recipe } from "@/types";

interface RecipeDetailProps {
  recipe: Recipe;
  onDelete?: () => void;
  onCook?: () => void;
}

export function RecipeDetail({ recipe, onDelete, onCook }: RecipeDetailProps) {
  const updateTags = useRecipeStore((s) => s.updateTags);
  const checkedIngredients = useRecipeStore((s) => s.checkedIngredients);
  const toggleIngredient = useRecipeStore((s) => s.toggleIngredient);
  const clearCheckedIngredients = useRecipeStore((s) => s.clearCheckedIngredients);
  const assignMeal = useRecipeStore((s) => s.assignMeal);
  const mealPlan = useRecipeStore((s) => s.mealPlan);
  const recipes = useRecipeStore((s) => s.recipes);
  const fetchMealPlanForWeek = useRecipeStore((s) => s.fetchMealPlanForWeek);

  const [tagsOpen, setTagsOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);

  /** Jump to the week containing the selected date. */
  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;
    setWeekOffset(getWeekOffsetForDate(date));
    setPopoverOpen(false);
  };

  // Lazy-load meal plan data when the schedule sheet opens
  useEffect(() => {
    if (scheduleOpen && weekDates.length === 7) {
      fetchMealPlanForWeek(weekDates[0], weekDates[6]);
    }
  }, [scheduleOpen, weekDates, fetchMealPlanForWeek]);

  const checked = checkedIngredients[recipe.id] || [];
  const hasChecked = checked.length > 0;

  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

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
          {onCook && (
            <Button className="flex-1" onClick={onCook}>
              <Flame className="mr-1 h-4 w-4" aria-hidden="true" />
              Cook
            </Button>
          )}
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

        {/* Tags (collapsible) */}
        <div>
          <button
            type="button"
            className="flex w-full items-center gap-2 py-1"
            onClick={() => setTagsOpen((o) => !o)}
          >
            <Tag className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            <span className="text-sm font-medium text-muted-foreground">Tags</span>
            {!tagsOpen && recipe.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {recipe.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
            <ChevronDown
              className={`ml-auto h-4 w-4 text-muted-foreground transition-transform ${tagsOpen ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </button>
          {tagsOpen && (
            <div className="mt-2">
              <TagPicker
                selected={recipe.tags}
                onChange={(tags) => updateTags(recipe.id, tags)}
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
                <ul className="space-y-0.5" role="list">
                  {group.items.map(({ originalIndex, raw, parsed }) => {
                    const isChecked = checked.includes(originalIndex);
                    return (
                      <li
                        key={originalIndex}
                        role="button"
                        tabIndex={0}
                        aria-checked={isChecked}
                        className="flex items-center gap-3 rounded-md px-1 py-0.5 transition-colors hover:bg-accent/50 cursor-pointer"
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
            {recipe.instructions.map((step, i) => {
              const isDone = completedSteps.has(i);
              return (
                <li
                  key={i}
                  className="flex gap-3 text-sm leading-relaxed cursor-pointer"
                  onClick={() =>
                    setCompletedSteps((prev) => {
                      const next = new Set(prev);
                      if (next.has(i)) next.delete(i);
                      else next.add(i);
                      return next;
                    })
                  }
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
                    {step}
                  </p>
                </li>
              );
            })}
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

      {/* Schedule picker sheet */}
      <Sheet open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <SheetContent side="bottom" className="max-h-[70vh]">
          <SheetHeader>
            <SheetTitle>Add to Schedule</SheetTitle>
            <div className="flex items-center justify-between pt-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setWeekOffset((w) => w - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium">
                {formatWeekRange(weekDates)}
              </span>
              <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <CalendarDays className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="center">
                  <Calendar
                    mode="single"
                    selected={new Date(weekDates[0] + "T00:00:00")}
                    onSelect={handleDateSelect}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setWeekOffset((w) => w + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            {weekOffset !== 0 && (
              <Button
                variant="outline"
                size="sm"
                className="self-center"
                onClick={() => setWeekOffset(0)}
              >
                <RotateCcw className="h-3 w-3" />
                This week
              </Button>
            )}
          </SheetHeader>
          <div className="overflow-y-auto px-4 pb-4 space-y-3">
            {weekDates.map((date, dayIdx) => {
              const dateLabel = new Date(date + "T00:00:00").toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              });
              return (
                <div key={date}>
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-sm font-semibold">{DAY_LABELS[dayIdx]}</span>
                    <span className="text-xs text-muted-foreground">{dateLabel}</span>
                  </div>
                  <div className="flex gap-2">
                    {SLOTS.map((slot) => {
                      const existingId = mealPlan[date]?.[slot];
                      const existingTitle = existingId
                        ? recipes.find((r) => r.id === existingId)?.title
                        : null;
                      const isCurrentRecipe = existingId === recipe.id;
                      return (
                        <button
                          key={slot}
                          className={`flex-1 rounded-md border p-2 text-xs transition-colors ${
                            isCurrentRecipe
                              ? "border-primary bg-primary/10 text-primary font-medium"
                              : existingTitle
                                ? "border-muted bg-muted/50 text-muted-foreground"
                                : "border-dashed hover:bg-accent/50"
                          }`}
                          onClick={() => {
                            assignMeal(date, slot, recipe.id);
                            setScheduleOpen(false);
                          }}
                        >
                          <div className="font-medium">{SLOT_LABELS[slot]}</div>
                          {existingTitle && (
                            <div className="mt-0.5 truncate text-[10px] opacity-70">
                              {existingTitle}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </article>
  );
}
