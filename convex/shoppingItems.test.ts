import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { ALICE, BOB, makeTest } from "./test.setup";

const recipe = { title: "Rice", ingredients: ["1 cup rice"], instructions: ["Cook"], sourceUrl: "", tags: [] };

describe("shopping recipe provenance", () => {
  it("merges only within a recipe and retains manual, checked and other recipe contributions", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    await alice.mutation(api.users.ensure, {});
    const first = await alice.mutation(api.recipes.create, recipe);
    const second = await alice.mutation(api.recipes.create, recipe);
    await alice.mutation(api.shoppingItems.add, { text: "1 cup rice" });
    await alice.mutation(api.shoppingItems.addMany, { items: [{ text: "1 cup rice", recipeId: first }] });
    await alice.mutation(api.shoppingItems.addIngredients, { recipeId: first, ingredients: ["2 cups rice"] });
    await alice.mutation(api.shoppingItems.addIngredients, { recipeId: second, ingredients: ["4 cups rice"] });
    await alice.mutation(api.shoppingItems.addBack, { items: [{ text: "5 cups rice", checked: true, recipeId: first }] });
    expect((await alice.query(api.shoppingItems.list, {})).map(({ text, recipeId, checked }) => ({ text, recipeId, checked }))).toEqual([
      { text: "1 cup rice", recipeId: undefined, checked: false },
      { text: "3 cups rice", recipeId: first, checked: false },
      { text: "4 cups rice", recipeId: second, checked: false },
      { text: "5 cups rice", recipeId: first, checked: true },
    ]);
    await alice.mutation(api.recipes.remove, { id: first });
    expect((await alice.query(api.shoppingItems.list, {})).map((item) => item.text)).toEqual(["1 cup rice", "4 cups rice"]);
  });

  it("rejects stale or foreign source references without changing survivors", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    const bob = t.withIdentity(BOB);
    await alice.mutation(api.users.ensure, {});
    await bob.mutation(api.users.ensure, {});
    const deleted = await alice.mutation(api.recipes.create, recipe);
    const foreign = await bob.mutation(api.recipes.create, recipe);
    await alice.mutation(api.recipes.remove, { id: deleted });
    await alice.mutation(api.shoppingItems.add, { text: "Keep me" });
    for (const recipeId of [deleted, foreign]) {
      await expect(alice.mutation(api.shoppingItems.addIngredients, { recipeId, ingredients: ["1 cup rice"] })).rejects.toThrow();
      await expect(alice.mutation(api.shoppingItems.addMany, { items: [{ text: "1 cup rice", recipeId }] })).rejects.toThrow();
      for (const mutation of [api.shoppingItems.addBack, api.shoppingItems.restore]) {
        await expect(alice.mutation(mutation, { items: [{ text: "Manual snapshot", checked: false }, { text: "1 cup rice", checked: false, recipeId }] })).rejects.toThrow();
      }
    }
    expect((await alice.query(api.shoppingItems.list, {})).map((item) => item.text)).toEqual(["Keep me"]);
  });
});
