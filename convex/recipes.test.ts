import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { ALICE, BOB, makeTest } from "./test.setup";
import { recipeFingerprint, type RecipeInterpretation } from "../src/lib/recipe-interpretation";

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
  const source = {
    title: "Eggs", ingredients: ["2 eggs"], instructions: ["Beat eggs."],
    servings: "2", sourceUrl: "https://example.com/eggs", tags: [] as string[],
  };
  const interpretation: RecipeInterpretation = {
    version: 1, sourceFingerprint: recipeFingerprint(source),
    ingredients: [{
      id: "eggs", index: 0, name: "eggs", aliases: [],
      nameSpan: { start: 2, end: 6, text: "eggs" },
      quantities: [{ start: 0, end: 1, text: "2", role: "amount", value: 2 }],
    }],
    instructions: [{ index: 0, references: [{ start: 5, end: 9, text: "eggs", ingredientId: "eggs" }], quantities: [] }],
  };

  it("preserves interpretation through create/read and metadata-only edits", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    await alice.mutation(api.users.ensure, {});
    const id = await alice.mutation(api.recipes.create, { ...source, interpretation });
    await alice.mutation(api.recipes.update, { id, updates: { title: "Breakfast", ingredients: [...source.ingredients], instructions: [...source.instructions], servings: "2" } });
    expect((await alice.query(api.recipes.get, { id }))?.interpretation).toEqual(interpretation);
  });

  it("atomically removes stale interpretation and positional checks after ingredient edits", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    await alice.mutation(api.users.ensure, {});
    const id = await alice.mutation(api.recipes.create, { ...source, interpretation });
    await alice.mutation(api.checkedIngredients.toggle, { recipeId: id, index: 0 });
    await alice.mutation(api.recipes.update, { id, updates: { ingredients: ["3 eggs"] } });
    expect((await alice.query(api.recipes.get, { id }))?.interpretation).toBeUndefined();
    expect(await alice.query(api.checkedIngredients.list, {})).toEqual({});
  });

  it.each([{ instructions: ["Scramble eggs."] }, { servings: "4" }])("invalidates interpretation when its source changes: %j", async (updates) => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    await alice.mutation(api.users.ensure, {});
    const id = await alice.mutation(api.recipes.create, { ...source, interpretation });
    await alice.mutation(api.recipes.update, { id, updates });
    expect((await alice.query(api.recipes.get, { id }))?.interpretation).toBeUndefined();
  });

  it("rejects mismatched interpretation without saving a recipe", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    await alice.mutation(api.users.ensure, {});
    await expect(alice.mutation(api.recipes.create, { ...source, ingredients: ["3 eggs"], interpretation })).rejects.toThrow(/interpretation/);
    expect(await alice.query(api.recipes.list, {})).toEqual([]);
  });

  it("saves one recipe per user/import attempt but permits intentional reimports", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    const bob = t.withIdentity(BOB);
    await alice.mutation(api.users.ensure, {});
    await bob.mutation(api.users.ensure, {});
    const id = await alice.mutation(api.recipes.create, { ...source, importId: "attempt-1" });
    expect(await alice.mutation(api.recipes.create, { ...source, importId: "attempt-1" })).toBe(id);
    expect(await bob.mutation(api.recipes.create, { ...source, importId: "attempt-1" })).not.toBe(id);
    expect(await alice.mutation(api.recipes.create, { ...source, importId: "attempt-2" })).not.toBe(id);
    expect(await alice.query(api.recipes.list, {})).toHaveLength(2);
  });

  it("requires essential recipe content for a URL import", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    await alice.mutation(api.users.ensure, {});
    await expect(alice.mutation(api.recipes.create, { ...source, ingredients: ["## Ingredients"], importId: "attempt" })).rejects.toThrow(/ingredients/);
    await expect(alice.mutation(api.recipes.create, { ...source, instructions: [" "], importId: "attempt" })).rejects.toThrow(/instructions/);
  });

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

  it("update with a new image clears the attached storage id", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    await alice.mutation(api.users.ensure, {});
    const id = await alice.mutation(api.recipes.create, scraped);
    const oldId = await t.run(async (ctx) => {
      const oldId = await ctx.storage.store(new Blob(["x"]));
      await ctx.db.patch(id, { image: "https://x/old.jpg", imageStorageId: oldId });
      return oldId;
    });
    await alice.mutation(api.recipes.update, { id, updates: { image: "https://x/new.jpg" } });
    const recipe = await alice.query(api.recipes.get, { id });
    expect(recipe?.image).toBe("https://x/new.jpg");
    await t.run(async (ctx) => {
      const doc = await ctx.db.get(id);
      expect(doc?.imageStorageId).toBeUndefined();
      expect(await ctx.storage.getUrl(oldId)).toBeNull();
    });
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
