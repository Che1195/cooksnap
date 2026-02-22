"use client";

import { useState, useMemo, useEffect } from "react";
import { ChevronLeft, ChevronRight, X, Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useRecipeStore } from "@/stores/recipe-store";
import { useAuth } from "@/components/auth-provider";
import { getWeekDates, formatWeekRange } from "@/lib/utils";
import { SLOT_LABELS, DAY_LABELS } from "@/lib/constants";
import { toast } from "sonner";
import type { MealSlot } from "@/types";

const SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner"];

export default function MealPlanPage() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [pickerSearch, setPickerSearch] = useState("");
  const [picker, setPicker] = useState<{
    date: string;
    slot: MealSlot;
  } | null>(null);

  const { user } = useAuth();
  const recipes = useRecipeStore((s) => s.recipes);
  const mealPlan = useRecipeStore((s) => s.mealPlan);
  const assignMeal = useRecipeStore((s) => s.assignMeal);
  const isLoading = useRecipeStore((s) => s.isLoading);
  const error = useRecipeStore((s) => s.error);
  const hydrate = useRecipeStore((s) => s.hydrate);

  useEffect(() => {
    if (user && recipes.length === 0 && !isLoading) {
      hydrate();
    }
  }, [user, recipes.length, isLoading, hydrate]);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);

  const filteredRecipes = useMemo(() => {
    if (!pickerSearch.trim()) return recipes;
    const q = pickerSearch.toLowerCase();
    return recipes.filter((r) => r.title.toLowerCase().includes(q));
  }, [recipes, pickerSearch]);

  const getRecipeTitle = (recipeId?: string) => {
    if (!recipeId) return null;
    return recipes.find((r) => r.id === recipeId)?.title || null;
  };

  return (
    <div className="space-y-4 p-4 pt-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Meal Plan</h1>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">Loading meal plan...</p>
        </div>
      ) : (
        <>
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

          {/* Recipe picker sheet */}
          <Sheet open={!!picker} onOpenChange={(open) => { if (!open) { setPicker(null); setPickerSearch(""); } }}>
            <SheetContent side="bottom" className="h-[60vh]">
              <SheetHeader>
                <SheetTitle>Choose a recipe</SheetTitle>
              </SheetHeader>
              {recipes.length > 0 && (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search recipes..."
                    value={pickerSearch}
                    onChange={(e) => setPickerSearch(e.target.value)}
                    className="pl-9"
                    autoFocus
                  />
                </div>
              )}
              <ScrollArea className="flex-1">
                <div className="space-y-1 pr-4">
                  {recipes.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      No saved recipes. Add some from the home page!
                    </p>
                  ) : filteredRecipes.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      No recipes match &ldquo;{pickerSearch}&rdquo;
                    </p>
                  ) : (
                    filteredRecipes.map((recipe) => (
                      <button
                        key={recipe.id}
                        className="w-full rounded-md p-2 text-left text-sm hover:bg-accent transition-colors"
                        onClick={() => {
                          if (picker) {
                            assignMeal(picker.date, picker.slot, recipe.id);
                          }
                          setPicker(null);
                          setPickerSearch("");
                        }}
                      >
                        {recipe.title}
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>
            </SheetContent>
          </Sheet>
        </>
      )}
    </div>
  );
}
