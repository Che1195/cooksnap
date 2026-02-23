"use client";

/**
 * Meal Plan page — weekly meal planning with drag-free slot assignment.
 *
 * Features:
 * - Week navigation with lazy-fetching of meal plan data
 * - Today indicator with quick "Today" reset button
 * - Recipe thumbnails in slots and picker
 * - Click filled slot to navigate to recipe detail; empty slot opens picker
 * - Edit (replace) and remove buttons with undo toasts
 * - Leftover indicator and toggle
 * - Shopping list generation and clear week
 * - Meal templates (save, apply, delete)
 * - Responsive: stacked cards on mobile, 7-column grid on desktop
 */

import { useState, useMemo, useEffect, useCallback, Suspense, memo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  ChevronLeft,
  ChevronRight,
  X,
  Loader2,
  Pencil,
  ShoppingCart,
  Trash2,
  UtensilsCrossed,
  MoreHorizontal,
  Copy,
  CalendarDays,
} from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { MealPrepSheet } from "@/components/meal-prep-sheet";
import { useRecipeStore } from "@/stores/recipe-store";
import { useAuth } from "@/components/auth-provider";
import { cn, getWeekDates, formatWeekRange, getTodayISO, getWeekOffsetForDate } from "@/lib/utils";
import { SLOTS, SLOT_LABELS, DAY_LABELS } from "@/lib/constants";
import { toast } from "sonner";
import type { MealSlot, Recipe, MealPlanDay } from "@/types";

/** Suspense wrapper required because useSearchParams triggers CSR bailout. */
export default function MealPlanPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[50vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <MealPlanContent />
    </Suspense>
  );
}

// ---------- SlotRow (extracted for stable identity & memo-ability) ----------

/** Props for the SlotRow component, replacing closure over parent state. */
interface SlotRowProps {
  date: string;
  slot: MealSlot;
  dayIdx: number;
  compact?: boolean;
  recipeId: string | undefined;
  recipe: Recipe | null;
  isLeftover: boolean;
  onNavigate: (path: string) => void;
  onToggleLeftover: (date: string, slot: MealSlot, recipeId: string) => void;
  onMealPrep: (recipe: Recipe) => void;
  onRemove: (date: string, slot: MealSlot, recipeId: string) => void;
}

/**
 * SlotRow renders a single meal slot (breakfast, lunch, dinner, snack)
 * for a given date. Shared between mobile card view and desktop grid.
 */
