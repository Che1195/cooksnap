import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { ALICE, BOB, makeTest } from "./test.setup";

describe("users", () => {
  it("ensure creates once and is idempotent", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    const id1 = await alice.mutation(api.users.ensure, {});
    const id2 = await alice.mutation(api.users.ensure, {});
    expect(id1).toBe(id2);
    const me = await alice.query(api.users.current, {});
    expect(me?.email).toBe("alice@example.com");
  });

  it("current is null when signed out or not provisioned", async () => {
    const t = makeTest();
    expect(await t.query(api.users.current, {})).toBeNull();
    expect(await t.withIdentity(BOB).query(api.users.current, {})).toBeNull();
  });

  it("deleteAccount removes every owned row", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    const userId = await alice.mutation(api.users.ensure, {});
    await t.run(async (ctx) => {
      const recipeId = await ctx.db.insert("recipes", {
        userId, title: "T", sourceUrl: "", isFavorite: false,
        ingredients: [], instructions: [], tags: [],
      });
      await ctx.db.insert("shoppingItems", { userId, text: "x", checked: false, recipeId });
      await ctx.db.insert("mealPlans", {
        userId, date: "2026-09-14", mealType: "dinner", recipeId, isLeftover: false, position: 0,
      });
      const groupId = await ctx.db.insert("recipeGroups", {
        userId, name: "Favorites", sortOrder: 0, isDefault: true,
      });
      await ctx.db.insert("recipeGroupMembers", { groupId, recipeId });
    });
    await alice.mutation(api.users.deleteAccount, {});
    const counts = await t.run(async (ctx) => ({
      users: (await ctx.db.query("users").collect()).length,
      recipes: (await ctx.db.query("recipes").collect()).length,
      shopping: (await ctx.db.query("shoppingItems").collect()).length,
      plans: (await ctx.db.query("mealPlans").collect()).length,
      groups: (await ctx.db.query("recipeGroups").collect()).length,
      members: (await ctx.db.query("recipeGroupMembers").collect()).length,
    }));
    expect(counts).toEqual({ users: 0, recipes: 0, shopping: 0, plans: 0, groups: 0, members: 0 });
  });
});
