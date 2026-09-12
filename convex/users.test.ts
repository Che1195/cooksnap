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
    const bobId = await t.withIdentity(BOB).mutation(api.users.ensure, {});
    await t.run(async (ctx) => {
      const recipeId = await ctx.db.insert("recipes", {
        userId: bobId, title: "Bob's recipe", sourceUrl: "", isFavorite: false,
        ingredients: [], instructions: [], tags: [],
      });
      await ctx.db.insert("shoppingItems", { userId: bobId, text: "Bob's item", checked: false, recipeId });
      await ctx.db.insert("mealPlans", {
        userId: bobId, date: "2026-09-15", mealType: "dinner", recipeId, isLeftover: false, position: 0,
      });
      await ctx.db.insert("recipeGroups", {
        userId: bobId, name: "Bob's favorites", sortOrder: 0, isDefault: true,
      });
    });
    await alice.mutation(api.users.deleteAccount, {});
    const counts = await t.run(async (ctx) => {
      const users = await ctx.db.query("users").collect();
      const recipes = await ctx.db.query("recipes").collect();
      const shopping = await ctx.db.query("shoppingItems").collect();
      const plans = await ctx.db.query("mealPlans").collect();
      const groups = await ctx.db.query("recipeGroups").collect();
      const countOwnedRows = (ownerId: typeof userId) => ({
        users: users.filter((row) => row._id === ownerId).length,
        recipes: recipes.filter((row) => row.userId === ownerId).length,
        shopping: shopping.filter((row) => row.userId === ownerId).length,
        plans: plans.filter((row) => row.userId === ownerId).length,
        groups: groups.filter((row) => row.userId === ownerId).length,
      });
      return {
        alice: countOwnedRows(userId),
        bob: countOwnedRows(bobId),
        members: (await ctx.db.query("recipeGroupMembers").collect()).length,
      };
    });
    expect(counts.alice).toEqual({ users: 0, recipes: 0, shopping: 0, plans: 0, groups: 0 });
    expect(counts.bob).toEqual({ users: 1, recipes: 1, shopping: 1, plans: 1, groups: 1 });
    expect(counts.members).toBe(0);
  });
});
