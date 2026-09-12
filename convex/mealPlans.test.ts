import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { ALICE, BOB, makeTest } from "./test.setup";

const scraped = { title: "P", image: null, ingredients: ["a"], instructions: ["b"], sourceUrl: "", tags: [] as string[] };

describe("mealPlans", () => {
  it("assign is unique per slot+recipe and forRange groups by date", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    await alice.mutation(api.users.ensure, {});
    const r1 = await alice.mutation(api.recipes.create, scraped);
    const r2 = await alice.mutation(api.recipes.create, { ...scraped, title: "Q" });
    expect(await alice.mutation(api.mealPlans.assign, { date: "2026-09-14", mealType: "dinner", recipeId: r1, isLeftover: false })).toBe(true);
    expect(await alice.mutation(api.mealPlans.assign, { date: "2026-09-14", mealType: "dinner", recipeId: r1, isLeftover: false })).toBe(false);
    expect(await alice.mutation(api.mealPlans.assign, { date: "2026-09-14", mealType: "dinner", recipeId: r2, isLeftover: true })).toBe(true);
    const plan = await alice.query(api.mealPlans.forRange, { startDate: "2026-09-14", endDate: "2026-09-20" });
    expect(plan["2026-09-14"].dinner).toEqual([
      { recipeId: r1, isLeftover: false, position: 0 },
      { recipeId: r2, isLeftover: true, position: 1 },
    ]);
    expect(plan["2026-09-14"].breakfast).toEqual([]);
    await alice.mutation(api.mealPlans.remove, { date: "2026-09-14", mealType: "dinner", recipeId: r1 });
    await alice.mutation(api.mealPlans.clearDates, { dates: ["2026-09-14"] });
    expect(await alice.query(api.mealPlans.forRange, { startDate: "2026-09-14", endDate: "2026-09-20" })).toEqual({});
  });

  it("templates save and apply onto a week", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    await alice.mutation(api.users.ensure, {});
    const r1 = await alice.mutation(api.recipes.create, scraped);
    const empty = { breakfast: [], lunch: [], dinner: [], snack: [] };
    const id = await alice.mutation(api.mealTemplates.save, {
      name: "Week A",
      days: { "0": { ...empty, dinner: [{ recipeId: r1, isLeftover: false, position: 0 }] } },
    });
    expect((await alice.query(api.mealTemplates.list, {}))[0]).toMatchObject({ id, name: "Week A" });
    const week = ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20"];
    await alice.mutation(api.mealTemplates.apply, { templateId: id, weekDates: week });
    const plan = await alice.query(api.mealPlans.forRange, { startDate: week[0], endDate: week[6] });
    expect(plan["2026-09-14"].dinner[0].recipeId).toBe(r1);
    await alice.mutation(api.mealTemplates.remove, { id });
    expect(await alice.query(api.mealTemplates.list, {})).toEqual([]);
  });

  it("apply skips missing, unowned, and duplicate entries", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    const bob = t.withIdentity(BOB);
    await alice.mutation(api.users.ensure, {});
    await bob.mutation(api.users.ensure, {});
    const r1 = await alice.mutation(api.recipes.create, scraped);
    const rb = await bob.mutation(api.recipes.create, scraped);
    const empty = { breakfast: [], lunch: [], dinner: [], snack: [] };
    const id = await alice.mutation(api.mealTemplates.save, {
      name: "Week A",
      days: { "0": { ...empty, dinner: [
        { recipeId: r1, isLeftover: false, position: 0 },
        { recipeId: rb, isLeftover: false, position: 1 },
        { recipeId: "not-an-id", isLeftover: false, position: 2 },
        { recipeId: r1, isLeftover: false, position: 3 },
      ] } },
    });
    const week = ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20"];
    await alice.mutation(api.mealPlans.assign, { date: week[0], mealType: "dinner", recipeId: r1, isLeftover: false });
    await alice.mutation(api.mealTemplates.apply, { templateId: id, weekDates: week });
    const plan = await alice.query(api.mealPlans.forRange, { startDate: week[0], endDate: week[6] });
    expect(plan[week[0]].dinner).toEqual([
      { recipeId: r1, isLeftover: false, position: 0 },
    ]);
    await expect(bob.mutation(api.mealTemplates.apply, { templateId: id, weekDates: week })).rejects.toThrow();
  });

  it("setLeftover flips the flag both ways on an existing entry", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    await alice.mutation(api.users.ensure, {});
    const r1 = await alice.mutation(api.recipes.create, scraped);
    await alice.mutation(api.mealPlans.assign, { date: "2026-09-14", mealType: "dinner", recipeId: r1, isLeftover: false });
    const entry = async () => (await alice.query(api.mealPlans.forRange, { startDate: "2026-09-14", endDate: "2026-09-14" }))["2026-09-14"].dinner;

    await alice.mutation(api.mealPlans.setLeftover, { date: "2026-09-14", mealType: "dinner", recipeId: r1, isLeftover: true });
    expect(await entry()).toEqual([{ recipeId: r1, isLeftover: true, position: 0 }]);
    await alice.mutation(api.mealPlans.setLeftover, { date: "2026-09-14", mealType: "dinner", recipeId: r1, isLeftover: false });
    expect(await entry()).toEqual([{ recipeId: r1, isLeftover: false, position: 0 }]);
  });

  it("setLeftover rejects a slot the entry is not in and another user's entry", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    const bob = t.withIdentity(BOB);
    await alice.mutation(api.users.ensure, {});
    await bob.mutation(api.users.ensure, {});
    const r1 = await alice.mutation(api.recipes.create, scraped);
    await alice.mutation(api.mealPlans.assign, { date: "2026-09-14", mealType: "dinner", recipeId: r1, isLeftover: false });
    await expect(alice.mutation(api.mealPlans.setLeftover, { date: "2026-09-14", mealType: "lunch", recipeId: r1, isLeftover: true })).rejects.toThrow("Meal not found");
    await expect(bob.mutation(api.mealPlans.setLeftover, { date: "2026-09-14", mealType: "dinner", recipeId: r1, isLeftover: true })).rejects.toThrow("Meal not found");
    const plan = await alice.query(api.mealPlans.forRange, { startDate: "2026-09-14", endDate: "2026-09-14" });
    expect(plan["2026-09-14"].dinner).toEqual([{ recipeId: r1, isLeftover: false, position: 0 }]);
  });

  it("forRecipe lists the caller's slots only", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    const bob = t.withIdentity(BOB);
    await alice.mutation(api.users.ensure, {});
    await bob.mutation(api.users.ensure, {});
    const r1 = await alice.mutation(api.recipes.create, scraped);
    await alice.mutation(api.mealPlans.assign, { date: "2026-09-14", mealType: "dinner", recipeId: r1, isLeftover: false });
    await alice.mutation(api.mealPlans.assign, { date: "2026-09-15", mealType: "lunch", recipeId: r1, isLeftover: true });
    const slots = await alice.query(api.mealPlans.forRecipe, { recipeId: r1 });
    expect(slots.sort((a, b) => a.date.localeCompare(b.date))).toEqual([
      { date: "2026-09-14", mealType: "dinner", isLeftover: false },
      { date: "2026-09-15", mealType: "lunch", isLeftover: true },
    ]);
    expect(await bob.query(api.mealPlans.forRecipe, { recipeId: r1 })).toEqual([]);
  });

  it("other users cannot read or write Alice's plan", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    const bob = t.withIdentity(BOB);
    await alice.mutation(api.users.ensure, {});
    await bob.mutation(api.users.ensure, {});
    const r1 = await alice.mutation(api.recipes.create, scraped);
    await alice.mutation(api.mealPlans.assign, { date: "2026-09-14", mealType: "dinner", recipeId: r1, isLeftover: false });
    const empty = { breakfast: [], lunch: [], dinner: [], snack: [] };
    const id = await alice.mutation(api.mealTemplates.save, {
      name: "Week A",
      days: { "0": { ...empty, dinner: [{ recipeId: r1, isLeftover: false, position: 0 }] } },
    });
    expect(await bob.query(api.mealPlans.forRange, { startDate: "2026-09-14", endDate: "2026-09-20" })).toEqual({});
    await expect(bob.mutation(api.mealPlans.assign, { date: "2026-09-14", mealType: "dinner", recipeId: r1, isLeftover: false })).rejects.toThrow();
    await expect(bob.mutation(api.mealTemplates.remove, { id })).rejects.toThrow();
    expect(await bob.query(api.mealTemplates.list, {})).toEqual([]);
  });
});
