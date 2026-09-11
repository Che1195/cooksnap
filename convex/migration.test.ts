import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import { ALICE, makeTest } from "./test.setup";

describe("migration upserts", () => {
  it("refuses to replace an already-linked user's legacyId", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    const userId = await alice.mutation(api.users.ensure, {});
    await t.mutation(internal.migration.upsertUser, { legacyId: "sb-1", email: "alice@example.com" });
    await expect(t.mutation(internal.migration.upsertUser, { legacyId: "sb-2", email: "alice@example.com" })).rejects.toThrow("User alice@example.com is already linked to legacy id sb-1");
    expect((await t.run((ctx) => ctx.db.get(userId)))?.legacyId).toBe("sb-1");
  });

  it("removes omitted recipe notes but retains imageStorageId on rerun", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    await alice.mutation(api.users.ensure, {});
    await t.mutation(internal.migration.upsertUser, { legacyId: "sb-1", email: "alice@example.com" });
    const imageStorageId = await t.run((ctx) => ctx.storage.store(new Blob(["x"])));
    const base = { legacyId: "r-1", userLegacyId: "sb-1", title: "Pasta", sourceUrl: "", isFavorite: true, ingredients: ["a"], instructions: ["b"], tags: ["dinner"], createdAt: "2026-02-25T00:00:00Z" };
    const id = await t.mutation(internal.migration.upsertRecipe, { ...base, notes: "x", imageStorageId });
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({ notes: "x", imageStorageId });
    expect(await t.mutation(internal.migration.upsertRecipe, base)).toBe(id);
    const recipe = await t.run((ctx) => ctx.db.get(id));
    expect(recipe).not.toHaveProperty("notes");
    expect(recipe?.imageStorageId).toBe(imageStorageId);
  });

  it("removes an omitted group icon on rerun", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    await alice.mutation(api.users.ensure, {});
    await t.mutation(internal.migration.upsertUser, { legacyId: "sb-1", email: "alice@example.com" });
    const base = { legacyId: "g-1", userLegacyId: "sb-1", name: "Favorites", sortOrder: 0, isDefault: true };
    const id = await t.mutation(internal.migration.upsertGroup, { ...base, icon: "🍜" });
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({ icon: "🍜" });
    expect(await t.mutation(internal.migration.upsertGroup, base)).toBe(id);
    expect(await t.run((ctx) => ctx.db.get(id))).not.toHaveProperty("icon");
  });

  it("upsertIssueReportMember is idempotent", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    const userId = await alice.mutation(api.users.ensure, {});
    await t.mutation(internal.migration.upsertUser, { legacyId: "sb-1", email: "alice@example.com" });
    await t.mutation(internal.migration.upsertIssueReportMember, { userLegacyId: "sb-1" });
    await t.mutation(internal.migration.upsertIssueReportMember, { userLegacyId: "sb-1" });
    expect(await t.run((ctx) => ctx.db.query("issueReportMembers").collect())).toEqual([expect.objectContaining({ userId })]);
  });

  it("upsertTemplate updates the name for an existing legacyId", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    await alice.mutation(api.users.ensure, {});
    await t.mutation(internal.migration.upsertUser, { legacyId: "sb-1", email: "alice@example.com" });
    const base = { legacyId: "t-1", userLegacyId: "sb-1", name: "Weeknight", days: {} };
    const id = await t.mutation(internal.migration.upsertTemplate, base);
    expect(await t.mutation(internal.migration.upsertTemplate, { ...base, name: "Weekend" })).toBe(id);
    expect(await t.run((ctx) => ctx.db.query("mealTemplates").collect())).toEqual([expect.objectContaining({ _id: id, legacyId: "t-1", name: "Weekend" })]);
  });

  it("findRecipeByLegacyId returns the migrated id or null", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    await alice.mutation(api.users.ensure, {});
    await t.mutation(internal.migration.upsertUser, { legacyId: "sb-1", email: "alice@example.com" });
    const id = await t.mutation(internal.migration.upsertRecipe, { legacyId: "r-1", userLegacyId: "sb-1", title: "Pasta", sourceUrl: "", isFavorite: true, ingredients: ["a"], instructions: ["b"], tags: ["dinner"], createdAt: "2026-02-25T00:00:00Z" });
    expect(await t.mutation(internal.migration.findRecipeByLegacyId, { legacyId: "r-1" })).toBe(id);
    expect(await t.mutation(internal.migration.findRecipeByLegacyId, { legacyId: "unknown" })).toBeNull();
  });

  it("links a legacy user by email and is idempotent on legacyId", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    await alice.mutation(api.users.ensure, {});
    expect(await t.mutation(internal.migration.upsertUser, { legacyId: "sb-1", email: "nobody@example.com" })).toBeNull();
    const u1 = await t.mutation(internal.migration.upsertUser, { legacyId: "sb-1", email: "alice@example.com" });
    const u2 = await t.mutation(internal.migration.upsertUser, { legacyId: "sb-1", email: "alice@example.com" });
    expect(u1).toBe(u2);
    const base = { legacyId: "r-1", userLegacyId: "sb-1", title: "Pasta", sourceUrl: "", isFavorite: true, ingredients: ["a"], instructions: ["b"], tags: ["dinner"], createdAt: "2026-02-25T00:00:00Z" };
    const r1 = await t.mutation(internal.migration.upsertRecipe, base);
    const r2 = await t.mutation(internal.migration.upsertRecipe, { ...base, title: "Pasta v2" });
    expect(r1).toBe(r2);
    expect((await alice.query(api.recipes.list, {}))[0].title).toBe("Pasta v2");
    const g = await t.mutation(internal.migration.upsertGroup, { legacyId: "g-1", userLegacyId: "sb-1", name: "Favorites", sortOrder: 0, isDefault: true });
    await t.mutation(internal.migration.upsertGroupMember, { groupLegacyId: "g-1", recipeLegacyId: "r-1" });
    await t.mutation(internal.migration.upsertGroupMember, { groupLegacyId: "g-1", recipeLegacyId: "r-1" });
    expect((await alice.query(api.recipeGroups.members, {}))[g]).toEqual([r1]);
    expect(await t.mutation(internal.migration.upsertMealPlan, { userLegacyId: "sb-1", recipeLegacyId: "r-1", date: "2026-03-02", mealType: "dinner", isLeftover: false, position: 0 })).toBe(true);
    expect(await t.mutation(internal.migration.upsertMealPlan, { userLegacyId: "sb-1", recipeLegacyId: "r-1", date: "2026-03-02", mealType: "dinner", isLeftover: false, position: 0 })).toBe(false);
  });
});
