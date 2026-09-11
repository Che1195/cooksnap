import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { requireOwnedRecipe, requireUser } from "./lib/auth";
import { mealType } from "./schema";
import type { MealPlan, MealPlanDay, MealSlot } from "../src/types";

function emptyDay(): MealPlanDay {
  return { breakfast: [], lunch: [], dinner: [], snack: [] };
}

export function groupPlan(rows: Doc<"mealPlans">[]): MealPlan {
  const plan: MealPlan = {};
  for (const row of rows) {
    const day = (plan[row.date] ??= emptyDay());
    day[row.mealType].push({ recipeId: row.recipeId, isLeftover: row.isLeftover, position: row.position });
  }
  for (const day of Object.values(plan)) {
    for (const slot of ["breakfast", "lunch", "dinner", "snack"] as const) day[slot].sort((a, b) => a.position - b.position);
  }
  return plan;
}

export const forRange = query({
  args: { startDate: v.string(), endDate: v.string() },
  handler: async (ctx, { startDate, endDate }): Promise<MealPlan> => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("mealPlans")
      .withIndex("by_user_date", (q) => q.eq("userId", user._id).gte("date", startDate).lte("date", endDate))
      .collect();
    return groupPlan(rows);
  },
});

export const forRecipe = query({
  args: { recipeId: v.id("recipes") },
  handler: async (ctx, { recipeId }): Promise<Array<{ date: string; mealType: MealSlot; isLeftover: boolean }>> => {
    const user = await requireUser(ctx);
    const rows = await ctx.db.query("mealPlans").withIndex("by_recipe", (q) => q.eq("recipeId", recipeId)).collect();
    return rows
      .filter((r) => r.userId === user._id)
      .map((r) => ({ date: r.date, mealType: r.mealType, isLeftover: r.isLeftover }));
  },
});

export async function assignInternal(
  ctx: MutationCtx,
  userId: Id<"users">,
  args: { date: string; mealType: MealSlot; recipeId: Id<"recipes">; isLeftover: boolean },
): Promise<boolean> {
  const slotRows = await ctx.db
    .query("mealPlans")
    .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", args.date))
    .collect();
  const inSlot = slotRows.filter((r) => r.mealType === args.mealType);
  if (inSlot.some((r) => r.recipeId === args.recipeId)) return false;
  const position = inSlot.reduce((max, r) => Math.max(max, r.position + 1), 0);
  await ctx.db.insert("mealPlans", { userId, ...args, position });
  return true;
}

export const assign = mutation({
  args: { date: v.string(), mealType, recipeId: v.id("recipes"), isLeftover: v.boolean() },
  handler: async (ctx, args): Promise<boolean> => {
    const user = await requireUser(ctx);
    await requireOwnedRecipe(ctx, user._id, args.recipeId);
    return assignInternal(ctx, user._id, args);
  },
});

/**
 * Flips the leftover flag on an existing slot entry.
 *
 * `assign` cannot do this: it returns false rather than touching a row that is
 * already in the slot, which the meal-prep sheet relies on to detect
 * duplicates. The toggle therefore gets its own mutation.
 */
export const setLeftover = mutation({
  args: { date: v.string(), mealType, recipeId: v.id("recipes"), isLeftover: v.boolean() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("mealPlans")
      .withIndex("by_user_date", (q) => q.eq("userId", user._id).eq("date", args.date))
      .collect();
    const row = rows.find((r) => r.mealType === args.mealType && r.recipeId === args.recipeId);
    if (!row) throw new ConvexError("Meal not found");
    await ctx.db.patch(row._id, { isLeftover: args.isLeftover });
  },
});

export const remove = mutation({
  args: { date: v.string(), mealType, recipeId: v.id("recipes") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("mealPlans")
      .withIndex("by_user_date", (q) => q.eq("userId", user._id).eq("date", args.date))
      .collect();
    for (const row of rows) {
      if (row.mealType === args.mealType && row.recipeId === args.recipeId) await ctx.db.delete(row._id);
    }
  },
});

export const clearDates = mutation({
  args: { dates: v.array(v.string()) },
  handler: async (ctx, { dates }) => {
    const user = await requireUser(ctx);
    for (const date of dates) {
      const rows = await ctx.db
        .query("mealPlans")
        .withIndex("by_user_date", (q) => q.eq("userId", user._id).eq("date", date))
        .collect();
      for (const row of rows) await ctx.db.delete(row._id);
    }
  },
});
