import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { ALICE, makeTest } from "./test.setup";

describe("migration upserts", () => {
  it("refuses to replace an already-linked user's legacyId", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    const userId = await alice.mutation(api.users.ensure, {});
    await t.mutation(internal.migration.upsertUser, { legacyId: "sb-1", email: "alice@example.com" });
    await expect(t.mutation(internal.migration.upsertUser, { legacyId: "sb-2", email: "alice@example.com" })).rejects.toThrow("User alice@example.com is already linked to legacy id sb-1");
    expect((await t.run((ctx) => ctx.db.get(userId)))?.legacyId).toBe("sb-1");
  });

  it("removes omitted recipe notes but retains imageStorageId on rerun", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    await alice.mutation(api.users.ensure, {});
    await t.mutation(internal.migration.upsertUser, { legacyId: "sb-1", email: "alice@example.com" });
    const imageStorageId = await t.run((ctx) => ctx.storage.store(new Blob(["x"])));
    const base = { legacyId: "r-1", userLegacyId: "sb-1", title: "Pasta", sourceUrl: "", isFavorite: true, ingredients: ["a"], instructions: ["b"], tags: ["dinner"], createdAt: "2026-02-25T00:00:00Z" };
    const id = await t.mutation(internal.migration.upsertRecipe, { ...base, notes: "x", imageStorageId });
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({ notes: "x", imageStorageId });
    expect(await t.mutation(internal.migration.upsertRecipe, base)).toBe(id);
    const recipe = await t.run((ctx) => ctx.db.get(id));
    expect(recipe).not.toHaveProperty("notes");
    expect(recipe?.imageStorageId).toBe(imageStorageId);
    expect(await t.query(internal.migration.findRecipeByLegacyId, { legacyId: "r-1" })).toEqual({ id, imageStorageId });
  });

  it("removes an omitted group icon on rerun", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    await alice.mutation(api.users.ensure, {});
    await t.mutation(internal.migration.upsertUser, { legacyId: "sb-1", email: "alice@example.com" });
    const base = { legacyId: "g-1", userLegacyId: "sb-1", name: "Favorites", sortOrder: 0, isDefault: true };
    const id = await t.mutation(internal.migration.upsertGroup, { ...base, icon: "🍜" });
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({ icon: "🍜" });
    expect(await t.mutation(internal.migration.upsertGroup, base)).toBe(id);
    expect(await t.run((ctx) => ctx.db.get(id))).not.toHaveProperty("icon");
  });

  it("upsertIssueReportMember is idempotent", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    const userId = await alice.mutation(api.users.ensure, {});
    await t.mutation(internal.migration.upsertUser, { legacyId: "sb-1", email: "alice@example.com" });
    await t.mutation(internal.migration.upsertIssueReportMember, { userLegacyId: "sb-1" });
    await t.mutation(internal.migration.upsertIssueReportMember, { userLegacyId: "sb-1" });
    expect(await t.run((ctx) => ctx.db.query("issueReportMembers").collect())).toEqual([expect.objectContaining({ userId })]);
  });

  it("upsertTemplate updates the name for an existing legacyId", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    await alice.mutation(api.users.ensure, {});
    await t.mutation(internal.migration.upsertUser, { legacyId: "sb-1", email: "alice@example.com" });
    const base = { legacyId: "t-1", userLegacyId: "sb-1", name: "Weeknight", days: {} };
    const id = await t.mutation(internal.migration.upsertTemplate, base);
    expect(await t.mutation(internal.migration.upsertTemplate, { ...base, name: "Weekend" })).toBe(id);
    expect(await t.run((ctx) => ctx.db.query("mealTemplates").collect())).toEqual([expect.objectContaining({ _id: id, legacyId: "t-1", name: "Weekend" })]);
  });

  it("findRecipeByLegacyId returns the migrated id and image storage id or null", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    await alice.mutation(api.users.ensure, {});
    await t.mutation(internal.migration.upsertUser, { legacyId: "sb-1", email: "alice@example.com" });
    const id = await t.mutation(internal.migration.upsertRecipe, { legacyId: "r-1", userLegacyId: "sb-1", title: "Pasta", sourceUrl: "", isFavorite: true, ingredients: ["a"], instructions: ["b"], tags: ["dinner"], createdAt: "2026-02-25T00:00:00Z" });
    expect(await t.query(internal.migration.findRecipeByLegacyId, { legacyId: "r-1" })).toEqual({ id });
    expect(await t.query(internal.migration.findRecipeByLegacyId, { legacyId: "unknown" })).toBeNull();
  });

  it("applies the Supabase profile display name on link and on rerun", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    const userId = await alice.mutation(api.users.ensure, {});
    await t.mutation(internal.migration.upsertUser, { legacyId: "sb-1", email: "alice@example.com", displayName: "Alice Cooks" });
    expect((await t.run((ctx) => ctx.db.get(userId)))?.displayName).toBe("Alice Cooks");
    await t.mutation(internal.migration.upsertUser, { legacyId: "sb-1", email: "alice@example.com", displayName: "Alice C." });
    expect((await t.run((ctx) => ctx.db.get(userId)))?.displayName).toBe("Alice C.");
    // Omitting it leaves whatever name is already there.
    await t.mutation(internal.migration.upsertUser, { legacyId: "sb-1", email: "alice@example.com" });
    expect((await t.run((ctx) => ctx.db.get(userId)))?.displayName).toBe("Alice C.");
  });

  it("imports a user's list rows once and drops links to unmigrated recipes", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    await alice.mutation(api.users.ensure, {});
    await t.mutation(internal.migration.upsertUser, { legacyId: "sb-1", email: "alice@example.com" });
    const recipeId = await t.mutation(internal.migration.upsertRecipe, { legacyId: "r-1", userLegacyId: "sb-1", title: "Pasta", sourceUrl: "", isFavorite: false, ingredients: ["a"], instructions: ["b"], tags: [], createdAt: "2026-02-25T00:00:00Z" });

    expect(await t.mutation(internal.migration.upsertShoppingItems, { userLegacyId: "sb-1", items: [
      { text: "milk", checked: true, recipeLegacyId: "r-1" },
      { text: "eggs", checked: false, recipeLegacyId: "gone" },
      { text: "flour", checked: false },
    ] })).toBe(3);
    expect((await alice.query(api.shoppingItems.list, {})).map((i) => [i.text, i.checked, i.recipeId])).toEqual([
      ["milk", true, recipeId],
      ["eggs", false, undefined],
      ["flour", false, undefined],
    ]);
    // Second run: the user already has rows, so nothing is duplicated.
    expect(await t.mutation(internal.migration.upsertShoppingItems, { userLegacyId: "sb-1", items: [{ text: "milk", checked: true }] })).toBe(0);
    expect(await alice.query(api.shoppingItems.list, {})).toHaveLength(3);

    expect(await t.mutation(internal.migration.upsertGroceryItems, { userLegacyId: "sb-1", items: [{ text: "bananas", checked: true }] })).toBe(1);
    expect(await t.mutation(internal.migration.upsertGroceryItems, { userLegacyId: "sb-1", items: [{ text: "bananas", checked: true }] })).toBe(0);
    expect((await alice.query(api.groceryItems.list, {})).map((i) => i.text)).toEqual(["bananas"]);

    // The tick on the unmigrated recipe has nothing to point at and is dropped.
    expect(await t.mutation(internal.migration.upsertCheckedIngredients, { userLegacyId: "sb-1", items: [
      { recipeLegacyId: "r-1", ingredientIndex: 1 },
      { recipeLegacyId: "gone", ingredientIndex: 0 },
    ] })).toBe(1);
    expect(await t.mutation(internal.migration.upsertCheckedIngredients, { userLegacyId: "sb-1", items: [{ recipeLegacyId: "r-1", ingredientIndex: 1 }] })).toBe(0);
    expect(await alice.query(api.checkedIngredients.list, {})).toEqual({ [recipeId]: [1] });
  });

  it("upserts an issue report by legacyId and leaves an unlinked reporter anonymous", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    const userId = await alice.mutation(api.users.ensure, {});
    await t.mutation(internal.migration.upsertUser, { legacyId: "sb-1", email: "alice@example.com" });
    const report = { legacyId: "ir-1", reporterEmail: "alice@example.com", title: "Bug", description: "It broke", severity: "high" as const, status: "open" as const };

    const id = await t.mutation(internal.migration.upsertIssueReport, { ...report, reporterLegacyId: "sb-1" });
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({ reporterId: userId, reporterEmail: "alice@example.com", legacyId: "ir-1" });
    // Rerun keeps one row and applies the new status.
    expect(await t.mutation(internal.migration.upsertIssueReport, { ...report, reporterLegacyId: "sb-1", status: "resolved" })).toBe(id);
    expect(await t.run((ctx) => ctx.db.query("issueReports").collect())).toHaveLength(1);
    expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe("resolved");

    const anon = await t.mutation(internal.migration.upsertIssueReport, { ...report, legacyId: "ir-2", reporterLegacyId: "sb-unlinked" });
    expect(await t.run((ctx) => ctx.db.get(anon))).toMatchObject({ reporterEmail: "alice@example.com" });
    expect((await t.run((ctx) => ctx.db.get(anon)))?.reporterId).toBeUndefined();
  });

  it("links a legacy user by email and is idempotent on legacyId", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    await alice.mutation(api.users.ensure, {});
    expect(await t.mutation(internal.migration.upsertUser, { legacyId: "sb-1", email: "nobody@example.com" })).toBeNull();
    const u1 = await t.mutation(internal.migration.upsertUser, { legacyId: "sb-1", email: "alice@example.com" });
    const u2 = await t.mutation(internal.migration.upsertUser, { legacyId: "sb-1", email: "alice@example.com" });
    expect(u1).toBe(u2);
    const base = { legacyId: "r-1", userLegacyId: "sb-1", title: "Pasta", sourceUrl: "", isFavorite: true, ingredients: ["a"], instructions: ["b"], tags: ["dinner"], createdAt: "2026-02-25T00:00:00Z" };
    const r1 = await t.mutation(internal.migration.upsertRecipe, base);
    const r2 = await t.mutation(internal.migration.upsertRecipe, { ...base, title: "Pasta v2" });
    expect(r1).toBe(r2);
    expect((await alice.query(api.recipes.list, {}))[0].title).toBe("Pasta v2");
    const g = await t.mutation(internal.migration.upsertGroup, { legacyId: "g-1", userLegacyId: "sb-1", name: "Favorites", sortOrder: 0, isDefault: true });
    await t.mutation(internal.migration.upsertGroupMember, { groupLegacyId: "g-1", recipeLegacyId: "r-1" });
    await t.mutation(internal.migration.upsertGroupMember, { groupLegacyId: "g-1", recipeLegacyId: "r-1" });
    expect((await alice.query(api.recipeGroups.members, {}))[g]).toEqual([r1]);
    expect(await t.mutation(internal.migration.upsertMealPlan, { userLegacyId: "sb-1", recipeLegacyId: "r-1", date: "2026-03-02", mealType: "dinner", isLeftover: false, position: 0 })).toBe(true);
    expect(await t.mutation(internal.migration.upsertMealPlan, { userLegacyId: "sb-1", recipeLegacyId: "r-1", date: "2026-03-02", mealType: "dinner", isLeftover: false, position: 0 })).toBe(false);
  });
});

