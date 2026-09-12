import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export type Ctx = QueryCtx | MutationCtx;

export async function requireUser(ctx: Ctx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Unauthenticated");
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
    .unique();
  if (!user) throw new ConvexError("User not provisioned");
  return user;
}

export async function requireOwnedRecipe(
  ctx: Ctx,
  userId: Id<"users">,
  recipeId: Id<"recipes">,
): Promise<Doc<"recipes">> {
  const recipe = await ctx.db.get(recipeId);
  if (!recipe || recipe.userId !== userId) throw new ConvexError("Recipe not found");
  return recipe;
}
