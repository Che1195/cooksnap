"use client";

import { useState, useMemo, useEffect } from "react";
import { Plus, Trash2, ShoppingCart, CalendarDays, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { useRecipeStore } from "@/stores/recipe-store";
import { useAuth } from "@/components/auth-provider";
import { getWeekDates } from "@/lib/utils";
import { DAY_LABELS } from "@/lib/constants";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { parseIngredient, formatIngredientMain } from "@/lib/ingredient-parser";
import {
  categorizeIngredient,
  INGREDIENT_CATEGORIES,
  type IngredientCategory,
} from "@/lib/ingredient-categorizer";

export default function ShoppingListPage() {
  const [newItem, setNewItem] = useState("");

  const { user } = useAuth();
  const shoppingList = useRecipeStore((s) => s.shoppingList);
  const addShoppingItem = useRecipeStore((s) => s.addShoppingItem);
  const toggleShoppingItem = useRecipeStore((s) => s.toggleShoppingItem);
  const clearCheckedItems = useRecipeStore((s) => s.clearCheckedItems);
  const clearShoppingList = useRecipeStore((s) => s.clearShoppingList);
  const generateShoppingList = useRecipeStore((s) => s.generateShoppingList);
  const recipes = useRecipeStore((s) => s.recipes);
  const isLoading = useRecipeStore((s) => s.isLoading);
  const error = useRecipeStore((s) => s.error);
  const clearError = useRecipeStore((s) => s.clearError);
  const hydrate = useRecipeStore((s) => s.hydrate);

  // Use recipes.length as hydration guard — shoppingList can legitimately be empty
  useEffect(() => {
    if (user && recipes.length === 0 && !isLoading) {
      hydrate();
    }
  }, [user, recipes.length, isLoading, hydrate]);

  useEffect(() => {
    if (error) {
      toast.error(error);
      clearError();
    }
  }, [error, clearError]);

  const checkedCount = useMemo(
    () => shoppingList.filter((i) => i.checked).length,
    [shoppingList]
  );

  /** Group shopping items by grocery section, unchecked first within each */
  const groupedItems = useMemo(() => {
    const groupMap = new Map<
      IngredientCategory,
      typeof shoppingList
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

    // Sort within each group: unchecked first, then checked
    for (const items of groupMap.values()) {
      items.sort((a, b) => Number(a.checked) - Number(b.checked));
    }

    // Return in canonical display order, omitting empty categories
    return INGREDIENT_CATEGORIES.filter((cat) => groupMap.has(cat)).map(
      (category) => ({ category, items: groupMap.get(category)! })
    );
  }, [shoppingList]);

  const handleAdd = () => {
    const trimmed = newItem.trim();
    if (trimmed) {
      addShoppingItem(trimmed);
      setNewItem("");
    }
  };

  return (
    <div className="space-y-4 p-4 pt-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Shopping List</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {shoppingList.length} item{shoppingList.length !== 1 ? "s" : ""}
          </span>
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">Loading shopping list...</p>
        </div>
      ) : (
        <>
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
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {getWeekDates(0).map((date, i) => {
              const d = new Date(date + "T00:00:00");
              const shortDate = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
              return (
                <Button
                  key={date}
                  variant="outline"
                  size="sm"
                  className="flex-shrink-0 text-xs px-4 py-2"
                  onClick={() => {
                    generateShoppingList([date]);
                    toast.success(`Generated list for ${DAY_LABELS[i]}`);
                  }}
                >
                  <span className="font-medium">{DAY_LABELS[i]}</span>
                  <span className="ml-1 text-muted-foreground">{shortDate}</span>
                </Button>
              );
            })}
          </div>

          {/* Add item */}
          <div className="flex gap-2">
            <Input
              placeholder="Add an item..."
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <Button size="icon" onClick={handleAdd} disabled={!newItem.trim()}>
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
                            id={item.id}
                            checked={item.checked}
                            onCheckedChange={() => toggleShoppingItem(item.id)}
                          />
                          <label
                            htmlFor={item.id}
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
              <ShoppingCart className="h-10 w-10 text-muted-foreground/40" />
              <p className="mt-4 text-sm text-muted-foreground">
                Your shopping list is empty.
              </p>
            </div>
          )}

          {/* Clear checked / Clear all */}
          {shoppingList.length > 0 && (
            <div className="flex gap-2">
              {checkedCount > 0 && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="flex-1">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Clear {checkedCount} checked
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Clear checked items?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will remove {checkedCount} checked item{checkedCount !== 1 ? "s" : ""} from your shopping list.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={clearCheckedItems}>
                        Clear
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className={checkedCount > 0 ? "flex-1" : "w-full"}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Clear all
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear entire shopping list?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will remove all {shoppingList.length} item{shoppingList.length !== 1 ? "s" : ""} from your shopping list.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={clearShoppingList}>
                      Clear all
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </>
      )}
    </div>
  );
}
