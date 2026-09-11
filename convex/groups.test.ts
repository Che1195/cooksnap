import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { ALICE, makeTest } from "./test.setup";

describe("recipeGroups", () => {
  it("ensureDefaults is idempotent and remove refuses the default", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    await alice.mutation(api.users.ensure, {});
    await alice.mutation(api.recipeGroups.ensureDefaults, {});
    await alice.mutation(api.recipeGroups.ensureDefaults, {});
    const groups = await alice.query(api.recipeGroups.list, {});
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ name: "Favorites", isDefault: true });
    await expect(alice.mutation(api.recipeGroups.remove, { id: groups[0].id as Id<"recipeGroups"> })).rejects.toThrow();
  });

  it("membership add/remove is unique", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    await alice.mutation(api.users.ensure, {});
    const g = await alice.mutation(api.recipeGroups.create, { name: "Weeknight", icon: "🍝" });
    const r = await alice.mutation(api.recipes.create, { title: "P", image: null, ingredients: [], instructions: [], sourceUrl: "", tags: [] });
    await alice.mutation(api.recipeGroups.addRecipe, { groupId: g, recipeId: r });
    await alice.mutation(api.recipeGroups.addRecipe, { groupId: g, recipeId: r });
    expect((await alice.query(api.recipeGroups.members, {}))[g]).toEqual([r]);
    await alice.mutation(api.recipeGroups.removeRecipe, { groupId: g, recipeId: r });
    expect(await alice.query(api.recipeGroups.members, {})).toEqual({});
    await alice.mutation(api.recipeGroups.remove, { id: g });
    expect(await alice.query(api.recipeGroups.list, {})).toEqual([]);
  });
});
