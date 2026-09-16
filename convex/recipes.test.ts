import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { ALICE, BOB, makeTest } from "./test.setup";
import { buildGeneratedItems } from "../src/lib/shopping-merge";
import type { Id } from "./_generated/dataModel";
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
    expect(left.shopping).toEqual([]);
  });
});


describe("recipe deletion derived data", () => {
  it("removes scheduled/generated groceries and every owned reference while preserving unrelated data", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    const bob = t.withIdentity(BOB);
    const userId = await alice.mutation(api.users.ensure, {});
    await bob.mutation(api.users.ensure, {});
    const id = await alice.mutation(api.recipes.create, { ...scraped, ingredients: ["1 cup rice"] });
    const otherId = await alice.mutation(api.recipes.create, { ...scraped, ingredients: ["2 cups rice"] });
    const bobId = await bob.mutation(api.recipes.create, scraped);
    for (const recipeId of [id, otherId]) {
      await alice.mutation(api.mealPlans.assign, { date: "2026-09-14", mealType: "dinner", recipeId, isLeftover: false });
      await alice.mutation(api.checkedIngredients.toggle, { recipeId, index: 0 });
    }
    await bob.mutation(api.shoppingItems.addIngredients, { recipeId: bobId, ingredients: ["1 cup rice"] });
    const plan = await alice.query(api.mealPlans.forRange, { startDate: "2026-09-14", endDate: "2026-09-14" });
    const generated = buildGeneratedItems(["2026-09-14"], plan, await alice.query(api.recipes.list, {}));
    await alice.mutation(api.shoppingItems.restore, { items: generated.map((item) => ({ ...item, checked: false, recipeId: item.recipeId as Id<"recipes"> })) });
    await alice.mutation(api.shoppingItems.add, { text: "1 cup rice" });
    const days = { "0": { breakfast: [], lunch: [], dinner: [
      { recipeId: id, isLeftover: false, position: 0 },
      { recipeId: otherId, isLeftover: false, position: 1 },
    ], snack: [{ recipeId: id, isLeftover: true, position: 0 }] } };
    const templateId = await alice.mutation(api.mealTemplates.save, { name: "Week", days });
    const { storageId, groupId } = await t.run(async (ctx) => {
      const storageId = await ctx.storage.store(new Blob(["image"]));
      await ctx.db.patch(id, { imageStorageId: storageId });
      const groupId = await ctx.db.insert("recipeGroups", { userId, name: "Keep group", sortOrder: 0, isDefault: false });
      for (const recipeId of [id, otherId]) await ctx.db.insert("recipeGroupMembers", { groupId, recipeId });
      return { storageId, groupId };
    });
    const deletedItem = (await alice.query(api.shoppingItems.list, {})).find((item) => item.recipeId === id)!;
    await alice.mutation(api.shoppingItems.toggle, { id: deletedItem.id as Id<"shoppingItems"> });
    await alice.mutation(api.recipes.remove, { id });
    expect(await alice.query(api.shoppingItems.list, {})).toEqual([
      expect.objectContaining({ recipeId: otherId, text: "2 cups rice" }),
      expect.objectContaining({ text: "1 cup rice" }),
    ]);
    expect(await bob.query(api.shoppingItems.list, {})).toHaveLength(1);
    expect(await bob.query(api.recipes.get, { id: bobId })).not.toBeNull();
    await t.run(async (ctx) => {
      expect(await ctx.db.get(id)).toBeNull();
      expect(await ctx.storage.getUrl(storageId)).toBeNull();
      expect((await ctx.db.query("mealPlans").collect()).map((row) => row.recipeId)).toEqual([otherId]);
      expect((await ctx.db.query("checkedIngredients").collect()).map((row) => row.recipeId)).toEqual([otherId]);
      expect((await ctx.db.query("recipeGroupMembers").collect()).map((row) => row.recipeId)).toEqual([otherId]);
      expect(await ctx.db.get(groupId)).not.toBeNull();
      expect((await ctx.db.get(templateId))?.days["0"]).toEqual({ breakfast: [], lunch: [], dinner: [days["0"].dinner[1]], snack: [] });
    });
    await alice.mutation(api.mealTemplates.apply, { templateId, weekDates: ["2026-09-21"] });
    expect((await alice.query(api.mealPlans.forRange, { startDate: "2026-09-21", endDate: "2026-09-21" }))["2026-09-21"].dinner.map((entry) => entry.recipeId)).toEqual([otherId]);
  });
});
