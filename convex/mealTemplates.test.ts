import { expect, it } from "vitest";
import { api } from "./_generated/api";
import { ALICE, BOB, makeTest } from "./test.setup";

it("rejects deleted, foreign, and malformed recipe references in saved templates", async () => {
  const t = makeTest();
  const alice = t.withIdentity(ALICE);
  const bob = t.withIdentity(BOB);
  await alice.mutation(api.users.ensure, {});
  await bob.mutation(api.users.ensure, {});
  const source = { title: "Rice", ingredients: ["rice"], instructions: ["Cook"], sourceUrl: "", tags: [] };
  const deleted = await alice.mutation(api.recipes.create, source);
  const foreign = await bob.mutation(api.recipes.create, source);
  await alice.mutation(api.recipes.remove, { id: deleted });
  for (const recipeId of [deleted, foreign, "bad-id"]) {
    await expect(alice.mutation(api.mealTemplates.save, { name: "Week", days: { "0": {
      breakfast: [], lunch: [], snack: [], dinner: [{ recipeId, isLeftover: false, position: 0 }],
    } } })).rejects.toThrow();
  }
  expect(await alice.query(api.mealTemplates.list, {})).toEqual([]);
});
