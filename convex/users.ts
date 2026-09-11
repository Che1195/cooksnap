import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { isoFromCreation } from "./lib/shape";
import type { Profile } from "../src/types";

export const ensure = mutation({
  args: {},
  handler: async (ctx): Promise<Id<"users">> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Unauthenticated");
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    const email = (identity.email ?? "").toLowerCase();
    const avatarUrl = identity.pictureUrl ?? undefined;
    if (existing) {
      if (existing.email !== email || existing.avatarUrl !== avatarUrl) {
        await ctx.db.patch(existing._id, { email, avatarUrl });
      }
      return existing._id;
    }
    return ctx.db.insert("users", {
      clerkId: identity.subject,
      email,
      displayName: identity.name ?? undefined,
      avatarUrl,
    });
  },
});

export const current = query({
  args: {},
  handler: async (ctx): Promise<Profile | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) return null;
    return {
      id: user._id,
      email: user.email,
      displayName: user.displayName ?? null,
      avatarUrl: user.avatarUrl ?? null,
      createdAt: isoFromCreation(user._creationTime),
      updatedAt: isoFromCreation(user._creationTime),
    };
  },
});

export const updateDisplayName = mutation({
  args: { displayName: v.string() },
  handler: async (ctx, { displayName }) => {
    const user = await requireUser(ctx);
    const trimmed = displayName.trim();
    if (trimmed.length === 0 || trimmed.length > 80) throw new ConvexError("Display name must be 1–80 characters");
    await ctx.db.patch(user._id, { displayName: trimmed });
  },
});

export const isIssueMember = query({
  args: {},
  handler: async (ctx): Promise<boolean> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return false;
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) return false;
    const member = await ctx.db
      .query("issueReportMembers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    return member !== null;
  },
});

export async function purgeUser(ctx: MutationCtx, userId: Id<"users">): Promise<void> {
  const recipes = await ctx.db.query("recipes").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
  for (const recipe of recipes) {
    for (const m of await ctx.db.query("recipeGroupMembers").withIndex("by_recipe", (q) => q.eq("recipeId", recipe._id)).collect()) {
      await ctx.db.delete(m._id);
    }
    for (const c of await ctx.db.query("checkedIngredients").withIndex("by_recipe", (q) => q.eq("recipeId", recipe._id)).collect()) {
      await ctx.db.delete(c._id);
    }
    if (recipe.imageStorageId) await ctx.storage.delete(recipe.imageStorageId);
    await ctx.db.delete(recipe._id);
  }
  const mealPlans = await ctx.db.query("mealPlans").withIndex("by_user_date", (q) => q.eq("userId", userId)).collect();
  for (const plan of mealPlans) await ctx.db.delete(plan._id);
  const checkedIngredients = await ctx.db.query("checkedIngredients").withIndex("by_user_recipe", (q) => q.eq("userId", userId)).collect();
  for (const ingredient of checkedIngredients) await ctx.db.delete(ingredient._id);
  for (const table of ["mealTemplates", "shoppingItems", "groceryItems", "recipeGroups", "issueReportMembers"] as const) {
    const rows = await ctx.db.query(table).withIndex("by_user", (q) => q.eq("userId", userId)).collect();
    for (const row of rows) await ctx.db.delete(row._id);
  }
  const reports = await ctx.db.query("issueReports").collect();
  for (const r of reports) {
    if (r.reporterId === userId) await ctx.db.patch(r._id, { reporterId: undefined, reporterEmail: undefined });
  }
  await ctx.db.delete(userId);
}

export const deleteAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    await purgeUser(ctx, user._id);
    return { deleted: true as const };
  },
});
