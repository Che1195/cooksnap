import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { ALICE, BOB, makeTest } from "./test.setup";

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
    await expect(alice.mutation(api.groceryItems.add, { text: "   " })).rejects.toThrow();
    await alice.mutation(api.groceryItems.clear, {});
    expect(await alice.query(api.groceryItems.list, {})).toEqual([]);
  });

  it("shopping items are per user and toggles reject foreign rows", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    const bob = t.withIdentity(BOB);
    await alice.mutation(api.users.ensure, {});
    await bob.mutation(api.users.ensure, {});
    const aliceItemId = await alice.mutation(api.shoppingItems.add, { text: "milk" });
    await bob.mutation(api.shoppingItems.add, { text: "bread" });
    expect((await alice.query(api.shoppingItems.list, {})).map((i) => i.text)).toEqual(["milk"]);
    expect((await bob.query(api.shoppingItems.list, {})).map((i) => i.text)).toEqual(["bread"]);
    await expect(bob.mutation(api.shoppingItems.toggle, { id: aliceItemId })).rejects.toThrow();
    await expect(bob.mutation(api.shoppingItems.updateText, { id: aliceItemId, text: "hack" })).rejects.toThrow();
    await alice.mutation(api.shoppingItems.updateText, { id: aliceItemId, text: "  oat milk  " });
    expect((await alice.query(api.shoppingItems.list, {})).map((i) => i.text)).toEqual(["oat milk"]);
  });

  it("grocery toggles reject foreign rows", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    const bob = t.withIdentity(BOB);
    await alice.mutation(api.users.ensure, {});
    await bob.mutation(api.users.ensure, {});
    const aliceItemId = await alice.mutation(api.groceryItems.add, { text: "milk" });
    await bob.mutation(api.groceryItems.add, { text: "bread" });
    await expect(bob.mutation(api.groceryItems.toggle, { id: aliceItemId })).rejects.toThrow();
    expect((await alice.query(api.groceryItems.list, {})).map((i) => i.text)).toEqual(["milk"]);
  });

  it("addMany and restore reject foreign recipe ids", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    const bob = t.withIdentity(BOB);
    await alice.mutation(api.users.ensure, {});
    await bob.mutation(api.users.ensure, {});
    const rb = await bob.mutation(api.recipes.create, { title: "P", image: null, ingredients: ["a", "b"], instructions: [], sourceUrl: "", tags: [] });
    await expect(alice.mutation(api.shoppingItems.addMany, { items: [{ text: "x", recipeId: rb }] })).rejects.toThrow();
    expect(await alice.query(api.shoppingItems.list, {})).toEqual([]);
    await expect(alice.mutation(api.shoppingItems.restore, { items: [{ text: "x", checked: false, recipeId: rb }] })).rejects.toThrow();
    expect(await alice.query(api.shoppingItems.list, {})).toEqual([]);
    const r1 = await alice.mutation(api.recipes.create, { title: "P", image: null, ingredients: ["a", "b"], instructions: [], sourceUrl: "", tags: [] });
    await alice.mutation(api.shoppingItems.addMany, { items: [{ text: "x", recipeId: r1 }] });
    const list = await alice.query(api.shoppingItems.list, {});
    expect(list).toHaveLength(1);
    expect(list[0].recipeId).toBe(r1);
  });

  it("addBack appends to the shopping list instead of replacing it", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    const bob = t.withIdentity(BOB);
    await alice.mutation(api.users.ensure, {});
    await bob.mutation(api.users.ensure, {});
    const r1 = await alice.mutation(api.recipes.create, { title: "P", image: null, ingredients: ["a"], instructions: [], sourceUrl: "", tags: [] });
    const rb = await bob.mutation(api.recipes.create, { title: "Q", image: null, ingredients: ["a"], instructions: [], sourceUrl: "", tags: [] });
    await alice.mutation(api.shoppingItems.add, { text: "survivor" });

    await alice.mutation(api.shoppingItems.addBack, { items: [{ text: "milk", checked: true }, { text: "eggs", checked: false, recipeId: r1 }] });
    const list = await alice.query(api.shoppingItems.list, {});
    expect(list.map((i) => [i.text, i.checked])).toEqual([["survivor", false], ["milk", true], ["eggs", false]]);
    expect(list[2].recipeId).toBe(r1);

    await expect(alice.mutation(api.shoppingItems.addBack, { items: [{ text: "x", checked: false, recipeId: rb }] })).rejects.toThrow();
    expect(await alice.query(api.shoppingItems.list, {})).toHaveLength(3);
    await expect(alice.mutation(api.shoppingItems.addBack, { items: [{ text: "   ", checked: false }] })).rejects.toThrow();
  });

  it("addBack appends to the grocery list instead of replacing it", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    const bob = t.withIdentity(BOB);
    await alice.mutation(api.users.ensure, {});
    await bob.mutation(api.users.ensure, {});
    await alice.mutation(api.groceryItems.add, { text: "survivor" });
    await alice.mutation(api.groceryItems.addBack, { items: [{ text: "bananas", checked: true }] });
    expect((await alice.query(api.groceryItems.list, {})).map((i) => [i.text, i.checked])).toEqual([["survivor", false], ["bananas", true]]);
    expect(await bob.query(api.groceryItems.list, {})).toEqual([]);
    await expect(alice.mutation(api.groceryItems.addBack, { items: [{ text: "x".repeat(501), checked: false }] })).rejects.toThrow();
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
