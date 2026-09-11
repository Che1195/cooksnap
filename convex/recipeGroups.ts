import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireOwnedRecipe, requireUser } from "./lib/auth";
import { toGroup } from "./lib/shape";
import type { RecipeGroup } from "../src/types";

async function requireOwnedGroup(ctx: Parameters<typeof requireUser>[0], userId: Id<"users">, groupId: Id<"recipeGroups">): Promise<Doc<"recipeGroups">> {
  const group = await ctx.db.get(groupId);
  if (!group || group.userId !== userId) throw new ConvexError("Group not found");
  return group;
}

export const list = query({
  args: {},
  handler: async (ctx): Promise<RecipeGroup[]> => {
    const user = await requireUser(ctx);
    const docs = await ctx.db.query("recipeGroups").withIndex("by_user", (q) => q.eq("userId", user._id)).collect();
    return docs.sort((a, b) => a.sortOrder - b.sortOrder || a._creationTime - b._creationTime).map(toGroup);
  },
});

export const members = query({
  args: {},
  handler: async (ctx): Promise<Record<string, string[]>> => {
    const user = await requireUser(ctx);
    const groups = await ctx.db.query("recipeGroups").withIndex("by_user", (q) => q.eq("userId", user._id)).collect();
    const out: Record<string, string[]> = {};
    for (const g of groups) {
      const rows = await ctx.db.query("recipeGroupMembers").withIndex("by_group", (q) => q.eq("groupId", g._id)).collect();
      if (rows.length > 0) out[g._id] = rows.map((r) => r.recipeId);
    }
    return out;
  },
});

export const ensureDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const groups = await ctx.db.query("recipeGroups").withIndex("by_user", (q) => q.eq("userId", user._id)).collect();
    if (groups.some((g) => g.isDefault)) return;
    await ctx.db.insert("recipeGroups", { userId: user._id, name: "Favorites", sortOrder: 0, isDefault: true });
  },
});

export const create = mutation({
  args: { name: v.string(), icon: v.optional(v.string()) },
  handler: async (ctx, { name, icon }): Promise<Id<"recipeGroups">> => {
    const user = await requireUser(ctx);
    if (name.trim().length === 0 || name.length > 60) throw new ConvexError("Group name must be 1–60 characters");
    const groups = await ctx.db.query("recipeGroups").withIndex("by_user", (q) => q.eq("userId", user._id)).collect();
    const sortOrder = groups.reduce((m, g) => Math.max(m, g.sortOrder + 1), 0);
    return ctx.db.insert("recipeGroups", { userId: user._id, name: name.trim(), icon, sortOrder, isDefault: false });
  },
});

export const update = mutation({
  args: { id: v.id("recipeGroups"), updates: v.object({ name: v.optional(v.string()), icon: v.optional(v.union(v.string(), v.null())), sortOrder: v.optional(v.number()) }) },
  handler: async (ctx, { id, updates }) => {
    const user = await requireUser(ctx);
    await requireOwnedGroup(ctx, user._id, id);
    await ctx.db.patch(id, {
      ...(updates.name !== undefined && { name: updates.name.trim() }),
      ...(updates.icon !== undefined && { icon: updates.icon ?? undefined }),
      ...(updates.sortOrder !== undefined && { sortOrder: updates.sortOrder }),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("recipeGroups") },
  handler: async (ctx, { id }) => {
    const user = await requireUser(ctx);
    const group = await requireOwnedGroup(ctx, user._id, id);
    if (group.isDefault) throw new ConvexError("The default group cannot be deleted");
    for (const row of await ctx.db.query("recipeGroupMembers").withIndex("by_group", (q) => q.eq("groupId", id)).collect()) await ctx.db.delete(row._id);
    await ctx.db.delete(id);
  },
});

export const addRecipe = mutation({
  args: { groupId: v.id("recipeGroups"), recipeId: v.id("recipes") },
  handler: async (ctx, { groupId, recipeId }) => {
    const user = await requireUser(ctx);
    await requireOwnedGroup(ctx, user._id, groupId);
    await requireOwnedRecipe(ctx, user._id, recipeId);
    const rows = await ctx.db.query("recipeGroupMembers").withIndex("by_group", (q) => q.eq("groupId", groupId)).collect();
    if (rows.some((r) => r.recipeId === recipeId)) return;
    await ctx.db.insert("recipeGroupMembers", { groupId, recipeId });
  },
});

export const removeRecipe = mutation({
  args: { groupId: v.id("recipeGroups"), recipeId: v.id("recipes") },
  handler: async (ctx, { groupId, recipeId }) => {
    const user = await requireUser(ctx);
    await requireOwnedGroup(ctx, user._id, groupId);
    const rows = await ctx.db.query("recipeGroupMembers").withIndex("by_group", (q) => q.eq("groupId", groupId)).collect();
    for (const row of rows) if (row.recipeId === recipeId) await ctx.db.delete(row._id);
  },
});
