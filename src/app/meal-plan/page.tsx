"use client";

import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useRecipeStore } from "@/stores/recipe-store";
import { getWeekDates, formatWeekRange } from "@/lib/utils";
import { SLOT_LABELS, DAY_LABELS } from "@/lib/constants";
import type { MealSlot } from "@/types";

const SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner"];

export default function MealPlanPage() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [picker, setPicker] = useState<{
    date: string;
    slot: MealSlot;
  } | null>(null);

  const recipes = useRecipeStore((s) => s.recipes);
  const mealPlan = useRecipeStore((s) => s.mealPlan);
  const assignMeal = useRecipeStore((s) => s.assignMeal);

  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);

  const getRecipeTitle = (recipeId?: string) => {
    if (!recipeId) return null;
    return recipes.find((r) => r.id === recipeId)?.title || null;
  };

  return (
    <div className="space-y-4 p-4 pt-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Meal Plan</h1>
        <ThemeToggle />
      </div>

      {/* Week navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setWeekOffset((w) => w - 1)}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <span className="text-sm font-medium">
          {formatWeekRange(weekDates)}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setWeekOffset((w) => w + 1)}
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Grid */}
      <div className="space-y-2">
        {weekDates.map((date, dayIdx) => (
          <Card key={date} className="p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold">{DAY_LABELS[dayIdx]}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(date + "T00:00:00").toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
            <div className="space-y-1.5">
              {SLOTS.map((slot) => {
                const recipeId = mealPlan[date]?.[slot];
                const title = getRecipeTitle(recipeId);
                return (
                  <div
                    key={slot}
                    role="button"
                    tabIndex={0}
                    aria-label={`Add ${SLOT_LABELS[slot].toLowerCase()} for ${DAY_LABELS[dayIdx]}`}
                    className="flex items-center gap-2 rounded-md border border-dashed p-2 text-xs cursor-pointer hover:bg-accent/50 transition-colors"
                    onClick={() => setPicker({ date, slot })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setPicker({ date, slot });
                      }
                    }}
                  >
                    <span className="w-16 shrink-0 text-muted-foreground">
                      {SLOT_LABELS[slot]}
                    </span>
                    {title ? (
                      <span className="flex-1 truncate font-medium">
                        {title}
                      </span>
                    ) : (
                      <span className="flex-1 text-muted-foreground/50">
                        + Add
                      </span>
                    )}
                    {recipeId && (
                      <button
                        aria-label="Remove meal"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          assignMeal(date, slot, undefined);
                        }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </div>

      {/* Recipe picker dialog */}
      <Dialog open={!!picker} onOpenChange={() => setPicker(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Choose a recipe</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-80">
            <div className="space-y-1 pr-4">
              {recipes.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No saved recipes. Add some from the home page!
                </p>
              ) : (
                recipes.map((recipe) => (
                  <button
                    key={recipe.id}
                    className="w-full rounded-md p-2 text-left text-sm hover:bg-accent transition-colors"
                    onClick={() => {
                      if (picker) {
                        assignMeal(picker.date, picker.slot, recipe.id);
                      }
                      setPicker(null);
                    }}
                  >
                    {recipe.title}
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