const SlotRow = memo(function SlotRow({
  date,
  slot,
  dayIdx,
  compact = false,
  recipeId,
  recipe,
  isLeftover,
  onNavigate,
  onToggleLeftover,
  onMealPrep,
  onRemove,
}: SlotRowProps) {
  return (
    <div
      role="group"
      aria-label={
        recipe
          ? `${recipe.title} for ${SLOT_LABELS[slot].toLowerCase()} on ${DAY_LABELS[dayIdx]}`
          : `Add ${SLOT_LABELS[slot].toLowerCase()} for ${DAY_LABELS[dayIdx]}`
      }
      className={cn(
        "flex items-center gap-2 rounded-md border border-dashed p-2 text-xs transition-colors",
        compact && "p-1.5",
      )}
    >
      {!compact && (
        <span className="w-14 shrink-0 text-[11px] text-muted-foreground">
          {SLOT_LABELS[slot]}
        </span>
      )}

      {recipe ? (
        <>
          {/* Clickable recipe title area */}
          <button
            className="flex flex-1 items-center gap-2 min-w-0 cursor-pointer hover:opacity-80 transition-opacity"
            aria-label={`${recipe.title} for ${SLOT_LABELS[slot].toLowerCase()} on ${DAY_LABELS[dayIdx]}`}
            onClick={() => onNavigate(`/recipes/${recipeId}`)}
          >
            {/* Thumbnail */}
            {recipe.image && (
              <Image
                src={recipe.image}
                alt={recipe.title}
                width={32}
                height={32}
                className="rounded object-cover shrink-0"
                style={{ width: 32, height: 32 }}
              />
            )}

            {/* Leftover indicator */}
            {isLeftover && (
              <UtensilsCrossed className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            )}

            <span className="flex-1 truncate font-medium text-[11px] text-left">{recipe.title}</span>
          </button>

          {/* Slot action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Toggle leftover */}
            <button
              aria-label={isLeftover ? "Unmark as leftover" : "Mark as leftover"}
              className={cn(
                "rounded p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-accent",
                isLeftover ? "text-amber-500" : "text-muted-foreground",
              )}
              onClick={() => onToggleLeftover(date, slot, recipeId!)}
            >
              <UtensilsCrossed className="h-3.5 w-3.5" />
            </button>

            {/* Meal prep */}
            <button
              aria-label="Meal prep"
              className="rounded p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent"
              onClick={() => onMealPrep(recipe)}
            >
              <Copy className="h-3.5 w-3.5" />
            </button>

            {/* Replace recipe */}
            <button
              aria-label="Replace recipe"
              className="rounded p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent"
              onClick={() => onNavigate(`/recipes?assign=${date}_${slot}`)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>

            {/* Remove recipe */}
            <button
              aria-label="Remove meal"
              className="rounded p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-accent"
              onClick={() => onRemove(date, slot, recipeId!)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </>
      ) : (
        <button
          className="flex-1 text-left text-muted-foreground/50 cursor-pointer hover:opacity-80 transition-opacity"
          aria-label={`Add ${SLOT_LABELS[slot].toLowerCase()} for ${DAY_LABELS[dayIdx]}`}
          onClick={() => onNavigate(`/recipes?assign=${date}_${slot}`)}
        >
          + Add
        </button>
      )}
    </div>
  );
});

function MealPlanContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ---------- local state ----------
  const initialWeek = useMemo(() => {
    const w = searchParams.get("week");
    return w ? parseInt(w, 10) || 0 : 0;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- read once on mount
  const [weekOffset, setWeekOffset] = useState(initialWeek);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateSheetOpen, setTemplateSheetOpen] = useState(false);
  const [mealPrepTarget, setMealPrepTarget] = useState<Recipe | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);

  // ---------- store ----------
  const { user } = useAuth();
  const recipes = useRecipeStore((s) => s.recipes);
  const mealPlan = useRecipeStore((s) => s.mealPlan);
  const mealTemplates = useRecipeStore((s) => s.mealTemplates);
  const assignMeal = useRecipeStore((s) => s.assignMeal);
  const clearWeek = useRecipeStore((s) => s.clearWeek);
  const isLoading = useRecipeStore((s) => s.isLoading);
  const hydrated = useRecipeStore((s) => s.hydrated);
  const error = useRecipeStore((s) => s.error);
  const clearError = useRecipeStore((s) => s.clearError);
  const hydrate = useRecipeStore((s) => s.hydrate);
  const fetchMealPlanForWeek = useRecipeStore((s) => s.fetchMealPlanForWeek);
  const fetchTemplates = useRecipeStore((s) => s.fetchTemplates);
  const saveWeekAsTemplate = useRecipeStore((s) => s.saveWeekAsTemplate);
  const applyTemplate = useRecipeStore((s) => s.applyTemplate);
  const deleteTemplate = useRecipeStore((s) => s.deleteTemplate);
  const generateShoppingList = useRecipeStore((s) => s.generateShoppingList);

  // ---------- derived ----------
  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
  const [todayISO, setTodayISO] = useState(() => getTodayISO());

  /** Recompute todayISO when the page becomes visible (handles midnight rollover). */
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        setTodayISO(getTodayISO());
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  /** Return the full Recipe object for a given id, or null. */
  const getRecipe = useCallback(
    (recipeId?: string): Recipe | null => {
      if (!recipeId) return null;
      return recipes.find((r) => r.id === recipeId) ?? null;
    },
    [recipes],
  );

  // ---------- effects ----------

  /** Initial hydration. */
  useEffect(() => {
    if (user && !hydrated && !isLoading) {
      hydrate();
    }
  }, [user, hydrated, isLoading, hydrate]);

  /** Fetch templates on mount. */
  useEffect(() => {
    if (user) fetchTemplates();
  }, [user, fetchTemplates]);

  /** Lazy-load meal plan data when the week changes. */
  useEffect(() => {
    if (user && weekDates.length === 7) {
      fetchMealPlanForWeek(weekDates[0], weekDates[6]);
    }
  }, [user, weekOffset, weekDates, fetchMealPlanForWeek]);

  /** Surface store errors as toasts, then clear so they don't re-fire. */
  useEffect(() => {
    if (error) {
      toast.error(error);
      clearError();
    }
  }, [error, clearError]);

  // ---------- handlers ----------

  /**
   * Remove a recipe from a slot with undo toast.
   * When the removed slot is the fresh (non-leftover) cook day, also remove
   * all subsequent leftover slots for the same recipe — stops at the next
   * fresh occurrence (a separate prep session).
   */
  const handleRemove = useCallback((date: string, slot: MealSlot, prevId: string) => {
    const currentMealPlan = useRecipeStore.getState().mealPlan;
    const prevRecipe = getRecipe(prevId);
    const prevIsLeftover = currentMealPlan[date]?.leftovers?.[slot] ?? false;

    // Snapshot for undo: always includes the slot being removed
    const removed: { date: string; slot: MealSlot; isLeftover: boolean }[] = [
      { date, slot, isLeftover: prevIsLeftover },
    ];

    // If this is the fresh (non-leftover) slot, cascade-remove its leftovers
    if (!prevIsLeftover) {
      const allDates = Object.keys(currentMealPlan).sort();
      const slotOrder = SLOTS;

      let pastSource = false;
      for (const d of allDates) {
        if (d < date) continue;
        const day = currentMealPlan[d];
        if (!day) continue;
        for (const s of slotOrder) {
          // Skip everything up to and including the source slot
          if (d === date && slotOrder.indexOf(s) <= slotOrder.indexOf(slot)) continue;
          if (day[s] !== prevId) continue;
          const isLO = day.leftovers?.[s] ?? false;
          // Another fresh slot for the same recipe = separate prep session, stop
          if (!isLO) { pastSource = true; break; }
          removed.push({ date: d, slot: s, isLeftover: true });
        }
        if (pastSource) break;
      }
    }

    // Execute removals
    for (const r of removed) {
      assignMeal(r.date, r.slot, undefined);
    }

    const count = removed.length;
    const label = count > 1
      ? `Removed ${prevRecipe?.title ?? "recipe"} and ${count - 1} leftover${count - 1 > 1 ? "s" : ""}`
      : `Removed ${prevRecipe?.title ?? "recipe"}`;

    toast(label, {
      action: {
        label: "Undo",
        onClick: () => {
          for (const r of removed) {
            assignMeal(r.date, r.slot, prevId, r.isLeftover);
          }
        },
      },
    });
  }, [getRecipe, assignMeal]);

  /** Clear entire week with undo. */
  const handleClearWeek = () => {
    // Snapshot current week plan for undo
    const snapshot: Record<string, MealPlanDay> = {};
    for (const date of weekDates) {
      if (mealPlan[date]) snapshot[date] = { ...mealPlan[date] };
    }
    const hasAny = Object.keys(snapshot).length > 0;
    if (!hasAny) {
      toast("Week is already empty");
      return;
    }

    clearWeek(weekDates);
    toast("Cleared week", {
      action: {
        label: "Undo",
        onClick: () => {
          (async () => {
            for (const date of weekDates) {
              const day = snapshot[date];
              if (!day) continue;
              for (const slot of SLOTS) {
                const recipeId = day[slot];
                if (recipeId) {
                  const isLeftover = day.leftovers?.[slot] ?? false;
                  await assignMeal(date, slot, recipeId, isLeftover);
                }
              }
            }
          })();
        },
      },
    });
  };

  /** Generate shopping list for current week. */
  const handleGenerateShoppingList = () => {
    generateShoppingList(weekDates);
    toast.success("Shopping list generated from this week's meals");
  };

  /** Save current week as a template. */
  const handleSaveTemplate = () => {
    if (!templateName.trim()) return;
    saveWeekAsTemplate(templateName.trim(), weekDates);
    setTemplateName("");
    setTemplateDialogOpen(false);
    toast.success(`Template "${templateName.trim()}" saved`);
  };

  /** Apply a template to current week. */
  const handleApplyTemplate = async (templateId: string, name: string) => {
    setTemplateSheetOpen(false);
    try {
      await applyTemplate(templateId, weekDates);
      toast.success(`Applied template "${name}"`);
    } catch {
      toast.error(`Failed to apply template "${name}"`);
    }
  };

  /** Toggle leftover flag on a slot. */
  const handleToggleLeftover = useCallback((date: string, slot: MealSlot, recipeId: string) => {
    const currentMealPlan = useRecipeStore.getState().mealPlan;
    const isCurrentlyLeftover = currentMealPlan[date]?.leftovers?.[slot] ?? false;
    assignMeal(date, slot, recipeId, !isCurrentlyLeftover);
  }, [assignMeal]);

  /** Stable navigation callback for SlotRow. */
  const handleNavigate = useCallback(
    (path: string) => router.push(path),
    [router],
  );

  /** Stable meal-prep callback for SlotRow. */
  const handleMealPrep = useCallback(
    (recipe: Recipe) => setMealPrepTarget(recipe),
    [],
  );

  // ---------- render ----------

  return (
    <div className="space-y-2 p-3 pt-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Meal Plan</h1>
        <div className="flex items-center gap-1">
          {/* Template dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setTemplateDialogOpen(true)}>
                Save Week as Template
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setTemplateSheetOpen(true)}>
                Apply Template
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
              aria-label="Previous week"
              onClick={() => setWeekOffset((w) => w - 1)}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                {formatWeekRange(weekDates)}
              </span>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Open calendar">
                    <CalendarDays className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="center">
                  <Calendar
                    mode="single"
                    selected={new Date(weekDates[0] + "T00:00:00")}
                    onSelect={(date) => {
                      if (!date) return;
                      setWeekOffset(getWeekOffsetForDate(date));
                      setCalendarOpen(false);
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              {weekOffset !== 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setWeekOffset(0)}
                >
                  Today
                </Button>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Next week"
              onClick={() => setWeekOffset((w) => w + 1)}
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>

          {/* ===================== MOBILE LAYOUT ===================== */}
          <div className="space-y-1.5 md:hidden">
            {weekDates.map((date, dayIdx) => (
              <Card
                key={date}
                className={cn(
                  "px-2 py-1 gap-0",
                  date === todayISO && "ring-2 ring-primary/50",
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-primary">{DAY_LABELS[dayIdx]}</span>
                  <span className="text-xs font-medium text-muted-foreground">
                    {new Date(date + "T00:00:00").toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
                <div className="space-y-0.5">
                  {SLOTS.map((slot) => (
                    <SlotRow
                      key={slot}
                      date={date}
                      slot={slot}
                      dayIdx={dayIdx}
                      recipeId={mealPlan[date]?.[slot]}
                      recipe={getRecipe(mealPlan[date]?.[slot])}
                      isLeftover={mealPlan[date]?.leftovers?.[slot] ?? false}
                      onNavigate={handleNavigate}
                      onToggleLeftover={handleToggleLeftover}
                      onMealPrep={handleMealPrep}
                      onRemove={handleRemove}
                    />
                  ))}
                </div>
              </Card>
            ))}
          </div>

          {/* ===================== DESKTOP LAYOUT ===================== */}
          <div className="hidden md:grid md:grid-cols-7 md:gap-1.5">
            {weekDates.map((date, dayIdx) => (
              <Card
                key={date}
                className={cn(
                  "px-1.5 py-1 gap-0",
                  date === todayISO && "ring-2 ring-primary/50",
                )}
              >
                <div className="text-center mb-1">
                  <div className="text-xs font-bold text-primary">{DAY_LABELS[dayIdx]}</div>
                  <div className="text-[10px] font-medium text-muted-foreground">
                    {new Date(date + "T00:00:00").toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </div>
                </div>
                <div className="space-y-0.5">
                  {SLOTS.map((slot) => (
                    <div key={slot}>
                      <div className="text-[10px] text-muted-foreground mb-0.5">
                        {SLOT_LABELS[slot]}
                      </div>
                      <SlotRow
                        date={date}
                        slot={slot}
                        dayIdx={dayIdx}
                        compact
                        recipeId={mealPlan[date]?.[slot]}
                        recipe={getRecipe(mealPlan[date]?.[slot])}
                        isLeftover={mealPlan[date]?.leftovers?.[slot] ?? false}
                        onNavigate={handleNavigate}
                        onToggleLeftover={handleToggleLeftover}
                        onMealPrep={handleMealPrep}
                        onRemove={handleRemove}
                      />
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>

          {/* Empty state hint when user has no recipes */}
          {recipes.length === 0 && (
            <div className="rounded-lg border border-dashed p-4 text-center">
              <p className="text-sm text-muted-foreground">
                Add some recipes first, then assign them to your weekly plan
              </p>
              <Link
                href="/"
                className="mt-3 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Add a Recipe
              </Link>
            </div>
          )}

          {/* ===================== ACTION BUTTONS ===================== */}
          <div className="flex flex-wrap items-center gap-1.5">
            <Button size="sm" onClick={handleGenerateShoppingList}>
              <ShoppingCart className="mr-1.5 h-3.5 w-3.5" />
              Shopping List
            </Button>
            <Button size="sm" variant="outline" onClick={handleClearWeek}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Clear Week
            </Button>
          </div>

          {/* ===================== SAVE TEMPLATE DIALOG ===================== */}
          <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Save Week as Template</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <Input
                  placeholder="Template name"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveTemplate();
                  }}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setTemplateDialogOpen(false);
                      setTemplateName("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSaveTemplate}
                    disabled={!templateName.trim()}
                  >
                    Save
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* ===================== MEAL PREP SHEET ===================== */}
          {mealPrepTarget && (
            <MealPrepSheet
              recipe={mealPrepTarget}
              open={!!mealPrepTarget}
              onOpenChange={(open) => {
                if (!open) setMealPrepTarget(null);
              }}
            />
          )}

          {/* ===================== APPLY TEMPLATE SHEET ===================== */}
          <Sheet open={templateSheetOpen} onOpenChange={setTemplateSheetOpen}>
            <SheetContent side="bottom" className="h-[50vh]">
              <SheetHeader>
                <SheetTitle>Apply Template</SheetTitle>
              </SheetHeader>
              <ScrollArea className="flex-1">
                <div className="space-y-1 pr-4">
                  {mealTemplates.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      No saved templates yet. Save a week as a template first!
                    </p>
                  ) : (
                    mealTemplates.map((template) => (
                      <div
                        key={template.id}
                        className="flex items-center justify-between rounded-md p-2 hover:bg-accent transition-colors"
                      >
                        <button
                          className="flex-1 text-left text-sm font-medium"
                          onClick={() =>
                            handleApplyTemplate(template.id, template.name)
                          }
                        >
                          {template.name}
                        </button>
                        <button
                          aria-label={`Delete template ${template.name}`}
                          className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-accent"
                          onClick={() => {
                            deleteTemplate(template.id);
                            toast(`Deleted template "${template.name}"`);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
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
