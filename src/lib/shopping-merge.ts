/**
 * Pure shopping-list assembly logic, extracted from the old zustand store so
 * the Convex hooks in `src/lib/convex/use-shopping.ts` stay thin and the
 * behaviour stays testable without a backend.
 *
 * Two operations with deliberately different semantics:
 * - `buildGeneratedItems` builds the *replacement* list for a week's meal plan.
 * - `planShoppingMerge` folds new ingredients into an *existing* list.
 */

import { aggregateIngredients, normalizeIngredientName } from "./ingredient-aggregator";
import { parseIngredient } from "./ingredient-parser";
import { SLOTS } from "./constants";
import type { MealPlan, Recipe, ShoppingItem } from "@/types";

/** Ingredient lines starting with this marker are section headers, not groceries. */
const SECTION_HEADER = "## ";

export interface GeneratedItem {
  text: string;
  /** The first recipe that contributed this ingredient, when one is known. */
  recipeId?: string;
}

/**
 * Builds the aggregated shopping list for `weekDates` from the planned meals.
 *
 * Leftovers contribute nothing (the cooking already happened) and section
 * headers are skipped. Duplicate ingredients across recipes are merged by
 * `aggregateIngredients`; each merged line is attributed to the first recipe
 * that contributed it, keyed by normalized ingredient name so the attribution
 * survives quantity merging. There is no fallback attribution — an
 * unattributed item is better than a wrong one.
 */
export function buildGeneratedItems(
  weekDates: string[],
  plan: MealPlan,
  recipes: Recipe[],
): GeneratedItem[] {
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const allRaw: string[] = [];
  const recipeForIngredient = new Map<string, string>(); // normalized name → recipeId

  for (const date of weekDates) {
    const day = plan[date];
    if (!day) continue;
    for (const slot of SLOTS) {
      for (const entry of day[slot]) {
        if (entry.isLeftover) continue;
        const recipe = byId.get(entry.recipeId);
        if (!recipe) continue;
        for (const ingredient of recipe.ingredients) {
          if (ingredient.startsWith(SECTION_HEADER)) continue;
          allRaw.push(ingredient);
          const key = normalizeIngredientName(parseIngredient(ingredient).name);
          if (!recipeForIngredient.has(key)) recipeForIngredient.set(key, recipe.id);
        }
      }
    }
  }

  return aggregateIngredients(allRaw).map((text) => {
    const key = normalizeIngredientName(parseIngredient(text).name);
    const recipeId = recipeForIngredient.get(key);
    return recipeId === undefined ? { text } : { text, recipeId };
  });
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
 * Folds `ingredients` into the unchecked part of `existing`.
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
): ShoppingMergePlan {
  const existingUnchecked = existing.filter((item) => !item.checked);

  // Name index over existing rows: first row wins, later duplicates are never
  // touched.
  const existingByName = new Map<string, ShoppingItem>();
  for (const item of existingUnchecked) {
    const name = normalizeIngredientName(parseIngredient(item.text).name);
    if (!existingByName.has(name)) existingByName.set(name, item);
  }

  // Group the new lines by normalized name, preserving first-seen order.
  const groups = new Map<string, string[]>();
  for (const ing of ingredients) {
    if (ing.startsWith(SECTION_HEADER)) continue;
    const name = normalizeIngredientName(parseIngredient(ing).name);
    const group = groups.get(name);
    if (group) group.push(ing);
    else groups.set(name, [ing]);
  }

  const toUpdate: Array<{ id: string; text: string }> = [];
  const toInsert: string[] = [];

  for (const [name, group] of groups) {
    const target = existingByName.get(name);
    if (!target) {
      toInsert.push(...aggregateIngredients(group));
      continue;
    }
    // Merge the group into the matched row. Aggregation can still split a
    // group when units will not convert ("1 cup rice" + "100 g rice"); the
    // first line updates the row and any remainder is inserted.
    const [merged, ...rest] = aggregateIngredients([target.text, ...group]);
    if (merged !== undefined && !sameLine(merged, target.text)) {
      toUpdate.push({ id: target.id, text: merged });
    }
    toInsert.push(...rest);
  }

  return { toUpdate, toInsert };
}
