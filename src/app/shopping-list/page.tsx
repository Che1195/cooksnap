"use client";

import { useState, useMemo } from "react";
import { Plus, Trash2, ShoppingCart, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useRecipeStore } from "@/stores/recipe-store";
import { getWeekDates } from "@/lib/utils";

export default function ShoppingListPage() {
  const [newItem, setNewItem] = useState("");
  const shoppingList = useRecipeStore((s) => s.shoppingList);
  const addShoppingItem = useRecipeStore((s) => s.addShoppingItem);
  const toggleShoppingItem = useRecipeStore((s) => s.toggleShoppingItem);
  const clearCheckedItems = useRecipeStore((s) => s.clearCheckedItems);
  const generateShoppingList = useRecipeStore((s) => s.generateShoppingList);

  const checkedCount = useMemo(
    () => shoppingList.filter((i) => i.checked).length,
    [shoppingList]
  );

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
        <span className="text-sm text-muted-foreground">
          {shoppingList.length} item{shoppingList.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Generate from meal plan */}
      <Button
        variant="outline"
        className="w-full"
        onClick={() => generateShoppingList(getWeekDates(0))}
      >
        <CalendarDays className="mr-2 h-4 w-4" />
        Generate from this week&apos;s meal plan
      </Button>

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

      {/* List */}
      {shoppingList.length > 0 ? (
        <div className="space-y-1">
          {shoppingList.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-md px-2 py-2.5 hover:bg-accent/50 transition-colors"
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
                {item.text}
              </label>
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

      {/* Clear checked */}
      {checkedCount > 0 && (
        <Button
          variant="outline"
          className="w-full"
          onClick={clearCheckedItems}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Clear {checkedCount} checked item{checkedCount !== 1 ? "s" : ""}
        </Button>
      )}
    </div>
  );
}
