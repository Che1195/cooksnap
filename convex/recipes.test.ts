import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { ALICE, BOB, makeTest } from "./test.setup";

const scraped = {
  title: "Pasta",
  image: "https://example.com/p.jpg",
  ingredients: ["8 oz spaghetti", "1 cup sauce"],
  instructions: ["Boil", "Simmer"],
  sourceUrl: "https://example.com/pasta",
  servings: "2",
  tags: [] as string[],
};

describe("recipes", () => {
  it("create/list/get round-trip shaped as Recipe", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    await alice.mutation(api.users.ensure, {});
    const id = await alice.mutation(api.recipes.create, scraped);
    const list = await alice.query(api.recipes.list, {});
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id, title: "Pasta", image: "https://example.com/p.jpg", isFavorite: false, tags: [] });
    expect(typeof list[0].createdAt).toBe("string");
    expect(await alice.query(api.recipes.get, { id })).toMatchObject({ id });
  });

  it("other users cannot see, update, or delete", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    const bob = t.withIdentity(BOB);
    await alice.mutation(api.users.ensure, {});
    await bob.mutation(api.users.ensure, {});
    const id = await alice.mutation(api.recipes.create, scraped);
    expect(await bob.query(api.recipes.list, {})).toHaveLength(0);
    expect(await bob.query(api.recipes.get, { id })).toBeNull();
    await expect(bob.mutation(api.recipes.update, { id, updates: { title: "X" } })).rejects.toThrow();
    await expect(bob.mutation(api.recipes.remove, { id })).rejects.toThrow();
  });

  it("update clears nullable fields with null and validates rating", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    await alice.mutation(api.users.ensure, {});
    const id = await alice.mutation(api.recipes.create, scraped);
    await alice.mutation(api.recipes.update, { id, updates: { notes: "yum", rating: 5, servings: null } });
    const r = await alice.query(api.recipes.get, { id });
    expect(r).toMatchObject({ notes: "yum", rating: 5, servings: null });
    await expect(alice.mutation(api.recipes.update, { id, updates: { rating: 9 } })).rejects.toThrow();
  });

  it("remove cascades", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    const userId = await alice.mutation(api.users.ensure, {});
    const id = await alice.mutation(api.recipes.create, scraped);
    await t.run(async (ctx) => {
      await ctx.db.insert("mealPlans", { userId, date: "2026-09-14", mealType: "dinner", recipeId: id, isLeftover: false, position: 0 });
      await ctx.db.insert("checkedIngredients", { userId, recipeId: id, ingredientIndex: 0 });
      await ctx.db.insert("shoppingItems", { userId, text: "sauce", checked: false, recipeId: id });
      const g = await ctx.db.insert("recipeGroups", { userId, name: "Fav", sortOrder: 0, isDefault: true });
      await ctx.db.insert("recipeGroupMembers", { groupId: g, recipeId: id });
    });
    await alice.mutation(api.recipes.remove, { id });
    const left = await t.run(async (ctx) => ({
      plans: (await ctx.db.query("mealPlans").collect()).length,
      checked: (await ctx.db.query("checkedIngredients").collect()).length,
      members: (await ctx.db.query("recipeGroupMembers").collect()).length,
      shopping: await ctx.db.query("shoppingItems").collect(),
    }));
    expect(left.plans).toBe(0);
    expect(left.checked).toBe(0);
    expect(left.members).toBe(0);
    expect(left.shopping[0].recipeId).toBeUndefined();
  });
});
