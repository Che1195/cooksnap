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

import { useState, useMemo, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  ChevronLeft,
  ChevronRight,
  X,
  Search,
  Loader2,
  Pencil,
  ShoppingCart,
  Trash2,
  UtensilsCrossed,
  MoreHorizontal,
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
import { useRecipeStore } from "@/stores/recipe-store";
import { useAuth } from "@/components/auth-provider";
import { cn, getWeekDates, formatWeekRange, getTodayISO } from "@/lib/utils";
import { SLOTS, SLOT_LABELS, DAY_LABELS } from "@/lib/constants";
import { toast } from "sonner";
import type { MealSlot, Recipe, MealPlanDay } from "@/types";

export default function MealPlanPage() {
  const router = useRouter();

  // ---------- local state ----------
  const [weekOffset, setWeekOffset] = useState(0);
  const [pickerSearch, setPickerSearch] = useState("");
  const [picker, setPicker] = useState<{
    date: string;
    slot: MealSlot;
  } | null>(null);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateSheetOpen, setTemplateSheetOpen] = useState(false);

  // ---------- store ----------
  const { user } = useAuth();
  const recipes = useRecipeStore((s) => s.recipes);
  const mealPlan = useRecipeStore((s) => s.mealPlan);
  const mealTemplates = useRecipeStore((s) => s.mealTemplates);
  const assignMeal = useRecipeStore((s) => s.assignMeal);
  const clearWeek = useRecipeStore((s) => s.clearWeek);
  const isLoading = useRecipeStore((s) => s.isLoading);
  const error = useRecipeStore((s) => s.error);
  const hydrate = useRecipeStore((s) => s.hydrate);
  const fetchMealPlanForWeek = useRecipeStore((s) => s.fetchMealPlanForWeek);
  const fetchTemplates = useRecipeStore((s) => s.fetchTemplates);
  const saveWeekAsTemplate = useRecipeStore((s) => s.saveWeekAsTemplate);
  const applyTemplate = useRecipeStore((s) => s.applyTemplate);
  const deleteTemplate = useRecipeStore((s) => s.deleteTemplate);
  const generateShoppingList = useRecipeStore((s) => s.generateShoppingList);

  // ---------- derived ----------
  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
  const todayISO = useMemo(() => getTodayISO(), []);

  const filteredRecipes = useMemo(() => {
    if (!pickerSearch.trim()) return recipes;
    const q = pickerSearch.toLowerCase();
    return recipes.filter((r) => r.title.toLowerCase().includes(q));
  }, [recipes, pickerSearch]);

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
    if (user && recipes.length === 0 && !isLoading) {
      hydrate();
    }
  }, [user, recipes.length, isLoading, hydrate]);

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

  /** Surface store errors as toasts. */
  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  // ---------- handlers ----------

  /** Remove a recipe from a slot with undo toast. */
  const handleRemove = (date: string, slot: MealSlot, prevId: string) => {
    const prevRecipe = getRecipe(prevId);
    const prevIsLeftover = mealPlan[date]?.leftovers?.[slot] ?? false;
    assignMeal(date, slot, undefined);
    toast(`Removed ${prevRecipe?.title ?? "recipe"}`, {
      action: {
        label: "Undo",
        onClick: () => assignMeal(date, slot, prevId, prevIsLeftover),
      },
    });
  };

  /** Replace a recipe in a slot (opens picker) — stores old id for undo. */
  const handleReplace = (date: string, slot: MealSlot) => {
    setPicker({ date, slot });
  };

  /** Assign from picker, with undo for replacements. */
  const handlePickerSelect = (recipe: Recipe) => {
    if (!picker) return;
    const { date, slot } = picker;
    const prevId = mealPlan[date]?.[slot];
    const prevRecipe = getRecipe(prevId);
    const prevIsLeftover = mealPlan[date]?.leftovers?.[slot] ?? false;

    assignMeal(date, slot, recipe.id);
    setPicker(null);
    setPickerSearch("");

    if (prevId) {
      toast(`Replaced ${prevRecipe?.title ?? "recipe"} with ${recipe.title}`, {
        action: {
          label: "Undo",
          onClick: () => assignMeal(date, slot, prevId, prevIsLeftover),
        },
      });
    }
  };

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
          for (const date of weekDates) {
            const day = snapshot[date];
            if (!day) continue;
            for (const slot of SLOTS) {
              const recipeId = day[slot];
              if (recipeId) {
                const isLeftover = day.leftovers?.[slot] ?? false;
                assignMeal(date, slot, recipeId, isLeftover);
              }
            }
          }
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
  const handleApplyTemplate = (templateId: string, name: string) => {
    applyTemplate(templateId, weekDates);
    setTemplateSheetOpen(false);
    toast.success(`Applied template "${name}"`);
  };

  /** Toggle leftover flag on a slot. */
  const handleToggleLeftover = (date: string, slot: MealSlot, recipeId: string) => {
    const isCurrentlyLeftover = mealPlan[date]?.leftovers?.[slot] ?? false;
    assignMeal(date, slot, recipeId, !isCurrentlyLeftover);
  };

  // ---------- shared slot renderer ----------

  /**
   * SlotRow renders a single meal slot (breakfast, lunch, dinner, snack)
   * for a given date. Shared between mobile card view and desktop grid.
   */
  function SlotRow({
    date,
    slot,
    dayIdx,
    compact = false,
  }: {
    date: string;
    slot: MealSlot;
    dayIdx: number;
    compact?: boolean;
  }) {
    const recipeId = mealPlan[date]?.[slot];
    const recipe = getRecipe(recipeId);
    const isLeftover = mealPlan[date]?.leftovers?.[slot] ?? false;

    return (
      <div
        role="button"
        tabIndex={0}
        aria-label={
          recipe
            ? `${recipe.title} for ${SLOT_LABELS[slot].toLowerCase()} on ${DAY_LABELS[dayIdx]}`
            : `Add ${SLOT_LABELS[slot].toLowerCase()} for ${DAY_LABELS[dayIdx]}`
        }
        className={cn(
          "flex items-center gap-2 rounded-md border border-dashed p-2 text-xs cursor-pointer hover:bg-accent/50 transition-colors",
          compact && "p-1.5",
        )}
        onClick={() => {
          if (recipe && recipeId) {
            router.push(`/recipes/${recipeId}`);
          } else {
            setPicker({ date, slot });
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (recipe && recipeId) {
              router.push(`/recipes/${recipeId}`);
            } else {
              setPicker({ date, slot });
            }
          }
        }}
      >
        {!compact && (
          <span className="w-14 shrink-0 text-[11px] text-muted-foreground">
            {SLOT_LABELS[slot]}
          </span>
        )}

        {recipe ? (
          <>
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

            <span className="flex-1 truncate font-medium text-[11px]">{recipe.title}</span>

            {/* Slot action buttons */}
            <div className="flex items-center gap-0.5 shrink-0">
              {/* Toggle leftover */}
              <button
                aria-label={isLeftover ? "Unmark as leftover" : "Mark as leftover"}
                className={cn(
                  "rounded p-0.5 hover:bg-accent",
                  isLeftover ? "text-amber-500" : "text-muted-foreground",
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleLeftover(date, slot, recipeId!);
                }}
              >
                <UtensilsCrossed className="h-3 w-3" />
              </button>

              {/* Replace recipe */}
              <button
                aria-label="Replace recipe"
                className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent"
                onClick={(e) => {
                  e.stopPropagation();
                  handleReplace(date, slot);
                }}
              >
                <Pencil className="h-3 w-3" />
              </button>

              {/* Remove recipe */}
              <button
                aria-label="Remove meal"
                className="rounded p-0.5 text-muted-foreground hover:text-destructive hover:bg-accent"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove(date, slot, recipeId!);
                }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </>
        ) : (
          <span className="flex-1 text-muted-foreground/50">+ Add</span>
        )}
      </div>
    );
  }

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
              onClick={() => setWeekOffset((w) => w - 1)}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                {formatWeekRange(weekDates)}
              </span>
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
                  "p-2",
                  date === todayISO && "ring-2 ring-primary/50",
                )}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-semibold">{DAY_LABELS[dayIdx]}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(date + "T00:00:00").toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
                <div className="space-y-1">
                  {SLOTS.map((slot) => (
                    <SlotRow key={slot} date={date} slot={slot} dayIdx={dayIdx} />
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
                  "p-1.5",
                  date === todayISO && "ring-2 ring-primary/50",
                )}
              >
                <div className="mb-1 text-center">
                  <div className="text-xs font-semibold">{DAY_LABELS[dayIdx]}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {new Date(date + "T00:00:00").toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </div>
                </div>
                <div className="space-y-1">
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
                      />
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>

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

          {/* ===================== RECIPE PICKER SHEET ===================== */}
          <Sheet
            open={!!picker}
            onOpenChange={(open) => {
              if (!open) {
                setPicker(null);
                setPickerSearch("");
              }
            }}
          >
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
                        className="flex w-full items-center gap-3 rounded-md p-2 text-left text-sm hover:bg-accent transition-colors"
                        onClick={() => handlePickerSelect(recipe)}
                      >
                        {recipe.image && (
                          <Image
                            src={recipe.image}
                            alt={recipe.title}
                            width={40}
                            height={40}
                            className="rounded object-cover shrink-0"
                            style={{ width: 40, height: 40 }}
                          />
                        )}
                        <span className="truncate">{recipe.title}</span>
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>
            </SheetContent>
          </Sheet>

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
