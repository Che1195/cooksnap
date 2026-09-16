import { mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { requireUser } from "./lib/auth";
import { CAPTURE_RESERVED_MICROS } from "../src/lib/recipe-capture-policy";

// Never refund reservations: only this fixed upper bound is accepted, even when
// called directly by a client. Includes reasoning in the output-token budget.
export const reserve = mutation({
  args: { importId: v.string() },
  handler: async (ctx, { importId }) => {
    const user = await requireUser(ctx);
    if (!/^[a-zA-Z0-9_-]{16,100}$/.test(importId))
      throw new ConvexError("Invalid import ID");
    if (
      await ctx.db
        .query("importAttempts")
        .withIndex("by_user_key", (q) =>
          q.eq("userId", user._id).eq("idempotencyKey", importId),
        )
        .unique()
    ) {
      return { allowed: false, reason: "duplicate", retryAfter: 0 };
    }
    const now = Date.now();
    const recent = await ctx.db
      .query("importAttempts")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .filter((q) => q.gte(q.field("_creationTime"), now - 86_400_000))
      .collect();
    if (
      recent.length >= 20 ||
      recent.filter((a) => a._creationTime > now - 60_000).length >= 3
    ) {
      return {
        allowed: false,
        reason: "rate",
        retryAfter: recent.length >= 20 ? 86400 : 60,
      };
    }
    const month = new Date(now).toISOString().slice(0, 7);
    const budget = await ctx.db
      .query("importBudgets")
      .withIndex("by_month", (q) => q.eq("month", month))
      .unique();
    const reservedMicros = (budget?.reservedMicros ?? 0) + CAPTURE_RESERVED_MICROS;
    if (reservedMicros > 5_000_000)
      return { allowed: false, reason: "budget", retryAfter: 86400 };
    if (budget) await ctx.db.patch(budget._id, { reservedMicros });
    else await ctx.db.insert("importBudgets", { month, reservedMicros });
    await ctx.db.insert("importAttempts", {
      userId: user._id,
      idempotencyKey: importId,
      month,
      reservedMicros: CAPTURE_RESERVED_MICROS,
    });
    return { allowed: true, reason: "admitted", retryAfter: 0 };
  },
});
