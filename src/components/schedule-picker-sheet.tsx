/**
 * Shared schedule picker sheet for assigning a recipe to a meal plan slot.
 *
 * Renders a full-screen bottom sheet with week navigation, a calendar popover
 * for jumping to arbitrary weeks, and a day/slot grid showing existing
 * assignments. Tapping a slot assigns the recipe and closes the sheet.
 *
 * Used by both RecipeDetail and RecipeCard to avoid ~120 lines of duplication.
 */
"use client";

import { useState, useMemo, useEffect } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, CalendarDays, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useRecipeStore } from "@/stores/recipe-store";
import { getWeekDates, formatWeekRange, getWeekOffsetForDate } from "@/lib/utils";
import { SLOT_LABELS, DAY_LABELS, SLOTS } from "@/lib/constants";
import type { Recipe } from "@/types";

interface SchedulePickerSheetProps {
  /** The recipe to assign to a meal plan slot. */
  recipe: Recipe;
  /** Whether the sheet is open. */
  open: boolean;
  /** Callback when the sheet open state changes (e.g. user closes it). */
  onOpenChange: (open: boolean) => void;
}

/**
 * Full-screen bottom sheet that lets the user pick a day + meal slot to
 * schedule a recipe. Manages its own week navigation and calendar state.
 */
export function SchedulePickerSheet({ recipe, open, onOpenChange }: SchedulePickerSheetProps) {
  const assignMeal = useRecipeStore((s) => s.assignMeal);
  const mealPlan = useRecipeStore((s) => s.mealPlan);
  const recipes = useRecipeStore((s) => s.recipes);
  const fetchMealPlanForWeek = useRecipeStore((s) => s.fetchMealPlanForWeek);

  const [weekOffset, setWeekOffset] = useState(0);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);

  /** Jump to the week containing the selected date. */
  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;
    setWeekOffset(getWeekOffsetForDate(date));
    setPopoverOpen(false);
  };

  // Lazy-load meal plan data when the sheet opens or the week changes
  useEffect(() => {
    if (open && weekDates.length === 7) {
      fetchMealPlanForWeek(weekDates[0], weekDates[6]);
    }
  }, [open, weekDates, fetchMealPlanForWeek]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[100dvh]">
        <SheetHeader>
          <SheetTitle className="text-left">Add to Schedule</SheetTitle>
          <div className="flex items-center gap-2 text-left">
            {recipe.image && (
              <Image
                src={recipe.image}
                alt={recipe.title}
                width={28}
                height={28}
                className="rounded object-cover shrink-0"
                style={{ width: 28, height: 28 }}
              />
            )}
            <span className="text-sm text-muted-foreground line-clamp-1">{recipe.title}</span>
          </div>
          <div className="flex items-center justify-between pt-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Previous week"
              onClick={() => setWeekOffset((w) => w - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="flex items-center gap-1 text-sm font-medium">
              {formatWeekRange(weekDates)}
              <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Open calendar">
                    <CalendarDays className="h-3.5 w-3.5" />
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
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Next week"
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
                  <span className="text-sm font-bold text-primary">{DAY_LABELS[dayIdx]}</span>
                  <span className="text-xs font-medium text-muted-foreground">{dateLabel}</span>
                </div>
                <div className="space-y-1">
                  {SLOTS.map((slot) => {
                    const entries = mealPlan[date]?.[slot] ?? [];
                    const isCurrentRecipe = entries.some((e) => e.recipeId === recipe.id);
                    const otherRecipes = entries
                      .filter((e) => e.recipeId !== recipe.id)
                      .map((e) => recipes.find((r) => r.id === e.recipeId))
                      .filter(Boolean);
                    const firstOther = otherRecipes[0];
                    const hasOthers = otherRecipes.length > 0;
                    return (
                      <button
                        key={slot}
                        aria-label={`Add ${recipe.title} to ${DAY_LABELS[dayIdx]} ${SLOT_LABELS[slot]}`}
                        className={`flex w-full items-center gap-2 rounded-md border p-2 text-xs transition-colors ${
                          isCurrentRecipe
                            ? "border-primary bg-primary/10 text-primary font-medium"
                            : hasOthers
                              ? "border-muted bg-muted/50 text-muted-foreground"
                              : "border-dashed hover:bg-accent/50"
                        }`}
                        onClick={() => {
                          assignMeal(date, slot, recipe.id);
                          onOpenChange(false);
                        }}
                      >
                        <span className="w-14 shrink-0 text-left font-medium">{SLOT_LABELS[slot]}</span>
                        {firstOther?.image && (
                          <Image
                            src={firstOther.image}
                            alt={firstOther.title}
                            width={24}
                            height={24}
                            className="rounded object-cover shrink-0"
                            style={{ width: 24, height: 24 }}
                          />
                        )}
                        <span className="flex-1 truncate text-left opacity-70">
                          {isCurrentRecipe
                            ? recipe.title
                            : hasOthers
                              ? otherRecipes.map((r) => r!.title).join(", ")
                              : "+ Add"}
                        </span>
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
  );
}
