import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireOwnedRecipe, requireUser } from "./lib/auth";

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
    const url = await ctx.storage.getUrl(storageId);
    if (!url) throw new ConvexError("Uploaded file not found");
    if (recipe.imageStorageId && recipe.imageStorageId !== storageId) {
      await ctx.storage.delete(recipe.imageStorageId);
    }
    await ctx.db.patch(recipeId, { imageStorageId: storageId, image: url });
    return url;
  },
});
