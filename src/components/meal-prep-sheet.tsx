"use client";

/**
 * MealPrepSheet — bulk assign a recipe to multiple day+slot combos.
 *
 * The earliest selected slot is marked as fresh; the rest are auto-flagged
 * as leftovers so the shopping list only counts ingredients once.
 *
 * Reused from recipe-card.tsx, recipe-detail.tsx, and meal-plan/page.tsx.
 */

import { useState, useMemo, useEffect, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  RotateCcw,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { toast } from "sonner";
import { useRecipeStore } from "@/stores/recipe-store";
import {
  getWeekDates,
  formatWeekRange,
  getWeekOffsetForDate,
} from "@/lib/utils";
import { SLOTS, SLOT_LABELS, DAY_LABELS } from "@/lib/constants";
import { parseServings } from "@/lib/ingredient-parser";
import type { Recipe } from "@/types";

interface MealPrepSheetProps {
  recipe: Recipe;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Override the max number of slots. Falls back to recipe.servings when omitted. */
  servings?: number;
}

export function MealPrepSheet({
  recipe,
  open,
  onOpenChange,
  servings,
}: MealPrepSheetProps) {
  const assignMeal = useRecipeStore((s) => s.assignMeal);
  const mealPlan = useRecipeStore((s) => s.mealPlan);
  const recipes = useRecipeStore((s) => s.recipes);
  const fetchMealPlanForWeek = useRecipeStore((s) => s.fetchMealPlanForWeek);

  const maxSlots = servings ?? parseServings(recipe.servings) ?? null;

  const [weekOffset, setWeekOffset] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [popoverOpen, setPopoverOpen] = useState(false);

  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);

  // Fetch meal plan data when the sheet opens or the week changes
  useEffect(() => {
    if (open && weekDates.length === 7) {
      fetchMealPlanForWeek(weekDates[0], weekDates[6]);
    }
  }, [open, weekDates, fetchMealPlanForWeek]);

  // Pre-select slots that already have this recipe, and reset on open/close
  useEffect(() => {
    if (open) {
      const preSelected = new Set<string>();
      for (const date of weekDates) {
        const day = mealPlan[date];
        if (!day) continue;
        for (const slot of SLOTS) {
          if (day[slot] === recipe.id) {
            preSelected.add(`${date}_${slot}`);
          }
        }
      }
      setSelected(preSelected);
    } else {
      setSelected(new Set());
      setWeekOffset(0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- Intentionally only runs on open/close.
  // When the sheet opens, pre-select slots with this recipe and reset on close.
  // Navigating weeks is handled by the user's manual toggle interactions.
  }, [open]);

  /** Jump to the week containing the selected calendar date. */
  const handleDateSelect = useCallback(
    (date: Date | undefined) => {
      if (!date) return;
      setWeekOffset(getWeekOffsetForDate(date));
      setPopoverOpen(false);
    },
    [],
  );

  /** Toggle a slot in the selection set, respecting the servings cap. */
  const toggleSlot = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        if (maxSlots !== null && next.size >= maxSlots) return prev;
        next.add(key);
      }
      return next;
    });
  }, [maxSlots]);

  /** Assign the recipe to all selected slots. Earliest = fresh, rest = leftover. */
  const handleConfirm = useCallback(() => {
    if (selected.size === 0) return;

    // Sort selected keys chronologically so the earliest date+slot is first
    const sorted = Array.from(selected).sort();

    for (let i = 0; i < sorted.length; i++) {
      const [date, slot] = sorted[i].split("_") as [string, string];
      // Skip if this slot already has this recipe (no-op)
      if (mealPlan[date]?.[slot as keyof typeof SLOT_LABELS] === recipe.id) continue;
      const isLeftover = i > 0;
      assignMeal(date, slot as "breakfast" | "lunch" | "dinner" | "snack", recipe.id, isLeftover);
    }

    onOpenChange(false);
    toast.success(`Added "${recipe.title}" to ${sorted.length} slot${sorted.length > 1 ? "s" : ""}`);
  }, [selected, mealPlan, recipe, assignMeal, onOpenChange]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="flex h-[100dvh] flex-col">
        <SheetHeader>
          <SheetTitle className="text-left">Meal Prep</SheetTitle>
          <p className="text-sm text-muted-foreground text-left line-clamp-1">
            {recipe.title}
            {maxSlots !== null && (
              <span className="ml-1.5 text-xs">
                ({selected.size}/{maxSlots} servings)
              </span>
            )}
          </p>

          {/* Week navigation */}
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
                  <Calendar mode="single" onSelect={handleDateSelect} />
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

        {/* Week grid */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
          {weekDates.map((date, dayIdx) => {
            const dateLabel = new Date(date + "T00:00:00").toLocaleDateString(
              "en-US",
              { month: "short", day: "numeric" },
            );
            return (
              <div key={date}>
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-sm font-semibold">
                    {DAY_LABELS[dayIdx]}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {dateLabel}
                  </span>
                </div>
                <div className="flex gap-2">
                  {SLOTS.map((slot) => {
                    const key = `${date}_${slot}`;
                    const isSelected = selected.has(key);
                    const existingId = mealPlan[date]?.[slot];
                    const isCurrentRecipe = existingId === recipe.id;
                    const existingTitle =
                      existingId && !isCurrentRecipe
                        ? recipes.find((r) => r.id === existingId)?.title
                        : null;

                    const atCapacity =
                      maxSlots !== null && selected.size >= maxSlots && !isSelected;

                    return (
                      <button
                        key={slot}
                        disabled={atCapacity}
                        aria-label={`${SLOT_LABELS[slot]} on ${DAY_LABELS[dayIdx]}`}
                        aria-pressed={isSelected}
                        className={`flex-1 rounded-md border p-2 text-xs transition-colors ${
                          isSelected
                            ? "border-primary bg-primary/10 text-primary font-medium"
                            : atCapacity
                              ? "border-muted bg-muted/30 text-muted-foreground/40 cursor-not-allowed"
                              : existingTitle
                                ? "border-muted bg-muted/50 text-muted-foreground"
                                : "border-dashed hover:bg-accent/50"
                        }`}
                        onClick={() => toggleSlot(key)}
                      >
                        <div className="flex items-center justify-center gap-1 font-medium">
                          {SLOT_LABELS[slot]}
                          {isSelected && (
                            <Check className="h-3 w-3" />
                          )}
                        </div>
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

        {/* Sticky footer */}
        <div className="sticky bottom-0 border-t bg-background px-4 py-3">
          <Button
            className="w-full"
            disabled={selected.size === 0}
            onClick={handleConfirm}
          >
            Add to {selected.size}{maxSlots !== null ? `/${maxSlots}` : ""} slot{selected.size !== 1 ? "s" : ""}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
