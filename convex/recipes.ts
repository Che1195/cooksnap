import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { requireOwnedRecipe, requireUser } from "./lib/auth";
import { toRecipe } from "./lib/shape";
import { difficulty } from "./schema";
import type { Recipe } from "../src/types";

const nullableText = v.optional(v.union(v.string(), v.null()));

export const list = query({
  args: {},
  handler: async (ctx): Promise<Recipe[]> => {
    const user = await requireUser(ctx);
    const docs = await ctx.db
      .query("recipes")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
    return Promise.all(
      docs.map(async (d) => toRecipe(d, d.imageStorageId ? await ctx.storage.getUrl(d.imageStorageId) : null)),
    );
  },
});

export const get = query({
  args: { id: v.id("recipes") },
  handler: async (ctx, { id }): Promise<Recipe | null> => {
    const user = await requireUser(ctx);
    const doc = await ctx.db.get(id);
    if (!doc || doc.userId !== user._id) return null;
    return toRecipe(doc, doc.imageStorageId ? await ctx.storage.getUrl(doc.imageStorageId) : null);
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    image: v.optional(v.union(v.string(), v.null())),
    ingredients: v.array(v.string()),
    instructions: v.array(v.string()),
    sourceUrl: v.string(),
    prepTime: nullableText,
    cookTime: nullableText,
    totalTime: nullableText,
    servings: nullableText,
    author: nullableText,
    cuisineType: nullableText,
    tags: v.array(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"recipes">> => {
    const user = await requireUser(ctx);
    if (args.title.trim().length === 0) throw new ConvexError("Title is required");
    return ctx.db.insert("recipes", {
      userId: user._id,
      title: args.title,
      image: args.image ?? undefined,
      ingredients: args.ingredients,
      instructions: args.instructions,
      sourceUrl: args.sourceUrl,
      prepTime: args.prepTime ?? undefined,
      cookTime: args.cookTime ?? undefined,
      totalTime: args.totalTime ?? undefined,
      servings: args.servings ?? undefined,
      author: args.author ?? undefined,
      cuisineType: args.cuisineType ?? undefined,
      tags: args.tags,
      isFavorite: false,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("recipes"),
    updates: v.object({
      title: v.optional(v.string()),
      image: v.optional(v.union(v.string(), v.null())),
      ingredients: v.optional(v.array(v.string())),
      instructions: v.optional(v.array(v.string())),
      tags: v.optional(v.array(v.string())),
      prepTime: nullableText,
      cookTime: nullableText,
      totalTime: nullableText,
      servings: nullableText,
      author: nullableText,
      cuisineType: nullableText,
      difficulty: v.optional(v.union(difficulty, v.null())),
      rating: v.optional(v.union(v.number(), v.null())),
      isFavorite: v.optional(v.boolean()),
      notes: nullableText,
    }),
  },
  handler: async (ctx, { id, updates }) => {
    const user = await requireUser(ctx);
    await requireOwnedRecipe(ctx, user._id, id);
    if (updates.rating !== undefined && updates.rating !== null && (updates.rating < 1 || updates.rating > 5 || !Number.isInteger(updates.rating))) {
      throw new ConvexError("Rating must be 1–5");
    }
    if (updates.title !== undefined && updates.title.trim().length === 0) throw new ConvexError("Title is required");
    function normalize<T>(value: T | null | undefined): T | undefined {
      return value === null ? undefined : value;
    }
    const patch = {
      ...(updates.title !== undefined && { title: updates.title }),
      ...(updates.image !== undefined && { image: normalize(updates.image) }),
      ...(updates.ingredients !== undefined && { ingredients: updates.ingredients }),
      ...(updates.instructions !== undefined && { instructions: updates.instructions }),
      ...(updates.tags !== undefined && { tags: updates.tags }),
      ...(updates.prepTime !== undefined && { prepTime: normalize(updates.prepTime) }),
      ...(updates.cookTime !== undefined && { cookTime: normalize(updates.cookTime) }),
      ...(updates.totalTime !== undefined && { totalTime: normalize(updates.totalTime) }),
      ...(updates.servings !== undefined && { servings: normalize(updates.servings) }),
      ...(updates.author !== undefined && { author: normalize(updates.author) }),
      ...(updates.cuisineType !== undefined && { cuisineType: normalize(updates.cuisineType) }),
      ...(updates.difficulty !== undefined && { difficulty: normalize(updates.difficulty) }),
      ...(updates.rating !== undefined && { rating: normalize(updates.rating) }),
      ...(updates.isFavorite !== undefined && { isFavorite: updates.isFavorite }),
      ...(updates.notes !== undefined && { notes: normalize(updates.notes) }),
    };
    await ctx.db.patch(id, patch);
  },
});

export const setTags = mutation({
  args: { id: v.id("recipes"), tags: v.array(v.string()) },
  handler: async (ctx, { id, tags }) => {
    const user = await requireUser(ctx);
    await requireOwnedRecipe(ctx, user._id, id);
    await ctx.db.patch(id, { tags });
  },
});

export async function cascadeDeleteRecipe(ctx: MutationCtx, recipeId: Id<"recipes">): Promise<void> {
  const recipe = await ctx.db.get(recipeId);
  if (!recipe) return;
  for (const row of await ctx.db.query("mealPlans").withIndex("by_recipe", (q) => q.eq("recipeId", recipeId)).collect()) await ctx.db.delete(row._id);
  for (const row of await ctx.db.query("checkedIngredients").withIndex("by_recipe", (q) => q.eq("recipeId", recipeId)).collect()) await ctx.db.delete(row._id);
  for (const row of await ctx.db.query("recipeGroupMembers").withIndex("by_recipe", (q) => q.eq("recipeId", recipeId)).collect()) await ctx.db.delete(row._id);
  for (const row of await ctx.db.query("shoppingItems").withIndex("by_recipe", (q) => q.eq("recipeId", recipeId)).collect()) await ctx.db.patch(row._id, { recipeId: undefined });
  if (recipe.imageStorageId) await ctx.storage.delete(recipe.imageStorageId);
  await ctx.db.delete(recipeId);
}

export const remove = mutation({
  args: { id: v.id("recipes") },
  handler: async (ctx, { id }) => {
    const user = await requireUser(ctx);
    await requireOwnedRecipe(ctx, user._id, id);
    await cascadeDeleteRecipe(ctx, id);
  },
});
