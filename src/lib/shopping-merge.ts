/**
 * Pure shopping-list assembly logic, extracted from the old zustand store so
 * the Convex hooks in `src/lib/convex/use-shopping.ts` stay thin and the
 * behaviour stays testable without a backend.
 *
 * Two operations with deliberately different semantics:
 * - `buildGeneratedItems` builds the *replacement* list for a week's meal plan.
 * - `planShoppingMerge` folds new ingredients into an *existing* list.
 */

import {
  aggregateIngredients,
  normalizeIngredientName,
  isSimpleShoppingIngredient,
  normalizeUnit,
  canConvertUnits,
} from "./ingredient-aggregator";
import { parseIngredient } from "./ingredient-parser";
import { SLOTS } from "./constants";
import type { MealPlan, Recipe, ShoppingItem } from "../types";

/** Ingredient lines starting with this marker are section headers, not groceries. */
const SECTION_HEADER = "## ";

export interface GeneratedItem {
  text: string;
  /** The recipe that contributed this ingredient. */
  recipeId?: string;
}

/**
 * Aggregate within each recipe so deleting one recipe cannot remove another's
 * contribution. Leftovers, section headers, and unavailable recipes are skipped.
 */
export function buildGeneratedItems(
  weekDates: string[],
  plan: MealPlan,
  recipes: Recipe[],
): GeneratedItem[] {
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const ingredientsByRecipe = new Map<string, string[]>();
  for (const date of weekDates) {
    const day = plan[date];
    if (!day) continue;
    for (const slot of SLOTS) {
      for (const entry of day[slot]) {
        if (entry.isLeftover) continue;
        const recipe = byId.get(entry.recipeId);
        if (!recipe) continue;
        const ingredients = ingredientsByRecipe.get(recipe.id) ?? [];
        ingredients.push(...recipe.ingredients.filter((line) => !line.startsWith(SECTION_HEADER)));
        ingredientsByRecipe.set(recipe.id, ingredients);
      }
    }
  }
  return [...ingredientsByRecipe].flatMap(([recipeId, ingredients]) =>
    aggregateIngredients(ingredients).map((text) => ({ text, recipeId })),
  );
}

export interface ShoppingMergePlan {
  /** Existing items whose text changes because quantities merged. */
  toUpdate: Array<{ id: string; text: string }>;
  /** Genuinely new lines to append. */
  toInsert: string[];
}

/** Case- and whitespace-insensitive comparison of two ingredient lines. */
function sameLine(a: string, b: string): boolean {
  return a.toLowerCase().trim() === b.toLowerCase().trim();
}

/**
 * Folds `ingredients` into unchecked rows with the same recipe source.
 *
 * Existing rows are never aggregated against each other: if the list already
 * holds "1 cup rice" and "2 cups rice" as separate rows, they stay separate.
 * Only the NEW ingredients are grouped (by normalized name) and each group is
 * merged into the FIRST existing unchecked row with that name, or inserted
 * when there is none.
 *
 * Checked items are left alone entirely — the user has already bought them, so
 * a new "2 cups rice" must not silently reopen a ticked-off "1 cup rice".
 * Matching is by normalized ingredient name rather than word overlap, which
 * used to conflate distinct groceries such as "red pepper" and "red pepper
 * flakes".
 */
export function planShoppingMerge(
  existing: ShoppingItem[],
  ingredients: string[],
  recipeId?: string,
): ShoppingMergePlan {
  const working = existing
    .filter((item) => !item.checked && item.recipeId === recipeId)
    .map((item) => ({ ...item }));
  const updates = new Map<string, string>();
  const toInsert: string[] = [];

  for (const line of aggregateIngredients(ingredients)) {
    if (!isSimpleShoppingIngredient(line)) {
      toInsert.push(line);
      continue;
    }
    const incoming = parseIngredient(line);
    const incomingUnit = normalizeUnit(incoming.unit);
    const target = working.find((item) => {
      if (!isSimpleShoppingIngredient(item.text)) return false;
      const parsed = parseIngredient(item.text);
      if (
        normalizeIngredientName(parsed.name) !==
        normalizeIngredientName(incoming.name)
      )
        return false;
      if (parsed.quantity === null || incoming.quantity === null)
        return (
          parsed.quantity === null &&
          incoming.quantity === null &&
          sameLine(item.text, line)
        );
      const unit = normalizeUnit(parsed.unit);
      return (
        unit === incomingUnit ||
        (unit !== null &&
          incomingUnit !== null &&
          canConvertUnits(unit, incomingUnit))
      );
    });
    if (!target) {
      toInsert.push(line);
      continue;
    }
    const [merged] = aggregateIngredients([target.text, line]);
    if (merged !== undefined && !sameLine(merged, target.text)) {
      target.text = merged;
      updates.set(target.id, merged);
    }
  }

  return {
    toUpdate: [...updates].map(([id, text]) => ({ id, text })),
    toInsert,
  };
}
