import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { requireOwnedRecipe, requireUser } from "./lib/auth";

/** Every recipe that currently points at this storage file. */
async function recipesReferencing(ctx: MutationCtx, storageId: Id<"_storage">) {
  return ctx.db
    .query("recipes")
    .withIndex("by_imageStorageId", (q) => q.eq("imageStorageId", storageId))
    .collect();
}

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx): Promise<string> => {
    await requireUser(ctx);
    return ctx.storage.generateUploadUrl();
  },
});

export const attach = mutation({
  args: { recipeId: v.id("recipes"), storageId: v.id("_storage") },
  handler: async (ctx, { recipeId, storageId }): Promise<string> => {
    const user = await requireUser(ctx);
    const recipe = await requireOwnedRecipe(ctx, user._id, recipeId);
    // Upload URLs are unguessable but not owner-bound, so a leaked storage id
    // must not become a second reference from another account's recipe: the
    // first delete would then break the other user's image.
    const referencing = await recipesReferencing(ctx, storageId);
    if (referencing.some((r) => r.userId !== user._id)) throw new ConvexError("File not found");
    const url = await ctx.storage.getUrl(storageId);
    if (!url) throw new ConvexError("Uploaded file not found");
    if (recipe.imageStorageId && recipe.imageStorageId !== storageId) {
      await ctx.storage.delete(recipe.imageStorageId);
    }
    await ctx.db.patch(recipeId, { imageStorageId: storageId, image: url });
    return url;
  },
});

/**
 * Drops an uploaded file that never got attached, so a failed `attach` does
 * not leave the blob behind. A file some recipe already points at is left
 * alone — this is cleanup, not a delete API.
 */
export const discard = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    await requireUser(ctx);
    const referencing = await recipesReferencing(ctx, storageId);
    if (referencing.length > 0) return;
    await ctx.storage.delete(storageId);
  },
});
