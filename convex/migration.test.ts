import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import { ALICE, makeTest } from "./test.setup";

describe("migration upserts", () => {
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
