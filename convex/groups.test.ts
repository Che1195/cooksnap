import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { ALICE, BOB, makeTest } from "./test.setup";

describe("recipeGroups", () => {
  it("other users cannot touch Alice's groups", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    const bob = t.withIdentity(BOB);
    await alice.mutation(api.users.ensure, {});
    await bob.mutation(api.users.ensure, {});
    const g = await alice.mutation(api.recipeGroups.create, { name: "Weeknight" });
    const r = await bob.mutation(api.recipes.create, { title: "P", image: null, ingredients: [], instructions: [], sourceUrl: "", tags: [] });
    await expect(bob.mutation(api.recipeGroups.update, { id: g, updates: { name: "Bob's group" } })).rejects.toThrow("Group not found");
    await expect(bob.mutation(api.recipeGroups.remove, { id: g })).rejects.toThrow("Group not found");
    await expect(bob.mutation(api.recipeGroups.addRecipe, { groupId: g, recipeId: r })).rejects.toThrow("Group not found");
    await expect(bob.mutation(api.recipeGroups.removeRecipe, { groupId: g, recipeId: r })).rejects.toThrow("Group not found");
    expect(await bob.query(api.recipeGroups.list, {})).toEqual([]);
  });

  it("update renames groups, clears icons, and changes list order", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    await alice.mutation(api.users.ensure, {});
    const first = await alice.mutation(api.recipeGroups.create, { name: "Weeknight" });
    const second = await alice.mutation(api.recipeGroups.create, { name: "Weekend" });
    await alice.mutation(api.recipeGroups.update, { id: first, updates: { name: "Noodles", icon: "🍜" } });
    expect((await alice.query(api.recipeGroups.list, {}))[0]).toMatchObject({ id: first, name: "Noodles", icon: "🍜" });
    await alice.mutation(api.recipeGroups.update, { id: first, updates: { icon: null } });
    expect((await alice.query(api.recipeGroups.list, {}))[0].icon).toBeNull();
    expect((await alice.query(api.recipeGroups.list, {})).map((g) => g.id)).toEqual([first, second]);
    await alice.mutation(api.recipeGroups.update, { id: first, updates: { sortOrder: 2 } });
    expect((await alice.query(api.recipeGroups.list, {})).map((g) => g.id)).toEqual([second, first]);
  });

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
