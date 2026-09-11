"use client";

import { useState, useMemo, useEffect } from "react";
import { Plus, Trash2, ShoppingCart, CalendarDays, Loader2, RotateCcw, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { OfflineBanner } from "@/components/offline-banner";
import { useShoppingActions, useShoppingList } from "@/lib/convex/use-shopping";
import { useGroceryActions, useGroceryList } from "@/lib/convex/use-grocery";
import { useOfflineSnapshot } from "@/lib/convex/use-offline-snapshot";
import { useMealPlan } from "@/lib/convex/use-meal-plan";
import { useRecipes } from "@/lib/convex/use-recipes";
import { getWeekDates, getTodayISO, cn } from "@/lib/utils";
import { DAY_LABELS } from "@/lib/constants";
import { toast } from "sonner";
import { parseIngredient, formatIngredientMain } from "@/lib/ingredient-parser";
import {
  categorizeIngredient,
  INGREDIENT_CATEGORIES,
  type IngredientCategory,
} from "@/lib/ingredient-categorizer";
import type { MealPlan, Recipe, ShoppingItem, GroceryItem } from "@/types";

/** Stable references so the memos below do not rerun on every render. */
const EMPTY_SHOPPING: ShoppingItem[] = [];
const EMPTY_GROCERY: GroceryItem[] = [];
const EMPTY_PLAN: MealPlan = {};
const EMPTY_RECIPES: Recipe[] = [];

/**
 * Await a mutation, reporting a rejection as a toast. Resolves to whether it
 * succeeded so callers can hold back a success toast (and its Undo action)
 * until the write actually landed.
 */
async function surface(promise: Promise<unknown>, message: string): Promise<boolean> {
  try {
    await promise;
    return true;
  } catch {
    toast.error(message);
    return false;
  }
}

export default function ShoppingListPage() {
  const [newItem, setNewItem] = useState("");
  const [newGroceryItem, setNewGroceryItem] = useState("");
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

  // Shopping list — falls back to the last saved copy while the socket is down
  const { data: shoppingData, offline } = useOfflineSnapshot("shopping", useShoppingList());
  const shoppingList = shoppingData ?? EMPTY_SHOPPING;
  const {
    addShoppingItem,
    toggleShoppingItem,
    clearCheckedItems,
    clearShoppingList,
    uncheckAllShoppingItems,
    restoreShoppingItems,
    generateShoppingList,
  } = useShoppingActions();

  // Grocery list
  const { data: groceryData } = useOfflineSnapshot("grocery", useGroceryList());
  const groceryList = groceryData ?? EMPTY_GROCERY;
  const {
    addGroceryItem,
    toggleGroceryItem,
    clearCheckedGroceryItems,
    clearGroceryList,
    uncheckAllGroceryItems,
    restoreGroceryItems,
  } = useGroceryActions();

  // "Generate from this week" needs the plan and the recipes it references.
  // Computed per render (cheap) — a [] memo would go stale past midnight.
  const thisWeek = getWeekDates(0);
  const livePlan = useMealPlan(thisWeek[0], thisWeek[6]);
  const liveRecipes = useRecipes();
  const mealPlan = livePlan ?? EMPTY_PLAN;
  const recipes = liveRecipes ?? EMPTY_RECIPES;

  // Offline with no snapshot yet: render the empty lists rather than spinning
  const isLoading = !offline && (shoppingData === undefined || groceryData === undefined);

  // Generating REPLACES the list and has no undo, so it stays disabled until
  // the plan and the recipes it references have both arrived — otherwise a tap
  // in the pending window wipes the list and puts nothing back.
  const canGenerate = !offline && livePlan !== undefined && liveRecipes !== undefined;

  // Shopping list derived state
  const checkedCount = useMemo(
    () => shoppingList.filter((i) => i.checked).length,
    [shoppingList]
  );

  /** Group shopping items by grocery section, unchecked first within each */
  const groupedItems = useMemo(() => {
    const groupMap = new Map<
      IngredientCategory,
      ShoppingItem[]
    >();

    for (const item of shoppingList) {
      const category = categorizeIngredient(item.text);
      let group = groupMap.get(category);
      if (!group) {
        group = [];
        groupMap.set(category, group);
      }
      group.push(item);
    }

    for (const items of groupMap.values()) {
      items.sort((a, b) => Number(a.checked) - Number(b.checked));
    }

    return INGREDIENT_CATEGORIES.filter((cat) => groupMap.has(cat)).map(
      (category) => ({ category, items: groupMap.get(category)! })
    );
  }, [shoppingList]);

  // Grocery list derived state
  const groceryCheckedCount = useMemo(
    () => groceryList.filter((i) => i.checked).length,
    [groceryList]
  );

  /** Group grocery items by category, unchecked first within each */
  const groupedGroceryItems = useMemo(() => {
    const groupMap = new Map<
      IngredientCategory,
      GroceryItem[]
    >();

    for (const item of groceryList) {
      const category = categorizeIngredient(item.text);
      let group = groupMap.get(category);
      if (!group) {
        group = [];
        groupMap.set(category, group);
      }
      group.push(item);
    }

    for (const items of groupMap.values()) {
      items.sort((a, b) => Number(a.checked) - Number(b.checked));
    }

    return INGREDIENT_CATEGORIES.filter((cat) => groupMap.has(cat)).map(
      (category) => ({ category, items: groupMap.get(category)! })
    );
  }, [groceryList]);

  const handleAddShopping = () => {
    // Enter reaches here even though the add button is disabled offline.
    if (offline) return;
    const trimmed = newItem.trim();
    if (trimmed) {
      void surface(addShoppingItem(trimmed), "Failed to add item");
      setNewItem("");
    }
  };

  const handleAddGrocery = () => {
    if (offline) return;
    const trimmed = newGroceryItem.trim();
    if (trimmed) {
      void surface(addGroceryItem(trimmed), "Failed to add item");
      setNewGroceryItem("");
    }
  };

  /** Clear checked shopping items with undo toast */
  const handleClearChecked = async () => {
    const removed = shoppingList.filter((i) => i.checked);
    if (removed.length === 0) return;
    if (!(await surface(clearCheckedItems(), "Failed to clear checked items"))) return;
    toast(`Cleared ${removed.length} item${removed.length !== 1 ? "s" : ""}`, {
      action: {
        label: "Undo",
        onClick: () => void surface(restoreShoppingItems(removed), "Failed to undo"),
      },
    });
  };

  /** Clear entire shopping list with undo toast */
  const handleClearAll = async () => {
    const removed = [...shoppingList];
    if (removed.length === 0) return;
    if (!(await surface(clearShoppingList(), "Failed to clear the list"))) return;
    toast(`Cleared all ${removed.length} item${removed.length !== 1 ? "s" : ""}`, {
      action: {
        label: "Undo",
        onClick: () => void surface(restoreShoppingItems(removed), "Failed to undo"),
      },
    });
  };

  /** Clear checked grocery items with undo toast */
  const handleClearCheckedGrocery = async () => {
    const removed = groceryList.filter((i) => i.checked);
    if (removed.length === 0) return;
    if (!(await surface(clearCheckedGroceryItems(), "Failed to clear checked items"))) return;
    toast(`Cleared ${removed.length} item${removed.length !== 1 ? "s" : ""}`, {
      action: {
        label: "Undo",
        onClick: () => void surface(restoreGroceryItems(removed), "Failed to undo"),
      },
    });
  };

  /** Clear entire grocery list with undo toast */
  const handleClearAllGrocery = async () => {
    const removed = [...groceryList];
    if (removed.length === 0) return;
    if (!(await surface(clearGroceryList(), "Failed to clear the list"))) return;
    toast(`Cleared all ${removed.length} item${removed.length !== 1 ? "s" : ""}`, {
      action: {
        label: "Undo",
        onClick: () => void surface(restoreGroceryItems(removed), "Failed to undo"),
      },
    });
  };

  return (
    <div className="space-y-4 p-4 pt-6 overflow-x-hidden">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Shop</h1>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>

      {offline && <OfflineBanner />}

      {isLoading ? (
        <div className="flex flex-col items-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">Loading...</p>
        </div>
      ) : (
        <Tabs defaultValue="shopping">
          <TabsList variant="line" className="w-full">
            <TabsTrigger value="shopping">
              Shopping List
              {shoppingList.length > 0 && (
                <span className="ml-1.5 text-xs text-muted-foreground">({shoppingList.length})</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="grocery">
              Grocery List
              {groceryList.length > 0 && (
                <span className="ml-1.5 text-xs text-muted-foreground">({groceryList.length})</span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ==================== Shopping List Tab ==================== */}
          <TabsContent value="shopping" className="space-y-4">
            {/* Generate from meal plan */}
            <Button
              variant="outline"
              className="w-full"
              disabled={!canGenerate}
              onClick={() =>
                void surface(
                  generateShoppingList(thisWeek, mealPlan, recipes),
                  "Failed to generate the shopping list",
                )
              }
            >
              <CalendarDays className="mr-2 h-4 w-4" />
              Generate from this week&apos;s meal plan
            </Button>

            {/* Generate for a specific day */}
            <div className="flex gap-1.5 pb-1">
              {thisWeek.map((date, i) => {
                const d = new Date(date + "T00:00:00");
                const dayNum = d.getDate();
                return (
                  <Button
                    key={date}
                    size="sm"
                    variant={date === todayISO ? "default" : "outline"}
                    className={cn(
                      "flex-1 min-w-0 text-xs px-1 py-2",
                      date === todayISO && "font-bold"
                    )}
                    disabled={!canGenerate}
                    onClick={() => {
                      void generateShoppingList([date], mealPlan, recipes).then(
                        () => toast.success(`Generated list for ${DAY_LABELS[i]}`),
                        () => toast.error("Failed to generate the shopping list"),
                      );
                    }}
                  >
                    <span className="font-medium">{DAY_LABELS[i]}</span>
                    <span className={cn("ml-0.5", date !== todayISO && "text-muted-foreground")}>{dayNum}</span>
                  </Button>
                );
              })}
            </div>

            {/* Add item */}
            <div className="flex gap-2">
              <label htmlFor="shopping-add-item" className="sr-only">Add an item</label>
              <Input
                id="shopping-add-item"
                placeholder="Add an item..."
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddShopping()}
              />
              <Button size="icon" onClick={handleAddShopping} disabled={offline || !newItem.trim()} aria-label="Add item">
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* List grouped by grocery section */}
            {shoppingList.length > 0 ? (
              <div>
                {groupedItems.map((group, gi) => (
                  <div key={group.category} className={gi === 0 ? "" : "mt-3"}>
                    <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {group.category}
                      <span className="ml-1.5 normal-case tracking-normal">
                        ({group.items.length})
                      </span>
                    </h2>
                    <div className="space-y-0">
                      {group.items.map((item) => {
                        const parsed = parseIngredient(item.text);
                        return (
                          <div
                            key={item.id}
                            className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-accent/50 transition-colors"
                          >
                            <Checkbox
                              id={`shop-${item.id}`}
                              checked={item.checked}
                              disabled={offline}
                              onCheckedChange={() =>
                                surface(toggleShoppingItem(item.id), "Failed to update item")
                              }
                            />
                            <label
                              htmlFor={`shop-${item.id}`}
                              className={`flex-1 cursor-pointer text-sm ${
                                item.checked
                                  ? "text-muted-foreground line-through"
                                  : ""
                              }`}
                            >
                              {formatIngredientMain(parsed)}
                              {parsed.prepNote && (
                                <span className="italic text-muted-foreground/70">, {parsed.prepNote}</span>
                              )}
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center py-16 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                  <ShoppingCart className="h-8 w-8 text-muted-foreground" />
                </div>
                <h2 className="text-lg font-semibold">No items yet</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Add items manually above, or generate a list from your meal plan
                </p>
              </div>
            )}

            {/* Uncheck all / Clear checked / Clear all */}
            {shoppingList.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {checkedCount > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 min-w-0 text-xs"
                    disabled={offline}
                    onClick={() => {
                      void surface(uncheckAllShoppingItems(), "Failed to uncheck items").then(
                        (ok) =>
                          ok &&
                          toast.success(`Unchecked ${checkedCount} item${checkedCount !== 1 ? "s" : ""}`),
                      );
                    }}
                  >
                    <RotateCcw className="mr-1 h-3.5 w-3.5 shrink-0" />
                    Uncheck
                  </Button>
                )}
                {checkedCount > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="flex-1 min-w-0 text-xs"
                    disabled={offline}
                    onClick={() => void handleClearChecked()}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5 shrink-0" />
                    Clear ({checkedCount})
                  </Button>
                )}
                <Button
                  variant="destructive"
                  size="sm"
                  className={checkedCount > 0 ? "flex-1 min-w-0 text-xs" : "w-full text-xs"}
                  disabled={offline}
                  onClick={() => void handleClearAll()}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5 shrink-0" />
                  Clear all
                </Button>
              </div>
            )}
          </TabsContent>

          {/* ==================== Grocery List Tab ==================== */}
          <TabsContent value="grocery" className="space-y-4">
            {/* Add item */}
            <div className="flex gap-2">
              <label htmlFor="grocery-add-item" className="sr-only">Add a grocery item</label>
              <Input
                id="grocery-add-item"
                placeholder="Add a grocery item..."
                value={newGroceryItem}
                onChange={(e) => setNewGroceryItem(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddGrocery()}
              />
              <Button size="icon" onClick={handleAddGrocery} disabled={offline || !newGroceryItem.trim()} aria-label="Add grocery item">
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* List grouped by category */}
            {groceryList.length > 0 ? (
              <div>
                {groupedGroceryItems.map((group, gi) => (
                  <div key={group.category} className={gi === 0 ? "" : "mt-3"}>
                    <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {group.category}
                      <span className="ml-1.5 normal-case tracking-normal">
                        ({group.items.length})
                      </span>
                    </h2>
                    <div className="space-y-0">
                      {group.items.map((item) => {
                        const parsed = parseIngredient(item.text);
                        return (
                          <div
                            key={item.id}
                            className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-accent/50 transition-colors"
                          >
                            <Checkbox
                              id={`groc-${item.id}`}
                              checked={item.checked}
                              disabled={offline}
                              onCheckedChange={() =>
                                surface(toggleGroceryItem(item.id), "Failed to update item")
                              }
                            />
                            <label
                              htmlFor={`groc-${item.id}`}
                              className={`flex-1 cursor-pointer text-sm ${
                                item.checked
                                  ? "text-muted-foreground line-through"
                                  : ""
                              }`}
                            >
                              {formatIngredientMain(parsed)}
                              {parsed.prepNote && (
                                <span className="italic text-muted-foreground/70">, {parsed.prepNote}</span>
                              )}
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center py-16 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                  <ListChecks className="h-8 w-8 text-muted-foreground" />
                </div>
                <h2 className="text-lg font-semibold">No grocery items</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Add items you need to pick up at the store
                </p>
              </div>
            )}

            {/* Uncheck all / Clear checked / Clear all */}
            {groceryList.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {groceryCheckedCount > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 min-w-0 text-xs"
                    disabled={offline}
                    onClick={() => {
                      void surface(uncheckAllGroceryItems(), "Failed to uncheck items").then(
                        (ok) =>
                          ok &&
                          toast.success(
                            `Unchecked ${groceryCheckedCount} item${groceryCheckedCount !== 1 ? "s" : ""}`,
                          ),
                      );
                    }}
                  >
                    <RotateCcw className="mr-1 h-3.5 w-3.5 shrink-0" />
                    Uncheck
                  </Button>
                )}
                {groceryCheckedCount > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="flex-1 min-w-0 text-xs"
                    disabled={offline}
                    onClick={() => void handleClearCheckedGrocery()}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5 shrink-0" />
                    Clear ({groceryCheckedCount})
                  </Button>
                )}
                <Button
                  variant="destructive"
                  size="sm"
                  className={groceryCheckedCount > 0 ? "flex-1 min-w-0 text-xs" : "w-full text-xs"}
                  disabled={offline}
                  onClick={() => void handleClearAllGrocery()}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5 shrink-0" />
                  Clear all
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
