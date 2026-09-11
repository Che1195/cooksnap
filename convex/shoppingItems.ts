import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireUser } from "./lib/auth";
import type { ShoppingItem } from "../src/types";

const MAX_TEXT = 500;

function checkText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_TEXT) throw new ConvexError(`Item text must be 1–${MAX_TEXT} characters`);
  return trimmed;
}

export const list = query({
  args: {},
  handler: async (ctx): Promise<ShoppingItem[]> => {
    const user = await requireUser(ctx);
    const rows = await ctx.db.query("shoppingItems").withIndex("by_user", (q) => q.eq("userId", user._id)).collect();
    return rows.map((r) => ({ id: r._id, text: r.text, checked: r.checked, ...(r.recipeId ? { recipeId: r.recipeId } : {}) }));
  },
});

export const add = mutation({
  args: { text: v.string() },
  handler: async (ctx, { text }): Promise<Id<"shoppingItems">> => {
    const user = await requireUser(ctx);
    return ctx.db.insert("shoppingItems", { userId: user._id, text: checkText(text), checked: false });
  },
});

export const addMany = mutation({
  args: { items: v.array(v.object({ text: v.string(), recipeId: v.optional(v.id("recipes")) })) },
  handler: async (ctx, { items }) => {
    const user = await requireUser(ctx);
    for (const item of items) {
      await ctx.db.insert("shoppingItems", { userId: user._id, text: checkText(item.text), checked: false, recipeId: item.recipeId });
    }
  },
});

export const toggle = mutation({
  args: { id: v.id("shoppingItems") },
  handler: async (ctx, { id }) => {
    const user = await requireUser(ctx);
    const row = await ctx.db.get(id);
    if (!row || row.userId !== user._id) throw new ConvexError("Item not found");
    await ctx.db.patch(id, { checked: !row.checked });
  },
});

export const updateText = mutation({
  args: { id: v.id("shoppingItems"), text: v.string() },
  handler: async (ctx, { id, text }) => {
    const user = await requireUser(ctx);
    const row = await ctx.db.get(id);
    if (!row || row.userId !== user._id) throw new ConvexError("Item not found");
    await ctx.db.patch(id, { text: checkText(text) });
  },
});

export const uncheckAll = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    for (const row of await ctx.db.query("shoppingItems").withIndex("by_user", (q) => q.eq("userId", user._id)).collect()) {
      if (row.checked) await ctx.db.patch(row._id, { checked: false });
    }
  },
});

export const clearChecked = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    for (const row of await ctx.db.query("shoppingItems").withIndex("by_user", (q) => q.eq("userId", user._id)).collect()) {
      if (row.checked) await ctx.db.delete(row._id);
    }
  },
});

export const clear = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    for (const row of await ctx.db.query("shoppingItems").withIndex("by_user", (q) => q.eq("userId", user._id)).collect()) await ctx.db.delete(row._id);
  },
});

export const restore = mutation({
  args: { items: v.array(v.object({ text: v.string(), checked: v.boolean(), recipeId: v.optional(v.id("recipes")) })) },
  handler: async (ctx, { items }) => {
    const user = await requireUser(ctx);
    for (const row of await ctx.db.query("shoppingItems").withIndex("by_user", (q) => q.eq("userId", user._id)).collect()) await ctx.db.delete(row._id);
    for (const item of items) {
      await ctx.db.insert("shoppingItems", { userId: user._id, text: checkText(item.text), checked: item.checked, recipeId: item.recipeId });
    }
  },
});
