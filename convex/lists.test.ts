import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { ALICE, makeTest } from "./test.setup";

describe("shopping and grocery lists", () => {
  it("shopping add/toggle/uncheckAll/clearChecked/restore", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    await alice.mutation(api.users.ensure, {});
    const a = await alice.mutation(api.shoppingItems.add, { text: "milk" });
    await alice.mutation(api.shoppingItems.addMany, { items: [{ text: "eggs" }, { text: "flour" }] });
    await alice.mutation(api.shoppingItems.toggle, { id: a });
    let list = await alice.query(api.shoppingItems.list, {});
    expect(list.map((i) => [i.text, i.checked])).toEqual([["milk", true], ["eggs", false], ["flour", false]]);
    await alice.mutation(api.shoppingItems.clearChecked, {});
    list = await alice.query(api.shoppingItems.list, {});
    expect(list.map((i) => i.text)).toEqual(["eggs", "flour"]);
    await alice.mutation(api.shoppingItems.restore, { items: [{ text: "x", checked: true }] });
    list = await alice.query(api.shoppingItems.list, {});
    expect(list).toHaveLength(1);
    await alice.mutation(api.shoppingItems.uncheckAll, {});
    expect((await alice.query(api.shoppingItems.list, {}))[0].checked).toBe(false);
    await alice.mutation(api.shoppingItems.clear, {});
    expect(await alice.query(api.shoppingItems.list, {})).toEqual([]);
  });

  it("grocery add/toggle/clear and text cap", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    await alice.mutation(api.users.ensure, {});
    const id = await alice.mutation(api.groceryItems.add, { text: "bananas" });
    await alice.mutation(api.groceryItems.toggle, { id });
    expect((await alice.query(api.groceryItems.list, {}))[0].checked).toBe(true);
    await expect(alice.mutation(api.groceryItems.add, { text: "x".repeat(501) })).rejects.toThrow();
    await alice.mutation(api.groceryItems.clear, {});
    expect(await alice.query(api.groceryItems.list, {})).toEqual([]);
  });

  it("checked ingredients toggle per recipe", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    await alice.mutation(api.users.ensure, {});
    const r = await alice.mutation(api.recipes.create, { title: "P", image: null, ingredients: ["a", "b"], instructions: [], sourceUrl: "", tags: [] });
    await alice.mutation(api.checkedIngredients.toggle, { recipeId: r, index: 1 });
    await alice.mutation(api.checkedIngredients.toggle, { recipeId: r, index: 0 });
    expect((await alice.query(api.checkedIngredients.list, {}))[r]).toEqual([0, 1]);
    await alice.mutation(api.checkedIngredients.toggle, { recipeId: r, index: 0 });
    expect((await alice.query(api.checkedIngredients.list, {}))[r]).toEqual([1]);
    await alice.mutation(api.checkedIngredients.clear, { recipeId: r });
    expect(await alice.query(api.checkedIngredients.list, {})).toEqual({});
  });
});
