"use client";

import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useRecipeStore } from "@/stores/recipe-store";
import type { MealSlot } from "@/types";

const SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner"];
const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getWeekDates(offset: number): string[] {
  const now = new Date();
  const dayOfWeek = now.getDay();
  // Monday as start of week (0=Mon for our purposes)
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset + offset * 7);

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d.toISOString().split("T")[0];
  });
}

function formatWeekRange(dates: string[]): string {
  const start = new Date(dates[0] + "T00:00:00");
  const end = new Date(dates[6] + "T00:00:00");
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${start.toLocaleDateString("en-US", opts)} – ${end.toLocaleDateString("en-US", opts)}`;
}

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
      <h1 className="text-2xl font-bold">Meal Plan</h1>

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
                    className="flex items-center gap-2 rounded-md border border-dashed p-2 text-xs cursor-pointer hover:bg-accent/50 transition-colors"
                    onClick={() => setPicker({ date, slot })}
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
