"use client";

/**
 * MealPrepSheet — bulk assign a recipe to multiple day+slot combos.
 *
 * The earliest selected slot is marked as fresh; the rest are auto-flagged
 * as leftovers so the shopping list only counts ingredients once.
 *
 * Reused from recipe-card.tsx, recipe-detail.tsx, and meal-plan/page.tsx.
 */

import { useState, useMemo, useCallback } from "react";
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
import { useMealPlan, useMealPlanActions } from "@/lib/convex/use-meal-plan";
import { useRecipes } from "@/lib/convex/use-recipes";
import {
  getWeekDates,
  formatWeekRange,
  getWeekOffsetForDate,
} from "@/lib/utils";
import { SLOTS, SLOT_LABELS, DAY_LABELS } from "@/lib/constants";
import { parseServings } from "@/lib/ingredient-parser";
import type { MealPlan, MealSlot, Recipe } from "@/types";

const EMPTY_PLAN: MealPlan = {};

/** Slot keys (`date_slot`) in `weekDates` that already hold `recipeId`. */
function preSelectedSlots(weekDates: string[], plan: MealPlan, recipeId: string): Set<string> {
  const out = new Set<string>();
  for (const date of weekDates) {
    const day = plan[date];
    if (!day) continue;
    for (const slot of SLOTS) {
      if (day[slot].some((e) => e.recipeId === recipeId)) out.add(`${date}_${slot}`);
    }
  }
  return out;
}

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
  const { assignMeal } = useMealPlanActions();
  const recipes = useRecipes() ?? [];

  const maxSlots = servings ?? parseServings(recipe.servings) ?? null;

  const [weekOffset, setWeekOffset] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [popoverOpen, setPopoverOpen] = useState(false);

  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);

  const livePlan = useMealPlan(weekDates[0], weekDates[6]);
  const mealPlan = livePlan ?? EMPTY_PLAN;

  // Seed the selection from the plan the first time it loads for an open sheet,
  // and clear it on close. Done during render rather than in an effect: the
  // plan arrives asynchronously, so an effect would paint an empty grid first
  // (and would trip react-hooks/set-state-in-effect). Afterwards the selection
  // is the user's alone, so navigating weeks keeps what they picked.
  const [seeded, setSeeded] = useState(false);
  if (open && !seeded && livePlan !== undefined) {
    setSeeded(true);
    setSelected(preSelectedSlots(weekDates, livePlan, recipe.id));
  } else if (!open && seeded) {
    setSeeded(false);
    setSelected(new Set());
    setWeekOffset(0);
  }

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
  const handleConfirm = useCallback(async () => {
    if (selected.size === 0) return;

    // Sort selected keys chronologically so the earliest date+slot is first
    const sorted = Array.from(selected).sort();

    try {
      for (let i = 0; i < sorted.length; i++) {
        const [date, slot] = sorted[i].split("_") as [string, MealSlot];
        // Skip if this slot already has this recipe (no-op)
        if ((mealPlan[date]?.[slot] ?? []).some((e) => e.recipeId === recipe.id)) continue;
        const isLeftover = i > 0;
        await assignMeal(date, slot, recipe.id, isLeftover);
      }
    } catch {
      toast.error("Failed to add to meal plan");
      return;
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
                    const entries = mealPlan[date]?.[slot] ?? [];
                    const otherTitles = entries
                      .filter((e) => e.recipeId !== recipe.id)
                      .map((e) => recipes.find((r) => r.id === e.recipeId)?.title)
                      .filter(Boolean);
                    const existingTitle = otherTitles.length > 0 ? otherTitles.join(", ") : null;

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
            onClick={() => void handleConfirm()}
          >
            Add to {selected.size}{maxSlots !== null ? `/${maxSlots}` : ""} slot{selected.size !== 1 ? "s" : ""}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
