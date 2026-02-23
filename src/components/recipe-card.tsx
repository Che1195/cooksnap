"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Clock, Users, CalendarPlus, CalendarDays, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { formatDuration, getWeekDates, formatWeekRange, getWeekOffsetForDate } from "@/lib/utils";
import { useRecipeStore } from "@/stores/recipe-store";
import { SLOT_LABELS, DAY_LABELS, SLOTS } from "@/lib/constants";
import type { Recipe } from "@/types";

interface RecipeCardProps {
  recipe: Recipe;
}

/**
 * Compact recipe card for grid views. Shows image, truncated title (max 2 lines),
 * metadata, tags, and a quick "add to plan" button overlaid on the image.
 */
export function RecipeCard({ recipe }: RecipeCardProps) {
  const assignMeal = useRecipeStore((s) => s.assignMeal);
  const mealPlan = useRecipeStore((s) => s.mealPlan);
  const recipes = useRecipeStore((s) => s.recipes);
  const fetchMealPlanForWeek = useRecipeStore((s) => s.fetchMealPlanForWeek);

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);

  // Fetch meal plan data when the schedule sheet opens
  useEffect(() => {
    if (scheduleOpen && weekDates.length === 7) {
      fetchMealPlanForWeek(weekDates[0], weekDates[6]);
    }
  }, [scheduleOpen, weekDates, fetchMealPlanForWeek]);

  /** Jump to the week containing the selected calendar date. */
  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;
    setWeekOffset(getWeekOffsetForDate(date));
    setPopoverOpen(false);
  };

  const timeDisplay = formatDuration(recipe.totalTime) ??
    formatDuration(recipe.cookTime) ??
    formatDuration(recipe.prepTime);

  return (
    <>
      <Link href={`/recipes/${recipe.id}`} aria-label={`View recipe: ${recipe.title}`}>
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
          {/* Quick add-to-plan button — bottom-right corner of card */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setScheduleOpen(true);
            }}
            className="absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-all hover:bg-primary/90 hover:scale-110 active:scale-95"
            aria-label={`Add ${recipe.title} to meal plan`}
          >
            <CalendarPlus className="h-4 w-4" />
          </button>
          <CardContent className="px-2 py-1.5">
            <h3 className="line-clamp-2 text-xs font-medium leading-snug">
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
            {recipe.tags.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-0.5">
                {recipe.tags.slice(0, 3).map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </Link>

      {/* Schedule picker sheet — rendered outside the Link to avoid nesting issues */}
      <Sheet open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <SheetContent side="bottom" className="max-h-[70vh]">
          <SheetHeader>
            <SheetTitle className="text-left">Add to Schedule</SheetTitle>
            <p className="text-sm text-muted-foreground text-left line-clamp-1">{recipe.title}</p>
            <div className="flex items-center justify-between pt-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setWeekOffset((w) => w - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="flex items-center gap-1 text-sm font-medium">
                {formatWeekRange(weekDates)}
                <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                      <CalendarDays className="h-3.5 w-3.5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="center">
                    <Calendar mode="single" onSelect={handleDateSelect} />
                  </PopoverContent>
                </Popover>
              </span>
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
    </>
  );
}
