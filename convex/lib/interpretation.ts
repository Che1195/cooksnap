import { v } from "convex/values";

const span = { start: v.number(), end: v.number(), text: v.string() };
const quantity = {
  ...span,
  role: v.union(v.literal("amount"), v.literal("package"), v.literal("equivalent")),
  value: v.number(),
  max: v.optional(v.number()),
};

/** Structural boundary; source/quantity invariants are checked before storage. */
export const interpretationValidator = v.object({
  version: v.literal(1),
  sourceFingerprint: v.string(),
  ingredients: v.array(v.object({
    id: v.string(),
    index: v.number(),
    name: v.string(),
    aliases: v.array(v.string()),
    nameSpan: v.optional(v.object(span)),
    quantities: v.array(v.object(quantity)),
  })),
  instructions: v.array(v.object({
    index: v.number(),
    references: v.array(v.object({ ...span, ingredientId: v.string() })),
    quantities: v.array(v.object({ ...quantity, ingredientId: v.string() })),
  })),
});
