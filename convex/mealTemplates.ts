import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireOwnedRecipe, requireUser } from "./lib/auth";
import { isoFromCreation } from "./lib/shape";
import { mealPlanDay } from "./schema";
import { assignInternal } from "./mealPlans";
import type { MealPlanDay, MealTemplate } from "../src/types";

const SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const;

export const list = query({
  args: {},
  handler: async (ctx): Promise<MealTemplate[]> => {
    const user = await requireUser(ctx);
    const docs = await ctx.db.query("mealTemplates").withIndex("by_user", (q) => q.eq("userId", user._id)).order("desc").collect();
    return docs.map((d) => ({
      id: d._id,
      name: d.name,
      days: Object.fromEntries(Object.entries(d.days).map(([k, day]) => [Number(k), day])) as Record<number, MealPlanDay>,
      createdAt: isoFromCreation(d._creationTime),
    }));
  },
});

export const save = mutation({
  args: { name: v.string(), days: v.record(v.string(), mealPlanDay) },
  handler: async (ctx, { name, days }): Promise<Id<"mealTemplates">> => {
    const user = await requireUser(ctx);
    if (name.trim().length === 0) throw new ConvexError("Template name is required");
    const recipeIds = new Set(Object.values(days).flatMap((day) => SLOTS.flatMap((slot) => day[slot].map((entry) => entry.recipeId))));
    for (const value of recipeIds) {
      const recipeId = ctx.db.normalizeId("recipes", value);
      if (!recipeId) throw new ConvexError("Recipe not found");
      await requireOwnedRecipe(ctx, user._id, recipeId);
    }
    return ctx.db.insert("mealTemplates", { userId: user._id, name: name.trim(), days });
  },
});

export const apply = mutation({
  args: { templateId: v.id("mealTemplates"), weekDates: v.array(v.string()) },
  handler: async (ctx, { templateId, weekDates }) => {
    const user = await requireUser(ctx);
    const template = await ctx.db.get(templateId);
    if (!template || template.userId !== user._id) throw new ConvexError("Template not found");
    for (const [index, day] of Object.entries(template.days)) {
      const date = weekDates[Number(index)];
      if (!date) continue;
      for (const slot of SLOTS) {
        for (const entry of day[slot]) {
          const recipeId = ctx.db.normalizeId("recipes", entry.recipeId);
          if (!recipeId) continue;
          const recipe = await ctx.db.get(recipeId);
          if (!recipe || recipe.userId !== user._id) continue;
          await assignInternal(ctx, user._id, { date, mealType: slot, recipeId, isLeftover: entry.isLeftover });
        }
      }
    }
  },
});

export const remove = mutation({
  args: { id: v.id("mealTemplates") },
  handler: async (ctx, { id }) => {
    const user = await requireUser(ctx);
    const doc = await ctx.db.get(id);
    if (!doc || doc.userId !== user._id) throw new ConvexError("Template not found");
    await ctx.db.delete(id);
  },
});
