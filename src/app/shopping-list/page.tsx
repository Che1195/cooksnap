"use client";

import { useState, useMemo, useEffect } from "react";
import { Plus, Trash2, ShoppingCart, CalendarDays, Loader2, RotateCcw, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { useRecipeStore } from "@/stores/recipe-store";
import { useAuth } from "@/components/auth-provider";
import { getWeekDates, getTodayISO, cn } from "@/lib/utils";
import { DAY_LABELS } from "@/lib/constants";
import { toast } from "sonner";
import { parseIngredient, formatIngredientMain } from "@/lib/ingredient-parser";
import {
  categorizeIngredient,
  INGREDIENT_CATEGORIES,
  type IngredientCategory,
} from "@/lib/ingredient-categorizer";
import type { ShoppingItem, GroceryItem } from "@/types";

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

  const { user } = useAuth();

  // Shopping list store
  const shoppingList = useRecipeStore((s) => s.shoppingList);
  const addShoppingItem = useRecipeStore((s) => s.addShoppingItem);
  const toggleShoppingItem = useRecipeStore((s) => s.toggleShoppingItem);
  const clearCheckedItems = useRecipeStore((s) => s.clearCheckedItems);
  const clearShoppingList = useRecipeStore((s) => s.clearShoppingList);
  const uncheckAllShoppingItems = useRecipeStore((s) => s.uncheckAllShoppingItems);
  const restoreShoppingItems = useRecipeStore((s) => s.restoreShoppingItems);
  const generateShoppingList = useRecipeStore((s) => s.generateShoppingList);

  // Grocery list store
  const groceryList = useRecipeStore((s) => s.groceryList);
  const addGroceryItem = useRecipeStore((s) => s.addGroceryItem);
  const toggleGroceryItem = useRecipeStore((s) => s.toggleGroceryItem);
  const clearCheckedGroceryItems = useRecipeStore((s) => s.clearCheckedGroceryItems);
  const clearGroceryList = useRecipeStore((s) => s.clearGroceryList);
  const uncheckAllGroceryItems = useRecipeStore((s) => s.uncheckAllGroceryItems);
  const restoreGroceryItems = useRecipeStore((s) => s.restoreGroceryItems);

  const isLoading = useRecipeStore((s) => s.isLoading);
  const hydrated = useRecipeStore((s) => s.hydrated);
  const error = useRecipeStore((s) => s.error);
  const clearError = useRecipeStore((s) => s.clearError);
  const hydrate = useRecipeStore((s) => s.hydrate);

  useEffect(() => {
    if (user && !hydrated && !isLoading) {
      hydrate();
    }
  }, [user, hydrated, isLoading, hydrate]);

  useEffect(() => {
    if (error) {
      toast.error(error);
      clearError();
    }
  }, [error, clearError]);

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
    const trimmed = newItem.trim();
    if (trimmed) {
      addShoppingItem(trimmed);
      setNewItem("");
    }
  };

  const handleAddGrocery = () => {
    const trimmed = newGroceryItem.trim();
    if (trimmed) {
      addGroceryItem(trimmed);
      setNewGroceryItem("");
    }
  };

  /** Clear checked shopping items with undo toast */
  const handleClearChecked = () => {
    const removed = shoppingList.filter((i) => i.checked);
    if (removed.length === 0) return;
    clearCheckedItems();
    toast(`Cleared ${removed.length} item${removed.length !== 1 ? "s" : ""}`, {
      action: {
        label: "Undo",
        onClick: () => restoreShoppingItems(removed),
      },
    });
  };

  /** Clear entire shopping list with undo toast */
  const handleClearAll = () => {
    const removed = [...shoppingList];
    if (removed.length === 0) return;
    clearShoppingList();
    toast(`Cleared all ${removed.length} item${removed.length !== 1 ? "s" : ""}`, {
      action: {
        label: "Undo",
        onClick: () => restoreShoppingItems(removed),
      },
    });
  };

  /** Clear checked grocery items with undo toast */
  const handleClearCheckedGrocery = () => {
    const removed = groceryList.filter((i) => i.checked);
    if (removed.length === 0) return;
    clearCheckedGroceryItems();
    toast(`Cleared ${removed.length} item${removed.length !== 1 ? "s" : ""}`, {
      action: {
        label: "Undo",
        onClick: () => restoreGroceryItems(removed),
      },
    });
  };

  /** Clear entire grocery list with undo toast */
  const handleClearAllGrocery = () => {
    const removed = [...groceryList];
    if (removed.length === 0) return;
    clearGroceryList();
    toast(`Cleared all ${removed.length} item${removed.length !== 1 ? "s" : ""}`, {
      action: {
        label: "Undo",
        onClick: () => restoreGroceryItems(removed),
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
              onClick={() => generateShoppingList(getWeekDates(0))}
            >
              <CalendarDays className="mr-2 h-4 w-4" />
              Generate from this week&apos;s meal plan
            </Button>

            {/* Generate for a specific day */}
            <div className="flex gap-1.5 pb-1">
              {getWeekDates(0).map((date, i) => {
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
                    onClick={() => {
                      generateShoppingList([date]);
                      toast.success(`Generated list for ${DAY_LABELS[i]}`);
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
              <Button size="icon" onClick={handleAddShopping} disabled={!newItem.trim()} aria-label="Add item">
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
                              onCheckedChange={() => toggleShoppingItem(item.id)}
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
                    onClick={() => {
                      uncheckAllShoppingItems();
                      toast.success(`Unchecked ${checkedCount} item${checkedCount !== 1 ? "s" : ""}`);
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
                    onClick={handleClearChecked}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5 shrink-0" />
                    Clear ({checkedCount})
                  </Button>
                )}
                <Button
                  variant="destructive"
                  size="sm"
                  className={checkedCount > 0 ? "flex-1 min-w-0 text-xs" : "w-full text-xs"}
                  onClick={handleClearAll}
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
              <Button size="icon" onClick={handleAddGrocery} disabled={!newGroceryItem.trim()} aria-label="Add grocery item">
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
                              onCheckedChange={() => toggleGroceryItem(item.id)}
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
                    onClick={() => {
                      uncheckAllGroceryItems();
                      toast.success(`Unchecked ${groceryCheckedCount} item${groceryCheckedCount !== 1 ? "s" : ""}`);
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
                    onClick={handleClearCheckedGrocery}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5 shrink-0" />
                    Clear ({groceryCheckedCount})
                  </Button>
                )}
                <Button
                  variant="destructive"
                  size="sm"
                  className={groceryCheckedCount > 0 ? "flex-1 min-w-0 text-xs" : "w-full text-xs"}
                  onClick={handleClearAllGrocery}
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
