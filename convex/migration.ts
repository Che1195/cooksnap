import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { difficulty, mealPlanDay, mealType } from "./schema";

async function userByLegacy(ctx: MutationCtx, legacyId: string): Promise<Id<"users">> {
  const user = await ctx.db.query("users").withIndex("by_legacyId", (q) => q.eq("legacyId", legacyId)).unique();
  if (!user) throw new Error(`No migrated user for legacy id ${legacyId}`);
  return user._id;
}

async function recipeByLegacy(ctx: MutationCtx, legacyId: string): Promise<Id<"recipes">> {
  const recipe = await ctx.db.query("recipes").withIndex("by_legacyId", (q) => q.eq("legacyId", legacyId)).unique();
  if (!recipe) throw new Error(`No migrated recipe for legacy id ${legacyId}`);
  return recipe._id;
}

export const upsertUser = internalMutation({
  args: { legacyId: v.string(), email: v.string() },
  handler: async (ctx, { legacyId, email }): Promise<Id<"users"> | null> => {
    const byLegacy = await ctx.db.query("users").withIndex("by_legacyId", (q) => q.eq("legacyId", legacyId)).unique();
    if (byLegacy) return byLegacy._id;
    const byEmail = await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", email.toLowerCase())).unique();
    if (!byEmail) return null;
    await ctx.db.patch(byEmail._id, { legacyId });
    return byEmail._id;
  },
});

export const upsertRecipe = internalMutation({
  args: {
    legacyId: v.string(),
    userLegacyId: v.string(),
    title: v.string(),
    image: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
    sourceUrl: v.string(),
    prepTime: v.optional(v.string()),
    cookTime: v.optional(v.string()),
    totalTime: v.optional(v.string()),
    servings: v.optional(v.string()),
    author: v.optional(v.string()),
    cuisineType: v.optional(v.string()),
    difficulty: v.optional(difficulty),
    rating: v.optional(v.number()),
    isFavorite: v.boolean(),
    notes: v.optional(v.string()),
    ingredients: v.array(v.string()),
    instructions: v.array(v.string()),
    tags: v.array(v.string()),
    createdAt: v.string(),
  },
  handler: async (ctx, { legacyId, userLegacyId, createdAt: _createdAt, ...fields }): Promise<Id<"recipes">> => {
    const userId = await userByLegacy(ctx, userLegacyId);
    const existing = await ctx.db.query("recipes").withIndex("by_legacyId", (q) => q.eq("legacyId", legacyId)).unique();
    if (existing) {
      await ctx.db.patch(existing._id, { ...fields, userId });
      return existing._id;
    }
    return ctx.db.insert("recipes", { ...fields, userId, legacyId });
  },
});

export const findRecipeByLegacyId = internalMutation({
  args: { legacyId: v.string() },
  handler: async (ctx, { legacyId }): Promise<Id<"recipes"> | null> => {
    const r = await ctx.db.query("recipes").withIndex("by_legacyId", (q) => q.eq("legacyId", legacyId)).unique();
    return r?._id ?? null;
  },
});

export const upsertMealPlan = internalMutation({
  args: { userLegacyId: v.string(), recipeLegacyId: v.string(), date: v.string(), mealType, isLeftover: v.boolean(), position: v.number() },
  handler: async (ctx, args): Promise<boolean> => {
    const userId = await userByLegacy(ctx, args.userLegacyId);
    const recipeId = await recipeByLegacy(ctx, args.recipeLegacyId);
    const rows = await ctx.db.query("mealPlans").withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", args.date)).collect();
    if (rows.some((r) => r.mealType === args.mealType && r.recipeId === recipeId)) return false;
    await ctx.db.insert("mealPlans", { userId, recipeId, date: args.date, mealType: args.mealType, isLeftover: args.isLeftover, position: args.position });
    return true;
  },
});

export const upsertGroup = internalMutation({
  args: { legacyId: v.string(), userLegacyId: v.string(), name: v.string(), icon: v.optional(v.string()), sortOrder: v.number(), isDefault: v.boolean() },
  handler: async (ctx, { legacyId, userLegacyId, ...fields }): Promise<Id<"recipeGroups">> => {
    const userId = await userByLegacy(ctx, userLegacyId);
    const existing = await ctx.db.query("recipeGroups").withIndex("by_legacyId", (q) => q.eq("legacyId", legacyId)).unique();
    if (existing) {
      await ctx.db.patch(existing._id, { ...fields, userId });
      return existing._id;
    }
    return ctx.db.insert("recipeGroups", { ...fields, userId, legacyId });
  },
});

export const upsertGroupMember = internalMutation({
  args: { groupLegacyId: v.string(), recipeLegacyId: v.string() },
  handler: async (ctx, { groupLegacyId, recipeLegacyId }) => {
    const group = await ctx.db.query("recipeGroups").withIndex("by_legacyId", (q) => q.eq("legacyId", groupLegacyId)).unique();
    if (!group) throw new Error(`No migrated group for legacy id ${groupLegacyId}`);
    const recipeId = await recipeByLegacy(ctx, recipeLegacyId);
    const rows = await ctx.db.query("recipeGroupMembers").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect();
    if (rows.some((r) => r.recipeId === recipeId)) return;
    await ctx.db.insert("recipeGroupMembers", { groupId: group._id, recipeId });
  },
});

export const upsertIssueReportMember = internalMutation({
  args: { userLegacyId: v.string() },
  handler: async (ctx, { userLegacyId }) => {
    const userId = await userByLegacy(ctx, userLegacyId);
    const existing = await ctx.db.query("issueReportMembers").withIndex("by_user", (q) => q.eq("userId", userId)).unique();
    if (!existing) await ctx.db.insert("issueReportMembers", { userId });
  },
});

export const upsertTemplate = internalMutation({
  args: { legacyId: v.string(), userLegacyId: v.string(), name: v.string(), days: v.record(v.string(), mealPlanDay) },
  handler: async (ctx, { legacyId, userLegacyId, name, days }) => {
    const userId = await userByLegacy(ctx, userLegacyId);
    const all = await ctx.db.query("mealTemplates").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
    const existing = all.find((t) => t.legacyId === legacyId);
    if (existing) {
      await ctx.db.patch(existing._id, { name, days });
      return existing._id;
    }
    return ctx.db.insert("mealTemplates", { userId, name, days, legacyId });
  },
});
