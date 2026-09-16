import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { interpretationValidator } from "./lib/interpretation";

export const difficulty = v.union(v.literal("Easy"), v.literal("Medium"), v.literal("Hard"));
export const mealType = v.union(
  v.literal("breakfast"),
  v.literal("lunch"),
  v.literal("dinner"),
  v.literal("snack"),
);
export const severity = v.union(v.literal("low"), v.literal("medium"), v.literal("high"));
export const issueStatus = v.union(
  v.literal("open"),
  v.literal("in_progress"),
  v.literal("resolved"),
);
export const mealSlotEntry = v.object({
  recipeId: v.string(),
  isLeftover: v.boolean(),
  position: v.number(),
});
export const mealPlanDay = v.object({
  breakfast: v.array(mealSlotEntry),
  lunch: v.array(mealSlotEntry),
  dinner: v.array(mealSlotEntry),
  snack: v.array(mealSlotEntry),
});

export const recipeFields = {
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
  interpretation: v.optional(interpretationValidator),
  tags: v.array(v.string()),
};

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    email: v.string(),
    displayName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    reviewBeforeSaving: v.optional(v.boolean()),
    legacyId: v.optional(v.string()),
  })
    .index("by_clerkId", ["clerkId"])
    .index("by_email", ["email"])
    .index("by_legacyId", ["legacyId"]),

  recipes: defineTable({
    userId: v.id("users"),
    ...recipeFields,
    legacyId: v.optional(v.string()),
    importId: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_user_import", ["userId", "importId"])
    .index("by_legacyId", ["legacyId"])
    .index("by_imageStorageId", ["imageStorageId"]),

  importAttempts: defineTable({
    userId: v.id("users"),
    idempotencyKey: v.string(),
    month: v.string(),
    reservedMicros: v.number(),
  })
    .index("by_user_key", ["userId", "idempotencyKey"])
    .index("by_user", ["userId"]),

  importBudgets: defineTable({
    month: v.string(),
    reservedMicros: v.number(),
  }).index("by_month", ["month"]),

  mealPlans: defineTable({
    userId: v.id("users"),
    date: v.string(), // YYYY-MM-DD
    mealType,
    recipeId: v.id("recipes"),
    isLeftover: v.boolean(),
    position: v.number(),
  })
    .index("by_user_date", ["userId", "date"])
    .index("by_recipe", ["recipeId"]),

  mealTemplates: defineTable({
    userId: v.id("users"),
    name: v.string(),
    days: v.record(v.string(), mealPlanDay), // key = weekday index "0".."6"
    legacyId: v.optional(v.string()),
  }).index("by_user", ["userId"]),

  shoppingItems: defineTable({
    userId: v.id("users"),
    text: v.string(),
    checked: v.boolean(),
    recipeId: v.optional(v.id("recipes")),
  })
    .index("by_user", ["userId"])
    .index("by_recipe", ["recipeId"]),

  groceryItems: defineTable({
    userId: v.id("users"),
    text: v.string(),
    checked: v.boolean(),
  }).index("by_user", ["userId"]),

  checkedIngredients: defineTable({
    userId: v.id("users"),
    recipeId: v.id("recipes"),
    ingredientIndex: v.number(),
  })
    .index("by_user_recipe", ["userId", "recipeId"])
    .index("by_recipe", ["recipeId"]),

  recipeGroups: defineTable({
    userId: v.id("users"),
    name: v.string(),
    icon: v.optional(v.string()),
    sortOrder: v.number(),
    isDefault: v.boolean(),
    legacyId: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_legacyId", ["legacyId"]),

  recipeGroupMembers: defineTable({
    groupId: v.id("recipeGroups"),
    recipeId: v.id("recipes"),
  })
    .index("by_group", ["groupId"])
    .index("by_recipe", ["recipeId"]),

  issueReports: defineTable({
    reporterId: v.optional(v.id("users")),
    reporterEmail: v.optional(v.string()),
    title: v.string(),
    description: v.string(),
    steps: v.optional(v.string()),
    expected: v.optional(v.string()),
    actual: v.optional(v.string()),
    pageUrl: v.optional(v.string()),
    severity,
    status: issueStatus,
    legacyId: v.optional(v.string()),
  })
    .index("by_status", ["status"])
    .index("by_legacyId", ["legacyId"]),

  issueReportMembers: defineTable({
    userId: v.id("users"),
  }).index("by_user", ["userId"]),
});