describe("migration action", () => {
  const base = "https://supabase.example.com";
  const image = `${base}/storage/v1/object/public/recipe-images/pasta.jpg`;
  const recipe = { id: "r-1", user_id: "sb-1", title: "Pasta", image, created_at: "2026-02-25T00:00:00Z" };
  const tables: Record<string, Record<string, unknown>[]> = {
    recipes: [recipe],
    recipe_ingredients: [{ id: "i-2", recipe_id: "r-1", sort_order: 1, text: "salt" }, { id: "i-1", recipe_id: "r-1", sort_order: 0, text: "pasta" }],
    recipe_instructions: [{ id: "s-1", recipe_id: "r-1", sort_order: 0, text: "Boil" }],
    recipe_tags: [{ id: "tag-1", recipe_id: "r-1", tag: "dinner" }],
    recipe_groups: [{ id: "g-1", user_id: "sb-1", name: "Favorites" }],
    recipe_group_members: [{ id: "gm-1", group_id: "g-1", recipe_id: "r-1" }],
    meal_plans: [{ id: "p-1", user_id: "sb-1", recipe_id: "r-1", date: "2026-03-02", meal_type: "dinner" }],
    meal_templates: [{ id: "t-1", user_id: "sb-1", name: "Week", template: { "0": { dinner: [{ recipeId: "r-1" }] } } }],
    issue_report_members: [{ user_id: "sb-1" }],
    profiles: [{ id: "sb-1", email: "alice@example.com", display_name: "Alice Cooks" }],
    shopping_items: [{ id: "si-1", user_id: "sb-1", text: "milk", checked: false, recipe_id: "r-1" }],
    grocery_items: [{ id: "gi-1", user_id: "sb-1", text: "bananas", checked: true, created_at: "2026-02-25T00:00:00Z" }],
    checked_ingredients: [{ id: "ci-1", user_id: "sb-1", recipe_id: "r-1", ingredient_index: 1 }],
    issue_reports: [{ id: "ir-1", reporter_id: "sb-1", reporter_email: "alice@example.com", title: "Bug", description: "It broke", severity: "high", status: "open", created_at: "2026-02-25T00:00:00Z" }],
  };

  function mockSupabase(rows = tables) {
    vi.stubEnv("SUPABASE_URL", base);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
    const imageFetch = vi.fn(() => new Response("image"));
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (url.href === image) return imageFetch();
      if (url.pathname === "/auth/v1/admin/users") return Response.json({ users: [{ id: "sb-1", email: "alice@example.com" }] });
      const table = url.pathname.replace("/rest/v1/", "");
      if (!(table in rows)) throw new Error(`Unexpected table ${table}`);
      const offset = Number(new Headers(init?.headers).get("Range")?.split("-")[0] ?? 0);
      if (offset >= rows[table].length && offset > 0) return new Response(null, { status: 416 });
      return Response.json(rows[table].slice(offset, offset + 1000));
    });
    vi.stubGlobal("fetch", fetchMock);
    return { imageFetch, fetchMock };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("retries failed images on rerun, preserves stored images, and remaps templates", async () => {
    const t = makeTest();
    await t.withIdentity(ALICE).mutation(api.users.ensure, {});
    const { imageFetch } = mockSupabase();
    imageFetch.mockReturnValueOnce(new Response(null, { status: 503 }));
    const first = await t.action(internal.migration.run, { apply: true, skipUnmatched: false });
    expect(first.images).toEqual({ copied: 0, failed: ["r-1: 503"] });
    const existing = await t.query(internal.migration.findRecipeByLegacyId, { legacyId: "r-1" });
    expect(existing?.imageStorageId).toBeUndefined();
    const preview = await t.action(internal.migration.run, { apply: false, skipUnmatched: false });
    expect(preview.images).toEqual({ copied: 1, failed: [] });
    expect(imageFetch).toHaveBeenCalledTimes(1);
    const second = await t.action(internal.migration.run, { apply: true, skipUnmatched: false });
    expect(second.images).toEqual({ copied: 1, failed: [] });
    const stored = await t.query(internal.migration.findRecipeByLegacyId, { legacyId: "r-1" });
    expect(stored?.id).toBe(existing?.id);
    expect(stored?.imageStorageId).toBeDefined();
    expect(await t.run((ctx) => ctx.db.query("recipes").collect())).toEqual([
      expect.objectContaining({ ingredients: ["pasta", "salt"], instructions: ["Boil"], tags: ["dinner"] }),
    ]);
    expect(await t.run((ctx) => ctx.db.query("mealTemplates").collect())).toEqual([
      expect.objectContaining({ days: { "0": { breakfast: [], lunch: [], dinner: [{ recipeId: stored?.id, isLeftover: false, position: 0 }], snack: [] } } }),
    ]);
    for (const apply of [false, true]) {
      expect((await t.action(internal.migration.run, { apply, skipUnmatched: false })).images).toEqual({ copied: 0, failed: [] });
    }
    expect(imageFetch).toHaveBeenCalledTimes(2);
    expect(await t.query(internal.migration.findRecipeByLegacyId, { legacyId: "r-1" })).toEqual(stored);
  });

  it("imports lists, checked ingredients, issue reports and the profile display name", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    const userId = await alice.mutation(api.users.ensure, {});
    mockSupabase();
    const summary = await t.action(internal.migration.run, { apply: true, skipUnmatched: false });
    expect(summary.shoppingItems).toEqual({ read: 1, written: 1 });
    expect(summary.groceryItems).toEqual({ read: 1, written: 1 });
    expect(summary.checkedIngredients).toEqual({ read: 1, written: 1 });
    expect(summary.issueReports).toEqual({ read: 1, written: 1 });

    expect((await t.run((ctx) => ctx.db.get(userId)))?.displayName).toBe("Alice Cooks");
    const recipeId = (await t.query(internal.migration.findRecipeByLegacyId, { legacyId: "r-1" }))?.id;
    expect((await alice.query(api.shoppingItems.list, {})).map((i) => [i.text, i.checked, i.recipeId])).toEqual([["milk", false, recipeId]]);
    expect((await alice.query(api.groceryItems.list, {})).map((i) => [i.text, i.checked])).toEqual([["bananas", true]]);
    expect(await alice.query(api.checkedIngredients.list, {})).toEqual({ [recipeId!]: [1] });
    expect(await t.run((ctx) => ctx.db.query("issueReports").collect())).toEqual([
      expect.objectContaining({ legacyId: "ir-1", reporterId: userId, reporterEmail: "alice@example.com", title: "Bug", severity: "high", status: "open" }),
    ]);

    // Rerun: the per-user imports are skipped and the report is upserted.
    const second = await t.action(internal.migration.run, { apply: true, skipUnmatched: false });
    expect(second.shoppingItems).toEqual({ read: 1, written: 0 });
    expect(second.groceryItems).toEqual({ read: 1, written: 0 });
    expect(second.checkedIngredients).toEqual({ read: 1, written: 0 });
    expect(await alice.query(api.shoppingItems.list, {})).toHaveLength(1);
    expect(await alice.query(api.groceryItems.list, {})).toHaveLength(1);
    expect(await t.run((ctx) => ctx.db.query("issueReports").collect())).toHaveLength(1);
  });

  it("counts eligible images in dry run without writing or fetching images", async () => {
    const t = makeTest();
    const userId = await t.withIdentity(ALICE).mutation(api.users.ensure, {});
    const { imageFetch } = mockSupabase({ ...tables, recipes: [recipe, { ...recipe, id: "r-2", image: "https://external.example.com/image.jpg" }, { ...recipe, id: "r-3", image: null }] });
    const summary = await t.action(internal.migration.run, { apply: false, skipUnmatched: false });
    expect(summary.users).toEqual({ read: 1, linked: 1, unmatched: [] });
    expect(summary.recipes).toEqual({ read: 3, written: 3 });
    expect(summary.images).toEqual({ copied: 1, failed: [] });
    expect(imageFetch).not.toHaveBeenCalled();
    expect((await t.run((ctx) => ctx.db.get(userId)))?.legacyId).toBeUndefined();
    await t.run(async (ctx) => {
      for (const table of ["recipes", "recipeGroups", "recipeGroupMembers", "mealPlans", "mealTemplates", "issueReportMembers", "shoppingItems", "groceryItems", "checkedIngredients", "issueReports"] as const) {
        expect(await ctx.db.query(table).collect()).toEqual([]);
      }
      expect(await ctx.db.system.query("_storage").collect()).toEqual([]);
    });
  });

  it("excludes unmatched users in both modes and retains the apply-mode error", async () => {
    const t = makeTest();
    const { imageFetch } = mockSupabase();
    const preview = await t.action(internal.migration.run, { apply: false, skipUnmatched: false });
    const applied = await t.action(internal.migration.run, { apply: true, skipUnmatched: true });
    expect(preview).toEqual(applied);
    expect(preview.users).toEqual({ read: 1, linked: 0, unmatched: ["alice@example.com"] });
    for (const counts of [preview.recipes, preview.groups, preview.groupMembers, preview.mealPlans, preview.templates, preview.issueMembers, preview.shoppingItems, preview.groceryItems, preview.checkedIngredients]) {
      expect(counts).toMatchObject({ read: 1, written: 0 });
    }
    expect(preview.images).toEqual({ copied: 0, failed: [] });
    expect(imageFetch).not.toHaveBeenCalled();
    await expect(t.action(internal.migration.run, { apply: true, skipUnmatched: false })).rejects.toThrow("Unmatched Supabase users: alice@example.com");
  });

  it("uses deterministic pagination orders and ends pagination on HTTP 416", async () => {
    const t = makeTest();
    const { fetchMock } = mockSupabase({ ...tables, recipes: Array.from({ length: 1000 }, (_, i) => ({ ...recipe, id: `r-${i}` })) });
    const summary = await t.action(internal.migration.run, { apply: false, skipUnmatched: false });
    expect(summary.recipes.read).toBe(1000);
    const requests = fetchMock.mock.calls.map(([input, init]) => ({ url: new URL(String(input)), range: new Headers(init?.headers).get("Range") }));
    const orders: Record<string, string> = {
      recipes: "created_at,id", recipe_ingredients: "sort_order,id", recipe_instructions: "sort_order,id", recipe_tags: "id,id",
      recipe_groups: "sort_order,id", recipe_group_members: "id,id", meal_plans: "date,id", meal_templates: "created_at,id", issue_report_members: "user_id",
      profiles: "id", shopping_items: "id", grocery_items: "created_at,id", checked_ingredients: "id", issue_reports: "created_at,id",
    };
    for (const [table, order] of Object.entries(orders)) {
      expect(requests.filter((r) => r.url.pathname === `/rest/v1/${table}`).map((r) => r.url.searchParams.get("order"))).toEqual(table === "recipes" ? [order, order] : [order]);
    }
    expect(requests.filter((r) => r.url.pathname === "/rest/v1/recipes").map((r) => r.range)).toEqual(["0-999", "1000-1999"]);
  });
});
