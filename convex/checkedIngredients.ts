import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOwnedRecipe, requireUser } from "./lib/auth";

export const list = query({
  args: {},
  handler: async (ctx): Promise<Record<string, number[]>> => {
    const user = await requireUser(ctx);
    const rows = await ctx.db.query("checkedIngredients").withIndex("by_user_recipe", (q) => q.eq("userId", user._id)).collect();
    const out: Record<string, number[]> = {};
    for (const row of rows) (out[row.recipeId] ??= []).push(row.ingredientIndex);
    for (const list of Object.values(out)) list.sort((a, b) => a - b);
    return out;
  },
});

export const toggle = mutation({
  args: { recipeId: v.id("recipes"), index: v.number() },
  handler: async (ctx, { recipeId, index }) => {
    const user = await requireUser(ctx);
    await requireOwnedRecipe(ctx, user._id, recipeId);
    const rows = await ctx.db.query("checkedIngredients").withIndex("by_user_recipe", (q) => q.eq("userId", user._id).eq("recipeId", recipeId)).collect();
    const existing = rows.find((r) => r.ingredientIndex === index);
    if (existing) await ctx.db.delete(existing._id);
    else await ctx.db.insert("checkedIngredients", { userId: user._id, recipeId, ingredientIndex: index });
  },
});

export const clear = mutation({
  args: { recipeId: v.id("recipes") },
  handler: async (ctx, { recipeId }) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db.query("checkedIngredients").withIndex("by_user_recipe", (q) => q.eq("userId", user._id).eq("recipeId", recipeId)).collect();
    for (const row of rows) await ctx.db.delete(row._id);
  },
});
