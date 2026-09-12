# Convex + Clerk Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Supabase (Postgres, Auth, Storage) with Convex for data and files and Clerk for auth, migrating all production data, in one cutover.

**Architecture:** Convex backend modules (one per domain) with `requireUser` ownership checks replace row-level security. Clerk handles sign-in and provides the JWT Convex validates. The Next.js client consumes Convex queries through thin typed hooks in `src/lib/convex/`, zustand keeps only cooking-mode state, and three Next route handlers remain for scraping, image persistence, and account deletion. A Convex internal action imports the Supabase data.

**Tech Stack:** Next.js 16.1 (App Router, Turbopack), React 19, `convex` 1.45, `@clerk/nextjs` 7.9, `convex-test` 0.0.57, Vitest 3.2 (projects: jsdom + edge-runtime), Playwright with `@clerk/testing`, Tailwind 4, zod 4.

**Spec:** `docs/superpowers/specs/2026-09-11-convex-migration-design.md`

## Global Constraints

- Package manager: **bun**. Use `bun add`, `bun add -d`, `bun run <script>`, `bunx`. Never npm or yarn. Task 1 switches the lockfile to `bun.lock` and deletes `package-lock.json`.
- TypeScript: no `any`. Convex validators define the types; derive client types from `Doc<"table">` and the existing `src/types/index.ts` interfaces.
- The existing client-facing interfaces in `src/types/index.ts` (`Recipe`, `MealPlan`, `MealPlanDay`, `MealSlotEntry`, `ShoppingItem`, `GroceryItem`, `MealTemplate`, `RecipeGroup`, `IssueReport`, `Profile`) stay unchanged. Convex queries return data already shaped to them so components change as little as possible. Ids are Convex ids typed as `string` at the boundary.
- Every public Convex query and mutation calls `requireUser(ctx)` first. Internal functions are the only exception.
- Verification for every task: `bun run typecheck` and `bun run lint` pass; `bun run test` passes. Commit after each task with the message given.
- Env variable names (exact): `NEXT_PUBLIC_CONVEX_URL`, `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_ISSUER_DOMAIN`, `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/signup`, `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/`, `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/`. Clerk keys and issuer domain are already in `.env.local`.
- Clerk JWT template name for Convex: `convex` (created by the Clerk Convex integration, already activated). Verify on the Clerk dashboard JWT templates page before Task 10 if `getToken({ template: "convex" })` returns null.
- Nothing in Supabase is modified or deleted by any task.
- Tasks 1–6 (backend) leave the running app untouched. Tasks 7–9 are the frontend swap; the app is not runnable end to end until Task 9 finishes, but typecheck, lint, and unit tests must pass after each task.
- Work on branch `convex-migration`.

## File structure

Created:
- `convex/schema.ts` — tables, indexes, shared validators
- `convex/auth.config.ts` — Clerk issuer
- `convex/lib/auth.ts` — `requireUser`, `requireOwnedRecipe`
- `convex/lib/shape.ts` — doc → client type mappers
- `convex/users.ts`, `convex/recipes.ts`, `convex/images.ts`, `convex/mealPlans.ts`, `convex/mealTemplates.ts`, `convex/shoppingItems.ts`, `convex/groceryItems.ts`, `convex/checkedIngredients.ts`, `convex/recipeGroups.ts`, `convex/issueReports.ts`, `convex/migration.ts` — one module per domain, each with a `*.test.ts`
- `convex/test.setup.ts` — shared `convexTest` factory
- `src/proxy.ts` — Clerk middleware with strict CSP
- `src/components/convex-client-provider.tsx` — Clerk + Convex providers, `EnsureUser`
- `src/lib/convex/use-user.ts`, `use-recipes.ts`, `use-meal-plan.ts`, `use-templates.ts`, `use-shopping.ts`, `use-grocery.ts`, `use-checked.ts`, `use-groups.ts`, `use-issues.ts`, `use-offline-snapshot.ts` — typed hooks
- `e2e/global.setup.ts` — Clerk testing token + sign-in
- `scripts/migrate.md` — how to run the migration action

Modified: `package.json`, `vitest.config.ts`, `playwright.config.ts`, `src/app/layout.tsx`, `src/app/login/page.tsx`, `src/app/signup/page.tsx`, `src/app/page.tsx`, `src/app/recipes/page.tsx`, `src/app/recipes/[id]/page.tsx`, `src/app/cook/page.tsx`, `src/app/meal-plan/page.tsx`, `src/app/shopping-list/page.tsx`, `src/app/profile/page.tsx`, `src/app/issues/page.tsx`, `src/components/*.tsx` (13 files), `src/stores/recipe-store.ts`, `src/stores/recipe-store.test.ts`, `src/app/api/scrape/route.ts`, `src/app/api/persist-image/route.ts`, `src/app/api/account/delete/route.ts`, their tests, `e2e/core-loop.spec.ts`, `.env.local.example`, `.gitignore`.

Deleted (Task 13): `src/lib/supabase/`, `src/middleware.ts`, `src/lib/supabase/middleware.test.ts`, `src/components/auth-provider.tsx`, `src/app/auth/`, `src/lib/offline-queue.ts`, `src/lib/offline-queue.test.ts`, `src/types/supabase.ts`, `scripts/backfill-images.mjs`, `package-lock.json`. `supabase/` stays until two weeks after cutover.

---

### Task 1: Convex project, schema, auth config, test harness

**Files:**
- Create: `convex/schema.ts`, `convex/auth.config.ts`, `convex/lib/auth.ts`, `convex/lib/shape.ts`, `convex/test.setup.ts`, `convex/schema.test.ts`
- Modify: `package.json`, `vitest.config.ts`, `.gitignore`, `.env.local.example`, `tsconfig.json`

**Interfaces:**
- Produces: `requireUser(ctx): Promise<Doc<"users">>`, `requireOwnedRecipe(ctx, userId, recipeId): Promise<Doc<"recipes">>`, `toRecipe(doc, imageUrl): Recipe`, `toGroup(doc): RecipeGroup`, `toIssue(doc): IssueReport`, `isoFromCreation(ms): string`, `makeTest()` test factory, shared validators `difficulty`, `mealType`, `severity`, `issueStatus`, `mealPlanDay`.

- [ ] **Step 1: Branch and switch to bun**

```bash
git checkout -b convex-migration
rm package-lock.json
bun install
bun add convex@1.45.0 @clerk/nextjs@7.9.2
bun add -d convex-test@0.0.57 @edge-runtime/vm@5.0.0 @clerk/testing@2.2.34
git add bun.lock package.json && git status --short
```

Expected: `bun.lock` created, `package-lock.json` gone, `node_modules` reinstalled. In `package.json` change `"test:e2e": "playwright test"` to stay, and change nothing else by hand.

- [ ] **Step 2: Create the Convex project and dev deployment**

```bash
bunx convex dev --once --configure=new --project cooksnap
```

If the CLI asks for a team, rerun with `--team <slug>` using the only team on the account. Expected output ends with `✔ Convex functions ready!` and `.env.local` now contains `CONVEX_DEPLOYMENT=dev:...` and `NEXT_PUBLIC_CONVEX_URL=https://....convex.cloud`. Then set the Clerk issuer on the deployment:

```bash
bunx convex env set CLERK_JWT_ISSUER_DOMAIN https://busy-mule-7049.clerk.accounts.dev
```

- [ ] **Step 3: Write the schema**

`convex/schema.ts`:

```ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const difficulty = v.union(v.literal("Easy"), v.literal("Medium"), v.literal("Hard"));
export const mealType = v.union(
  v.literal("breakfast"),
  v.literal("lunch"),
  v.literal("dinner"),
  v.literal("snack"),
);
export const severity = v.union(v.literal("low"), v.literal("medium"), v.literal("high"));
export const issueStatus = v.union(
  v.literal("open"),
  v.literal("in_progress"),
  v.literal("resolved"),
);
export const mealSlotEntry = v.object({
  recipeId: v.string(),
  isLeftover: v.boolean(),
  position: v.number(),
});
export const mealPlanDay = v.object({
  breakfast: v.array(mealSlotEntry),
  lunch: v.array(mealSlotEntry),
  dinner: v.array(mealSlotEntry),
  snack: v.array(mealSlotEntry),
});

export const recipeFields = {
  title: v.string(),
  image: v.optional(v.string()),
  imageStorageId: v.optional(v.id("_storage")),
  sourceUrl: v.string(),
  prepTime: v.optional(v.string()),
  cookTime: v.optional(v.string()),
  totalTime: v.optional(v.string()),
  servings: v.optional(v.string()),
  author: v.optional(v.string()),
  cuisineType: v.optional(v.string()),
  difficulty: v.optional(difficulty),
  rating: v.optional(v.number()),
  isFavorite: v.boolean(),
  notes: v.optional(v.string()),
  ingredients: v.array(v.string()),
  instructions: v.array(v.string()),
  tags: v.array(v.string()),
};

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    email: v.string(),
    displayName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    legacyId: v.optional(v.string()),
  })
    .index("by_clerkId", ["clerkId"])
    .index("by_email", ["email"])
    .index("by_legacyId", ["legacyId"]),

  recipes: defineTable({
    userId: v.id("users"),
    ...recipeFields,
    legacyId: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_legacyId", ["legacyId"]),

  mealPlans: defineTable({
    userId: v.id("users"),
    date: v.string(), // YYYY-MM-DD
    mealType,
    recipeId: v.id("recipes"),
    isLeftover: v.boolean(),
    position: v.number(),
  })
    .index("by_user_date", ["userId", "date"])
    .index("by_recipe", ["recipeId"]),

  mealTemplates: defineTable({
    userId: v.id("users"),
    name: v.string(),
    days: v.record(v.string(), mealPlanDay), // key = weekday index "0".."6"
    legacyId: v.optional(v.string()),
  }).index("by_user", ["userId"]),

  shoppingItems: defineTable({
    userId: v.id("users"),
    text: v.string(),
    checked: v.boolean(),
    recipeId: v.optional(v.id("recipes")),
  })
    .index("by_user", ["userId"])
    .index("by_recipe", ["recipeId"]),

  groceryItems: defineTable({
    userId: v.id("users"),
    text: v.string(),
    checked: v.boolean(),
  }).index("by_user", ["userId"]),

  checkedIngredients: defineTable({
    userId: v.id("users"),
    recipeId: v.id("recipes"),
    ingredientIndex: v.number(),
  })
    .index("by_user_recipe", ["userId", "recipeId"])
    .index("by_recipe", ["recipeId"]),

  recipeGroups: defineTable({
    userId: v.id("users"),
    name: v.string(),
    icon: v.optional(v.string()),
    sortOrder: v.number(),
    isDefault: v.boolean(),
    legacyId: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_legacyId", ["legacyId"]),

  recipeGroupMembers: defineTable({
    groupId: v.id("recipeGroups"),
    recipeId: v.id("recipes"),
  })
    .index("by_group", ["groupId"])
    .index("by_recipe", ["recipeId"]),

  issueReports: defineTable({
    reporterId: v.optional(v.id("users")),
    reporterEmail: v.optional(v.string()),
    title: v.string(),
    description: v.string(),
    steps: v.optional(v.string()),
    expected: v.optional(v.string()),
    actual: v.optional(v.string()),
    pageUrl: v.optional(v.string()),
    severity,
    status: issueStatus,
  }).index("by_status", ["status"]),

  issueReportMembers: defineTable({
    userId: v.id("users"),
  }).index("by_user", ["userId"]),
});
```

- [ ] **Step 4: Auth config and helpers**

`convex/auth.config.ts`:

```ts
import type { AuthConfig } from "convex/server";

export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
```

`convex/lib/auth.ts`:

```ts
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export type Ctx = QueryCtx | MutationCtx;

export async function requireUser(ctx: Ctx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Unauthenticated");
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
    .unique();
  if (!user) throw new ConvexError("User not provisioned");
  return user;
}

export async function requireOwnedRecipe(
  ctx: Ctx,
  userId: Id<"users">,
  recipeId: Id<"recipes">,
): Promise<Doc<"recipes">> {
  const recipe = await ctx.db.get(recipeId);
  if (!recipe || recipe.userId !== userId) throw new ConvexError("Recipe not found");
  return recipe;
}
```

`convex/lib/shape.ts`:

```ts
import type { Doc } from "../_generated/dataModel";
import type { IssueReport, Recipe, RecipeGroup } from "../../src/types";

export function isoFromCreation(ms: number): string {
  return new Date(ms).toISOString();
}

export function toRecipe(doc: Doc<"recipes">, imageUrl: string | null): Recipe {
  return {
    id: doc._id,
    title: doc.title,
    image: imageUrl ?? doc.image ?? null,
    ingredients: doc.ingredients,
    instructions: doc.instructions,
    sourceUrl: doc.sourceUrl,
    tags: doc.tags,
    createdAt: isoFromCreation(doc._creationTime),
    prepTime: doc.prepTime ?? null,
    cookTime: doc.cookTime ?? null,
    totalTime: doc.totalTime ?? null,
    servings: doc.servings ?? null,
    author: doc.author ?? null,
    cuisineType: doc.cuisineType ?? null,
    difficulty: doc.difficulty ?? null,
    rating: doc.rating ?? null,
    isFavorite: doc.isFavorite,
    notes: doc.notes ?? null,
  };
}

export function toGroup(doc: Doc<"recipeGroups">): RecipeGroup {
  return {
    id: doc._id,
    name: doc.name,
    icon: doc.icon ?? null,
    sortOrder: doc.sortOrder,
    isDefault: doc.isDefault,
    createdAt: isoFromCreation(doc._creationTime),
  };
}

export function toIssue(doc: Doc<"issueReports">): IssueReport {
  return {
    id: doc._id,
    reporterId: doc.reporterId ?? "",
    reporterEmail: doc.reporterEmail ?? null,
    title: doc.title,
    description: doc.description,
    steps: doc.steps ?? null,
    expected: doc.expected ?? null,
    actual: doc.actual ?? null,
    pageUrl: doc.pageUrl ?? null,
    severity: doc.severity,
    status: doc.status,
    createdAt: isoFromCreation(doc._creationTime),
    updatedAt: isoFromCreation(doc._creationTime),
  };
}
```

- [ ] **Step 5: Vitest projects and test factory**

Replace `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: "app",
          environment: "jsdom",
          include: ["src/**/*.test.{ts,tsx}"],
        },
      },
      {
        extends: true,
        test: {
          name: "convex",
          environment: "edge-runtime",
          include: ["convex/**/*.test.ts"],
          server: { deps: { inline: ["convex-test"] } },
        },
      },
    ],
  },
});
```

`convex/test.setup.ts`:

```ts
import { convexTest } from "convex-test";
import schema from "./schema";

export const modules = import.meta.glob("./**/*.*s", { eager: false });

export function makeTest() {
  return convexTest(schema, modules);
}

export const ALICE = { subject: "user_alice", email: "alice@example.com", name: "Alice" };
export const BOB = { subject: "user_bob", email: "bob@example.com", name: "Bob" };
```

Add `"convex/**/*.ts"` to `tsconfig.json` `include` if it lists paths explicitly (it currently includes `**/*.ts`, so no change is needed; verify with `grep include tsconfig.json`). Add `convex/_generated/` is generated and committed (Convex convention: commit it). Add to `.gitignore` nothing new.

- [ ] **Step 6: Write the failing schema smoke test**

`convex/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeTest } from "./test.setup";

describe("schema", () => {
  it("accepts a user and a recipe", async () => {
    const t = makeTest();
    const recipeId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { clerkId: "u1", email: "a@b.c" });
      return ctx.db.insert("recipes", {
        userId,
        title: "Toast",
        sourceUrl: "",
        isFavorite: false,
        ingredients: ["bread"],
        instructions: ["toast it"],
        tags: [],
      });
    });
    expect(recipeId).toBeTruthy();
  });
});
```

- [ ] **Step 7: Run tests**

```bash
bunx convex codegen
bun run test
```

Expected: the `convex` project runs `schema.test.ts` and passes; the `app` project still passes all 500 existing tests.

- [ ] **Step 8: Env example and commit**

Append to `.env.local.example`:

```
# Convex
CONVEX_DEPLOYMENT=dev:your-deployment
NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_JWT_ISSUER_DOMAIN=https://your-instance.clerk.accounts.dev
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/signup
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/
```

Also append the four `NEXT_PUBLIC_CLERK_*_URL` lines to `.env.local`.

```bash
bun run typecheck && bun run lint
git add -A && git commit -m "chore: add Convex schema, Clerk auth config, and convex-test harness"
```

---

### Task 2: users module

**Files:**
- Create: `convex/users.ts`, `convex/users.test.ts`

**Interfaces:**
- Consumes: `requireUser`, `isoFromCreation`.
- Produces: `api.users.ensure` (mutation, no args, returns `Id<"users">`), `api.users.current` (query → `Profile | null`), `api.users.updateDisplayName({ displayName })`, `api.users.isIssueMember` (query → boolean), `api.users.deleteAccount` (mutation, purges everything owned by the caller, returns `{ deleted: true }`).

- [ ] **Step 1: Failing tests**

`convex/users.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { ALICE, BOB, makeTest } from "./test.setup";

describe("users", () => {
  it("ensure creates once and is idempotent", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    const id1 = await alice.mutation(api.users.ensure, {});
    const id2 = await alice.mutation(api.users.ensure, {});
    expect(id1).toBe(id2);
    const me = await alice.query(api.users.current, {});
    expect(me?.email).toBe("alice@example.com");
  });

  it("current is null when signed out or not provisioned", async () => {
    const t = makeTest();
    expect(await t.query(api.users.current, {})).toBeNull();
    expect(await t.withIdentity(BOB).query(api.users.current, {})).toBeNull();
  });

  it("deleteAccount removes every owned row", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    const userId = await alice.mutation(api.users.ensure, {});
    await t.run(async (ctx) => {
      const recipeId = await ctx.db.insert("recipes", {
        userId, title: "T", sourceUrl: "", isFavorite: false,
        ingredients: [], instructions: [], tags: [],
      });
      await ctx.db.insert("shoppingItems", { userId, text: "x", checked: false, recipeId });
      await ctx.db.insert("mealPlans", {
        userId, date: "2026-09-14", mealType: "dinner", recipeId, isLeftover: false, position: 0,
      });
      const groupId = await ctx.db.insert("recipeGroups", {
        userId, name: "Favorites", sortOrder: 0, isDefault: true,
      });
      await ctx.db.insert("recipeGroupMembers", { groupId, recipeId });
    });
    await alice.mutation(api.users.deleteAccount, {});
    const counts = await t.run(async (ctx) => ({
      users: (await ctx.db.query("users").collect()).length,
      recipes: (await ctx.db.query("recipes").collect()).length,
      shopping: (await ctx.db.query("shoppingItems").collect()).length,
      plans: (await ctx.db.query("mealPlans").collect()).length,
      groups: (await ctx.db.query("recipeGroups").collect()).length,
      members: (await ctx.db.query("recipeGroupMembers").collect()).length,
    }));
    expect(counts).toEqual({ users: 0, recipes: 0, shopping: 0, plans: 0, groups: 0, members: 0 });
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
bun run test --project convex
```

Expected: FAIL, `api.users` is undefined.

- [ ] **Step 3: Implement**

`convex/users.ts`:

```ts
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { isoFromCreation } from "./lib/shape";
import type { Profile } from "../src/types";

export const ensure = mutation({
  args: {},
  handler: async (ctx): Promise<Id<"users">> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Unauthenticated");
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    const email = identity.email ?? "";
    const avatarUrl = identity.pictureUrl ?? undefined;
    if (existing) {
      if (existing.email !== email || existing.avatarUrl !== avatarUrl) {
        await ctx.db.patch(existing._id, { email, avatarUrl });
      }
      return existing._id;
    }
    return ctx.db.insert("users", {
      clerkId: identity.subject,
      email,
      displayName: identity.name ?? undefined,
      avatarUrl,
    });
  },
});

export const current = query({
  args: {},
  handler: async (ctx): Promise<Profile | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) return null;
    return {
      id: user._id,
      email: user.email,
      displayName: user.displayName ?? null,
      avatarUrl: user.avatarUrl ?? null,
      createdAt: isoFromCreation(user._creationTime),
      updatedAt: isoFromCreation(user._creationTime),
    };
  },
});

export const updateDisplayName = mutation({
  args: { displayName: v.string() },
  handler: async (ctx, { displayName }) => {
    const user = await requireUser(ctx);
    const trimmed = displayName.trim();
    if (trimmed.length === 0 || trimmed.length > 80) throw new ConvexError("Display name must be 1–80 characters");
    await ctx.db.patch(user._id, { displayName: trimmed });
  },
});

export const isIssueMember = query({
  args: {},
  handler: async (ctx): Promise<boolean> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return false;
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) return false;
    const member = await ctx.db
      .query("issueReportMembers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    return member !== null;
  },
});

export async function purgeUser(ctx: MutationCtx, userId: Id<"users">): Promise<void> {
  const recipes = await ctx.db.query("recipes").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
  for (const recipe of recipes) {
    for (const m of await ctx.db.query("recipeGroupMembers").withIndex("by_recipe", (q) => q.eq("recipeId", recipe._id)).collect()) {
      await ctx.db.delete(m._id);
    }
    for (const c of await ctx.db.query("checkedIngredients").withIndex("by_recipe", (q) => q.eq("recipeId", recipe._id)).collect()) {
      await ctx.db.delete(c._id);
    }
    if (recipe.imageStorageId) await ctx.storage.delete(recipe.imageStorageId);
    await ctx.db.delete(recipe._id);
  }
  for (const table of ["mealPlans", "mealTemplates", "shoppingItems", "groceryItems", "recipeGroups", "issueReportMembers"] as const) {
    const rows = await ctx.db.query(table).withIndex("by_user", (q) => q.eq("userId", userId)).collect();
    for (const row of rows) await ctx.db.delete(row._id);
  }
  const reports = await ctx.db.query("issueReports").collect();
  for (const r of reports) {
    if (r.reporterId === userId) await ctx.db.patch(r._id, { reporterId: undefined });
  }
  await ctx.db.delete(userId);
}

export const deleteAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    await purgeUser(ctx, user._id);
    return { deleted: true as const };
  },
});
```

Note: `mealPlans` has index `by_user_date`, not `by_user`. In `purgeUser`, query mealPlans with `.withIndex("by_user_date", (q) => q.eq("userId", userId))` (prefix match on the compound index) instead of the loop above for that table. Write it as a separate statement before the loop and remove `"mealPlans"` from the loop array.

- [ ] **Step 4: Run tests, lint, commit**

```bash
bunx convex codegen && bun run test --project convex && bun run typecheck && bun run lint
git add -A && git commit -m "feat(convex): users module with ensure, current, deleteAccount"
```

---

### Task 3: recipes and images modules

**Files:**
- Create: `convex/recipes.ts`, `convex/images.ts`, `convex/recipes.test.ts`

**Interfaces:**
- Consumes: `requireUser`, `requireOwnedRecipe`, `toRecipe`, `recipeFields`, `difficulty`.
- Produces:
  - `api.recipes.list` (query → `Recipe[]`, newest first)
  - `api.recipes.get({ id })` (query → `Recipe | null`)
  - `api.recipes.create({ title, image?, ingredients, instructions, sourceUrl, prepTime?, cookTime?, totalTime?, servings?, author?, cuisineType?, tags })` → `Id<"recipes">`
  - `api.recipes.update({ id, updates })` where `updates` is a partial of `{ title, image, ingredients, instructions, tags, prepTime, cookTime, totalTime, servings, author, cuisineType, difficulty, rating, isFavorite, notes }` (all optional; pass `null` to clear a nullable text field)
  - `api.recipes.setTags({ id, tags })`
  - `api.recipes.remove({ id })` (cascades: mealPlans, checkedIngredients, group memberships, shopping item links, storage file)
  - `api.images.generateUploadUrl` (mutation → string)
  - `api.images.attach({ recipeId, storageId })` (mutation → resolved image URL string)

- [ ] **Step 1: Failing tests**

`convex/recipes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { ALICE, BOB, makeTest } from "./test.setup";

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
```

- [ ] **Step 2: Run to verify failure**

```bash
bun run test --project convex
```

Expected: FAIL on `api.recipes`.

- [ ] **Step 3: Implement recipes**

`convex/recipes.ts`:

```ts
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { requireOwnedRecipe, requireUser } from "./lib/auth";
import { toRecipe } from "./lib/shape";
import { difficulty } from "./schema";
import type { Recipe } from "../src/types";

const nullableText = v.optional(v.union(v.string(), v.null()));

export const list = query({
  args: {},
  handler: async (ctx): Promise<Recipe[]> => {
    const user = await requireUser(ctx);
    const docs = await ctx.db
      .query("recipes")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
    return Promise.all(
      docs.map(async (d) => toRecipe(d, d.imageStorageId ? await ctx.storage.getUrl(d.imageStorageId) : null)),
    );
  },
});

export const get = query({
  args: { id: v.id("recipes") },
  handler: async (ctx, { id }): Promise<Recipe | null> => {
    const user = await requireUser(ctx);
    const doc = await ctx.db.get(id);
    if (!doc || doc.userId !== user._id) return null;
    return toRecipe(doc, doc.imageStorageId ? await ctx.storage.getUrl(doc.imageStorageId) : null);
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    image: v.optional(v.union(v.string(), v.null())),
    ingredients: v.array(v.string()),
    instructions: v.array(v.string()),
    sourceUrl: v.string(),
    prepTime: nullableText,
    cookTime: nullableText,
    totalTime: nullableText,
    servings: nullableText,
    author: nullableText,
    cuisineType: nullableText,
    tags: v.array(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"recipes">> => {
    const user = await requireUser(ctx);
    if (args.title.trim().length === 0) throw new ConvexError("Title is required");
    return ctx.db.insert("recipes", {
      userId: user._id,
      title: args.title,
      image: args.image ?? undefined,
      ingredients: args.ingredients,
      instructions: args.instructions,
      sourceUrl: args.sourceUrl,
      prepTime: args.prepTime ?? undefined,
      cookTime: args.cookTime ?? undefined,
      totalTime: args.totalTime ?? undefined,
      servings: args.servings ?? undefined,
      author: args.author ?? undefined,
      cuisineType: args.cuisineType ?? undefined,
      tags: args.tags,
      isFavorite: false,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("recipes"),
    updates: v.object({
      title: v.optional(v.string()),
      image: v.optional(v.union(v.string(), v.null())),
      ingredients: v.optional(v.array(v.string())),
      instructions: v.optional(v.array(v.string())),
      tags: v.optional(v.array(v.string())),
      prepTime: nullableText,
      cookTime: nullableText,
      totalTime: nullableText,
      servings: nullableText,
      author: nullableText,
      cuisineType: nullableText,
      difficulty: v.optional(v.union(difficulty, v.null())),
      rating: v.optional(v.union(v.number(), v.null())),
      isFavorite: v.optional(v.boolean()),
      notes: nullableText,
    }),
  },
  handler: async (ctx, { id, updates }) => {
    const user = await requireUser(ctx);
    await requireOwnedRecipe(ctx, user._id, id);
    if (updates.rating !== undefined && updates.rating !== null && (updates.rating < 1 || updates.rating > 5 || !Number.isInteger(updates.rating))) {
      throw new ConvexError("Rating must be 1–5");
    }
    if (updates.title !== undefined && updates.title.trim().length === 0) throw new ConvexError("Title is required");
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined) continue;
      patch[key] = value === null ? undefined : value;
    }
    await ctx.db.patch(id, patch);
  },
});

export const setTags = mutation({
  args: { id: v.id("recipes"), tags: v.array(v.string()) },
  handler: async (ctx, { id, tags }) => {
    const user = await requireUser(ctx);
    await requireOwnedRecipe(ctx, user._id, id);
    await ctx.db.patch(id, { tags });
  },
});

export async function cascadeDeleteRecipe(ctx: MutationCtx, recipeId: Id<"recipes">): Promise<void> {
  const recipe = await ctx.db.get(recipeId);
  if (!recipe) return;
  for (const row of await ctx.db.query("mealPlans").withIndex("by_recipe", (q) => q.eq("recipeId", recipeId)).collect()) await ctx.db.delete(row._id);
  for (const row of await ctx.db.query("checkedIngredients").withIndex("by_recipe", (q) => q.eq("recipeId", recipeId)).collect()) await ctx.db.delete(row._id);
  for (const row of await ctx.db.query("recipeGroupMembers").withIndex("by_recipe", (q) => q.eq("recipeId", recipeId)).collect()) await ctx.db.delete(row._id);
  for (const row of await ctx.db.query("shoppingItems").withIndex("by_recipe", (q) => q.eq("recipeId", recipeId)).collect()) await ctx.db.patch(row._id, { recipeId: undefined });
  if (recipe.imageStorageId) await ctx.storage.delete(recipe.imageStorageId);
  await ctx.db.delete(recipeId);
}

export const remove = mutation({
  args: { id: v.id("recipes") },
  handler: async (ctx, { id }) => {
    const user = await requireUser(ctx);
    await requireOwnedRecipe(ctx, user._id, id);
    await cascadeDeleteRecipe(ctx, id);
  },
});
```

`ctx.db.patch(id, patch)` with `Record<string, unknown>` will not typecheck. Build the patch as `Partial<Doc<"recipes">>` instead: declare `const patch: Partial<Omit<Doc<"recipes">, "_id" | "_creationTime" | "userId">> = {};` and assign per key with a typed helper:

```ts
function normalize<T>(value: T | null | undefined): T | undefined {
  return value === null ? undefined : value;
}
const patch = {
  ...(updates.title !== undefined && { title: updates.title }),
  ...(updates.image !== undefined && { image: normalize(updates.image) }),
  ...(updates.ingredients !== undefined && { ingredients: updates.ingredients }),
  ...(updates.instructions !== undefined && { instructions: updates.instructions }),
  ...(updates.tags !== undefined && { tags: updates.tags }),
  ...(updates.prepTime !== undefined && { prepTime: normalize(updates.prepTime) }),
  ...(updates.cookTime !== undefined && { cookTime: normalize(updates.cookTime) }),
  ...(updates.totalTime !== undefined && { totalTime: normalize(updates.totalTime) }),
  ...(updates.servings !== undefined && { servings: normalize(updates.servings) }),
  ...(updates.author !== undefined && { author: normalize(updates.author) }),
  ...(updates.cuisineType !== undefined && { cuisineType: normalize(updates.cuisineType) }),
  ...(updates.difficulty !== undefined && { difficulty: normalize(updates.difficulty) }),
  ...(updates.rating !== undefined && { rating: normalize(updates.rating) }),
  ...(updates.isFavorite !== undefined && { isFavorite: updates.isFavorite }),
  ...(updates.notes !== undefined && { notes: normalize(updates.notes) }),
};
await ctx.db.patch(id, patch);
```

Use this typed version; delete the `Record<string, unknown>` loop.

- [ ] **Step 4: Implement images**

`convex/images.ts`:

```ts
import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireOwnedRecipe, requireUser } from "./lib/auth";

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx): Promise<string> => {
    await requireUser(ctx);
    return ctx.storage.generateUploadUrl();
  },
});

export const attach = mutation({
  args: { recipeId: v.id("recipes"), storageId: v.id("_storage") },
  handler: async (ctx, { recipeId, storageId }): Promise<string> => {
    const user = await requireUser(ctx);
    const recipe = await requireOwnedRecipe(ctx, user._id, recipeId);
    const url = await ctx.storage.getUrl(storageId);
    if (!url) throw new ConvexError("Uploaded file not found");
    if (recipe.imageStorageId && recipe.imageStorageId !== storageId) {
      await ctx.storage.delete(recipe.imageStorageId);
    }
    await ctx.db.patch(recipeId, { imageStorageId: storageId, image: url });
    return url;
  },
});
```

- [ ] **Step 5: Run tests, lint, commit**

```bash
bunx convex codegen && bun run test --project convex && bun run typecheck && bun run lint
git add -A && git commit -m "feat(convex): recipes and images modules"
```

---

### Task 4: meal plans and templates modules

**Files:**
- Create: `convex/mealPlans.ts`, `convex/mealTemplates.ts`, `convex/mealPlans.test.ts`

**Interfaces:**
- Consumes: `requireUser`, `requireOwnedRecipe`, `mealType`, `mealPlanDay`, `isoFromCreation`.
- Produces:
  - `api.mealPlans.forRange({ startDate, endDate })` (query → `MealPlan`, i.e. `Record<isoDate, MealPlanDay>` with only dates that have entries; `recipeId` is the Convex id string)
  - `api.mealPlans.forRecipe({ recipeId })` (query → `Array<{ date: string; mealType: MealSlot }>`)
  - `api.mealPlans.assign({ date, mealType, recipeId, isLeftover })` → `boolean` (false when the recipe is already in that slot)
  - `api.mealPlans.remove({ date, mealType, recipeId })`
  - `api.mealPlans.clearDates({ dates })`
  - `api.mealTemplates.list` (query → `MealTemplate[]`)
  - `api.mealTemplates.save({ name, days })` → `Id<"mealTemplates">`
  - `api.mealTemplates.apply({ templateId, weekDates })` (weekDates: 7 ISO dates Monday first; inserts each day's entries, skipping recipes the user no longer owns and duplicates)
  - `api.mealTemplates.remove({ id })`

- [ ] **Step 1: Failing tests**

`convex/mealPlans.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { ALICE, makeTest } from "./test.setup";

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
});
```

- [ ] **Step 2: Run to verify failure**

```bash
bun run test --project convex
```

- [ ] **Step 3: Implement mealPlans**

`convex/mealPlans.ts`:

```ts
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { requireOwnedRecipe, requireUser } from "./lib/auth";
import { mealType } from "./schema";
import type { MealPlan, MealPlanDay, MealSlot } from "../src/types";

function emptyDay(): MealPlanDay {
  return { breakfast: [], lunch: [], dinner: [], snack: [] };
}

export function groupPlan(rows: Doc<"mealPlans">[]): MealPlan {
  const plan: MealPlan = {};
  for (const row of rows) {
    const day = (plan[row.date] ??= emptyDay());
    day[row.mealType].push({ recipeId: row.recipeId, isLeftover: row.isLeftover, position: row.position });
  }
  for (const day of Object.values(plan)) {
    for (const slot of ["breakfast", "lunch", "dinner", "snack"] as const) day[slot].sort((a, b) => a.position - b.position);
  }
  return plan;
}

export const forRange = query({
  args: { startDate: v.string(), endDate: v.string() },
  handler: async (ctx, { startDate, endDate }): Promise<MealPlan> => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("mealPlans")
      .withIndex("by_user_date", (q) => q.eq("userId", user._id).gte("date", startDate).lte("date", endDate))
      .collect();
    return groupPlan(rows);
  },
});

export const forRecipe = query({
  args: { recipeId: v.id("recipes") },
  handler: async (ctx, { recipeId }): Promise<Array<{ date: string; mealType: MealSlot }>> => {
    const user = await requireUser(ctx);
    const rows = await ctx.db.query("mealPlans").withIndex("by_recipe", (q) => q.eq("recipeId", recipeId)).collect();
    return rows.filter((r) => r.userId === user._id).map((r) => ({ date: r.date, mealType: r.mealType }));
  },
});

export async function assignInternal(
  ctx: MutationCtx,
  userId: Id<"users">,
  args: { date: string; mealType: MealSlot; recipeId: Id<"recipes">; isLeftover: boolean },
): Promise<boolean> {
  const slotRows = await ctx.db
    .query("mealPlans")
    .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", args.date))
    .collect();
  const inSlot = slotRows.filter((r) => r.mealType === args.mealType);
  if (inSlot.some((r) => r.recipeId === args.recipeId)) return false;
  const position = inSlot.reduce((max, r) => Math.max(max, r.position + 1), 0);
  await ctx.db.insert("mealPlans", { userId, ...args, position });
  return true;
}

export const assign = mutation({
  args: { date: v.string(), mealType, recipeId: v.id("recipes"), isLeftover: v.boolean() },
  handler: async (ctx, args): Promise<boolean> => {
    const user = await requireUser(ctx);
    await requireOwnedRecipe(ctx, user._id, args.recipeId);
    return assignInternal(ctx, user._id, args);
  },
});

export const remove = mutation({
  args: { date: v.string(), mealType, recipeId: v.id("recipes") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("mealPlans")
      .withIndex("by_user_date", (q) => q.eq("userId", user._id).eq("date", args.date))
      .collect();
    for (const row of rows) {
      if (row.mealType === args.mealType && row.recipeId === args.recipeId) await ctx.db.delete(row._id);
    }
  },
});

export const clearDates = mutation({
  args: { dates: v.array(v.string()) },
  handler: async (ctx, { dates }) => {
    const user = await requireUser(ctx);
    for (const date of dates) {
      const rows = await ctx.db
        .query("mealPlans")
        .withIndex("by_user_date", (q) => q.eq("userId", user._id).eq("date", date))
        .collect();
      for (const row of rows) await ctx.db.delete(row._id);
    }
  },
});
```

- [ ] **Step 4: Implement mealTemplates**

`convex/mealTemplates.ts`:

```ts
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireUser } from "./lib/auth";
import { isoFromCreation } from "./lib/shape";
import { mealPlanDay } from "./schema";
import { assignInternal } from "./mealPlans";
import type { MealPlanDay, MealTemplate } from "../src/types";

const SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const;

export const list = query({
  args: {},
  handler: async (ctx): Promise<MealTemplate[]> => {
    const user = await requireUser(ctx);
    const docs = await ctx.db.query("mealTemplates").withIndex("by_user", (q) => q.eq("userId", user._id)).order("desc").collect();
    return docs.map((d) => ({
      id: d._id,
      name: d.name,
      days: Object.fromEntries(Object.entries(d.days).map(([k, day]) => [Number(k), day])) as Record<number, MealPlanDay>,
      createdAt: isoFromCreation(d._creationTime),
    }));
  },
});

export const save = mutation({
  args: { name: v.string(), days: v.record(v.string(), mealPlanDay) },
  handler: async (ctx, { name, days }): Promise<Id<"mealTemplates">> => {
    const user = await requireUser(ctx);
    if (name.trim().length === 0) throw new ConvexError("Template name is required");
    return ctx.db.insert("mealTemplates", { userId: user._id, name: name.trim(), days });
  },
});

export const apply = mutation({
  args: { templateId: v.id("mealTemplates"), weekDates: v.array(v.string()) },
  handler: async (ctx, { templateId, weekDates }) => {
    const user = await requireUser(ctx);
    const template = await ctx.db.get(templateId);
    if (!template || template.userId !== user._id) throw new ConvexError("Template not found");
    for (const [index, day] of Object.entries(template.days)) {
      const date = weekDates[Number(index)];
      if (!date) continue;
      for (const slot of SLOTS) {
        for (const entry of day[slot]) {
          const recipeId = ctx.db.normalizeId("recipes", entry.recipeId);
          if (!recipeId) continue;
          const recipe = await ctx.db.get(recipeId);
          if (!recipe || recipe.userId !== user._id) continue;
          await assignInternal(ctx, user._id, { date, mealType: slot, recipeId, isLeftover: entry.isLeftover });
        }
      }
    }
  },
});

export const remove = mutation({
  args: { id: v.id("mealTemplates") },
  handler: async (ctx, { id }) => {
    const user = await requireUser(ctx);
    const doc = await ctx.db.get(id);
    if (!doc || doc.userId !== user._id) throw new ConvexError("Template not found");
    await ctx.db.delete(id);
  },
});
```

- [ ] **Step 5: Run tests, lint, commit**

```bash
bunx convex codegen && bun run test --project convex && bun run typecheck && bun run lint
git add -A && git commit -m "feat(convex): meal plans and templates modules"
```

---

### Task 5: shopping, grocery, and checked-ingredient modules

**Files:**
- Create: `convex/shoppingItems.ts`, `convex/groceryItems.ts`, `convex/checkedIngredients.ts`, `convex/lists.test.ts`

**Interfaces:**
- Produces:
  - `api.shoppingItems.list` (query → `ShoppingItem[]` in creation order), `add({ text })`, `addMany({ items: Array<{ text; recipeId? }> })`, `toggle({ id })`, `updateText({ id, text })`, `uncheckAll`, `clearChecked`, `clear`, `restore({ items: Array<{ text; checked; recipeId? }> })` (replaces the whole list)
  - `api.groceryItems.list` (→ `GroceryItem[]`), `add({ text })`, `toggle({ id })`, `uncheckAll`, `clearChecked`, `clear`, `restore({ items: Array<{ text; checked }> })`
  - `api.checkedIngredients.list` (query → `Record<recipeId, number[]>`), `toggle({ recipeId, index })`, `clear({ recipeId })`

- [ ] **Step 1: Failing tests**

`convex/lists.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify failure**

```bash
bun run test --project convex
```

- [ ] **Step 3: Implement shoppingItems**

`convex/shoppingItems.ts`:

```ts
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireUser } from "./lib/auth";
import type { ShoppingItem } from "../src/types";

const MAX_TEXT = 500;

function checkText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_TEXT) throw new ConvexError(`Item text must be 1–${MAX_TEXT} characters`);
  return trimmed;
}

export const list = query({
  args: {},
  handler: async (ctx): Promise<ShoppingItem[]> => {
    const user = await requireUser(ctx);
    const rows = await ctx.db.query("shoppingItems").withIndex("by_user", (q) => q.eq("userId", user._id)).collect();
    return rows.map((r) => ({ id: r._id, text: r.text, checked: r.checked, ...(r.recipeId ? { recipeId: r.recipeId } : {}) }));
  },
});

export const add = mutation({
  args: { text: v.string() },
  handler: async (ctx, { text }): Promise<Id<"shoppingItems">> => {
    const user = await requireUser(ctx);
    return ctx.db.insert("shoppingItems", { userId: user._id, text: checkText(text), checked: false });
  },
});

export const addMany = mutation({
  args: { items: v.array(v.object({ text: v.string(), recipeId: v.optional(v.id("recipes")) })) },
  handler: async (ctx, { items }) => {
    const user = await requireUser(ctx);
    for (const item of items) {
      await ctx.db.insert("shoppingItems", { userId: user._id, text: checkText(item.text), checked: false, recipeId: item.recipeId });
    }
  },
});

export const toggle = mutation({
  args: { id: v.id("shoppingItems") },
  handler: async (ctx, { id }) => {
    const user = await requireUser(ctx);
    const row = await ctx.db.get(id);
    if (!row || row.userId !== user._id) throw new ConvexError("Item not found");
    await ctx.db.patch(id, { checked: !row.checked });
  },
});

export const updateText = mutation({
  args: { id: v.id("shoppingItems"), text: v.string() },
  handler: async (ctx, { id, text }) => {
    const user = await requireUser(ctx);
    const row = await ctx.db.get(id);
    if (!row || row.userId !== user._id) throw new ConvexError("Item not found");
    await ctx.db.patch(id, { text: checkText(text) });
  },
});

export const uncheckAll = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    for (const row of await ctx.db.query("shoppingItems").withIndex("by_user", (q) => q.eq("userId", user._id)).collect()) {
      if (row.checked) await ctx.db.patch(row._id, { checked: false });
    }
  },
});

export const clearChecked = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    for (const row of await ctx.db.query("shoppingItems").withIndex("by_user", (q) => q.eq("userId", user._id)).collect()) {
      if (row.checked) await ctx.db.delete(row._id);
    }
  },
});

export const clear = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    for (const row of await ctx.db.query("shoppingItems").withIndex("by_user", (q) => q.eq("userId", user._id)).collect()) await ctx.db.delete(row._id);
  },
});

export const restore = mutation({
  args: { items: v.array(v.object({ text: v.string(), checked: v.boolean(), recipeId: v.optional(v.id("recipes")) })) },
  handler: async (ctx, { items }) => {
    const user = await requireUser(ctx);
    for (const row of await ctx.db.query("shoppingItems").withIndex("by_user", (q) => q.eq("userId", user._id)).collect()) await ctx.db.delete(row._id);
    for (const item of items) {
      await ctx.db.insert("shoppingItems", { userId: user._id, text: checkText(item.text), checked: item.checked, recipeId: item.recipeId });
    }
  },
});
```

- [ ] **Step 4: Implement groceryItems**

`convex/groceryItems.ts` is the same shape without `recipeId`, `addMany`, or `updateText`:

```ts
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireUser } from "./lib/auth";
import type { GroceryItem } from "../src/types";

const MAX_TEXT = 500;
function checkText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_TEXT) throw new ConvexError(`Item text must be 1–${MAX_TEXT} characters`);
  return trimmed;
}

export const list = query({
  args: {},
  handler: async (ctx): Promise<GroceryItem[]> => {
    const user = await requireUser(ctx);
    const rows = await ctx.db.query("groceryItems").withIndex("by_user", (q) => q.eq("userId", user._id)).collect();
    return rows.map((r) => ({ id: r._id, text: r.text, checked: r.checked }));
  },
});

export const add = mutation({
  args: { text: v.string() },
  handler: async (ctx, { text }): Promise<Id<"groceryItems">> => {
    const user = await requireUser(ctx);
    return ctx.db.insert("groceryItems", { userId: user._id, text: checkText(text), checked: false });
  },
});

export const toggle = mutation({
  args: { id: v.id("groceryItems") },
  handler: async (ctx, { id }) => {
    const user = await requireUser(ctx);
    const row = await ctx.db.get(id);
    if (!row || row.userId !== user._id) throw new ConvexError("Item not found");
    await ctx.db.patch(id, { checked: !row.checked });
  },
});

export const uncheckAll = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    for (const row of await ctx.db.query("groceryItems").withIndex("by_user", (q) => q.eq("userId", user._id)).collect()) {
      if (row.checked) await ctx.db.patch(row._id, { checked: false });
    }
  },
});

export const clearChecked = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    for (const row of await ctx.db.query("groceryItems").withIndex("by_user", (q) => q.eq("userId", user._id)).collect()) {
      if (row.checked) await ctx.db.delete(row._id);
    }
  },
});

export const clear = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    for (const row of await ctx.db.query("groceryItems").withIndex("by_user", (q) => q.eq("userId", user._id)).collect()) await ctx.db.delete(row._id);
  },
});

export const restore = mutation({
  args: { items: v.array(v.object({ text: v.string(), checked: v.boolean() })) },
  handler: async (ctx, { items }) => {
    const user = await requireUser(ctx);
    for (const row of await ctx.db.query("groceryItems").withIndex("by_user", (q) => q.eq("userId", user._id)).collect()) await ctx.db.delete(row._id);
    for (const item of items) await ctx.db.insert("groceryItems", { userId: user._id, text: checkText(item.text), checked: item.checked });
  },
});
```

- [ ] **Step 5: Implement checkedIngredients**

`convex/checkedIngredients.ts`:

```ts
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOwnedRecipe, requireUser } from "./lib/auth";

export const list = query({
  args: {},
  handler: async (ctx): Promise<Record<string, number[]>> => {
    const user = await requireUser(ctx);
    const rows = await ctx.db.query("checkedIngredients").withIndex("by_user_recipe", (q) => q.eq("userId", user._id)).collect();
    const out: Record<string, number[]> = {};
    for (const row of rows) (out[row.recipeId] ??= []).push(row.ingredientIndex);
    for (const list of Object.values(out)) list.sort((a, b) => a - b);
    return out;
  },
});

export const toggle = mutation({
  args: { recipeId: v.id("recipes"), index: v.number() },
  handler: async (ctx, { recipeId, index }) => {
    const user = await requireUser(ctx);
    await requireOwnedRecipe(ctx, user._id, recipeId);
    const rows = await ctx.db.query("checkedIngredients").withIndex("by_user_recipe", (q) => q.eq("userId", user._id).eq("recipeId", recipeId)).collect();
    const existing = rows.find((r) => r.ingredientIndex === index);
    if (existing) await ctx.db.delete(existing._id);
    else await ctx.db.insert("checkedIngredients", { userId: user._id, recipeId, ingredientIndex: index });
  },
});

export const clear = mutation({
  args: { recipeId: v.id("recipes") },
  handler: async (ctx, { recipeId }) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db.query("checkedIngredients").withIndex("by_user_recipe", (q) => q.eq("userId", user._id).eq("recipeId", recipeId)).collect();
    for (const row of rows) await ctx.db.delete(row._id);
  },
});
```

- [ ] **Step 6: Run tests, lint, commit**

```bash
bunx convex codegen && bun run test --project convex && bun run typecheck && bun run lint
git add -A && git commit -m "feat(convex): shopping, grocery, and checked-ingredient modules"
```

---

### Task 6: recipe groups, issue reports, and migration modules

**Files:**
- Create: `convex/recipeGroups.ts`, `convex/issueReports.ts`, `convex/migration.ts`, `convex/groups.test.ts`, `convex/issueReports.test.ts`, `convex/migration.test.ts`

**Interfaces:**
- Produces:
  - `api.recipeGroups.list` (→ `RecipeGroup[]` by sortOrder; creates the default "Favorites" group on first call? No: queries cannot write. Instead `api.recipeGroups.ensureDefaults` mutation is called from the client hook once per session; `list` just reads)
  - `api.recipeGroups.members` (query → `Record<groupId, recipeId[]>`)
  - `api.recipeGroups.create({ name, icon? })` → id, `update({ id, updates: { name?, icon?, sortOrder? } })`, `remove({ id })` (refuses default group), `addRecipe({ groupId, recipeId })`, `removeRecipe({ groupId, recipeId })`, `ensureDefaults` (inserts `Favorites`, `isDefault: true`, `sortOrder: 0` when the user has no default group)
  - `api.issueReports.list` (→ `IssueReport[]` newest first), `create({ title, description, steps?, expected?, actual?, pageUrl?, severity })`, `setStatus({ id, status })` (members only)
  - `internal.migration.upsertUser({ legacyId, email })` → `Id<"users"> | null` (null when no Clerk user with that email exists yet), `upsertRecipe({...})`, `upsertMealPlan`, `upsertGroup`, `upsertGroupMember`, `upsertIssueReportMember`, `upsertTemplate`, `findRecipeByLegacyId`, and the action `internal.migration.run({ apply, skipUnmatched })` (Task 12 fills in the action; this task ships the mutations)

- [ ] **Step 1: Failing tests**

`convex/groups.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
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
    await expect(alice.mutation(api.recipeGroups.remove, { id: groups[0].id })).rejects.toThrow();
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
```

`convex/issueReports.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { ALICE, BOB, makeTest } from "./test.setup";

describe("issueReports", () => {
  it("any user can create and list; only members can set status", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    const bob = t.withIdentity(BOB);
    const aliceId = await alice.mutation(api.users.ensure, {});
    await bob.mutation(api.users.ensure, {});
    await t.run(async (ctx) => { await ctx.db.insert("issueReportMembers", { userId: aliceId }); });
    const id = await bob.mutation(api.issueReports.create, { title: "Broken", description: "It broke", severity: "high" });
    expect((await alice.query(api.issueReports.list, {}))[0]).toMatchObject({ id, status: "open", reporterEmail: "bob@example.com" });
    await expect(bob.mutation(api.issueReports.setStatus, { id, status: "resolved" })).rejects.toThrow();
    await alice.mutation(api.issueReports.setStatus, { id, status: "resolved" });
    expect((await bob.query(api.issueReports.list, {}))[0].status).toBe("resolved");
    expect(await alice.query(api.users.isIssueMember, {})).toBe(true);
    expect(await bob.query(api.users.isIssueMember, {})).toBe(false);
  });
});
```

`convex/migration.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import { ALICE, makeTest } from "./test.setup";

describe("migration upserts", () => {
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
```

- [ ] **Step 2: Run to verify failure**

```bash
bun run test --project convex
```

- [ ] **Step 3: Implement recipeGroups**

`convex/recipeGroups.ts`:

```ts
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireOwnedRecipe, requireUser } from "./lib/auth";
import { toGroup } from "./lib/shape";
import type { RecipeGroup } from "../src/types";

async function requireOwnedGroup(ctx: Parameters<typeof requireUser>[0], userId: Id<"users">, groupId: Id<"recipeGroups">): Promise<Doc<"recipeGroups">> {
  const group = await ctx.db.get(groupId);
  if (!group || group.userId !== userId) throw new ConvexError("Group not found");
  return group;
}

export const list = query({
  args: {},
  handler: async (ctx): Promise<RecipeGroup[]> => {
    const user = await requireUser(ctx);
    const docs = await ctx.db.query("recipeGroups").withIndex("by_user", (q) => q.eq("userId", user._id)).collect();
    return docs.sort((a, b) => a.sortOrder - b.sortOrder || a._creationTime - b._creationTime).map(toGroup);
  },
});

export const members = query({
  args: {},
  handler: async (ctx): Promise<Record<string, string[]>> => {
    const user = await requireUser(ctx);
    const groups = await ctx.db.query("recipeGroups").withIndex("by_user", (q) => q.eq("userId", user._id)).collect();
    const out: Record<string, string[]> = {};
    for (const g of groups) {
      const rows = await ctx.db.query("recipeGroupMembers").withIndex("by_group", (q) => q.eq("groupId", g._id)).collect();
      if (rows.length > 0) out[g._id] = rows.map((r) => r.recipeId);
    }
    return out;
  },
});

export const ensureDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const groups = await ctx.db.query("recipeGroups").withIndex("by_user", (q) => q.eq("userId", user._id)).collect();
    if (groups.some((g) => g.isDefault)) return;
    await ctx.db.insert("recipeGroups", { userId: user._id, name: "Favorites", sortOrder: 0, isDefault: true });
  },
});

export const create = mutation({
  args: { name: v.string(), icon: v.optional(v.string()) },
  handler: async (ctx, { name, icon }): Promise<Id<"recipeGroups">> => {
    const user = await requireUser(ctx);
    if (name.trim().length === 0 || name.length > 60) throw new ConvexError("Group name must be 1–60 characters");
    const groups = await ctx.db.query("recipeGroups").withIndex("by_user", (q) => q.eq("userId", user._id)).collect();
    const sortOrder = groups.reduce((m, g) => Math.max(m, g.sortOrder + 1), 0);
    return ctx.db.insert("recipeGroups", { userId: user._id, name: name.trim(), icon, sortOrder, isDefault: false });
  },
});

export const update = mutation({
  args: { id: v.id("recipeGroups"), updates: v.object({ name: v.optional(v.string()), icon: v.optional(v.union(v.string(), v.null())), sortOrder: v.optional(v.number()) }) },
  handler: async (ctx, { id, updates }) => {
    const user = await requireUser(ctx);
    await requireOwnedGroup(ctx, user._id, id);
    await ctx.db.patch(id, {
      ...(updates.name !== undefined && { name: updates.name.trim() }),
      ...(updates.icon !== undefined && { icon: updates.icon ?? undefined }),
      ...(updates.sortOrder !== undefined && { sortOrder: updates.sortOrder }),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("recipeGroups") },
  handler: async (ctx, { id }) => {
    const user = await requireUser(ctx);
    const group = await requireOwnedGroup(ctx, user._id, id);
    if (group.isDefault) throw new ConvexError("The default group cannot be deleted");
    for (const row of await ctx.db.query("recipeGroupMembers").withIndex("by_group", (q) => q.eq("groupId", id)).collect()) await ctx.db.delete(row._id);
    await ctx.db.delete(id);
  },
});

export const addRecipe = mutation({
  args: { groupId: v.id("recipeGroups"), recipeId: v.id("recipes") },
  handler: async (ctx, { groupId, recipeId }) => {
    const user = await requireUser(ctx);
    await requireOwnedGroup(ctx, user._id, groupId);
    await requireOwnedRecipe(ctx, user._id, recipeId);
    const rows = await ctx.db.query("recipeGroupMembers").withIndex("by_group", (q) => q.eq("groupId", groupId)).collect();
    if (rows.some((r) => r.recipeId === recipeId)) return;
    await ctx.db.insert("recipeGroupMembers", { groupId, recipeId });
  },
});

export const removeRecipe = mutation({
  args: { groupId: v.id("recipeGroups"), recipeId: v.id("recipes") },
  handler: async (ctx, { groupId, recipeId }) => {
    const user = await requireUser(ctx);
    await requireOwnedGroup(ctx, user._id, groupId);
    const rows = await ctx.db.query("recipeGroupMembers").withIndex("by_group", (q) => q.eq("groupId", groupId)).collect();
    for (const row of rows) if (row.recipeId === recipeId) await ctx.db.delete(row._id);
  },
});
```

- [ ] **Step 4: Implement issueReports**

`convex/issueReports.ts`:

```ts
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireUser } from "./lib/auth";
import { toIssue } from "./lib/shape";
import { issueStatus, severity } from "./schema";
import type { IssueReport } from "../src/types";

function cap(value: string | undefined, max: number, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (value.length > max) throw new ConvexError(`${label} must be at most ${max} characters`);
  return value;
}

export const list = query({
  args: {},
  handler: async (ctx): Promise<IssueReport[]> => {
    await requireUser(ctx);
    const docs = await ctx.db.query("issueReports").order("desc").collect();
    return docs.map(toIssue);
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    steps: v.optional(v.string()),
    expected: v.optional(v.string()),
    actual: v.optional(v.string()),
    pageUrl: v.optional(v.string()),
    severity,
  },
  handler: async (ctx, args): Promise<Id<"issueReports">> => {
    const user = await requireUser(ctx);
    const title = args.title.trim();
    const description = args.description.trim();
    if (title.length === 0 || title.length > 120) throw new ConvexError("Title must be 1–120 characters");
    if (description.length === 0 || description.length > 2000) throw new ConvexError("Description must be 1–2000 characters");
    return ctx.db.insert("issueReports", {
      reporterId: user._id,
      reporterEmail: user.email,
      title,
      description,
      steps: cap(args.steps, 2000, "Steps"),
      expected: cap(args.expected, 1000, "Expected"),
      actual: cap(args.actual, 1000, "Actual"),
      pageUrl: cap(args.pageUrl, 2000, "Page URL"),
      severity: args.severity,
      status: "open",
    });
  },
});

export const setStatus = mutation({
  args: { id: v.id("issueReports"), status: issueStatus },
  handler: async (ctx, { id, status }) => {
    const user = await requireUser(ctx);
    const member = await ctx.db.query("issueReportMembers").withIndex("by_user", (q) => q.eq("userId", user._id)).unique();
    if (!member) throw new ConvexError("Only issue members can change status");
    const doc = await ctx.db.get(id);
    if (!doc) throw new ConvexError("Issue not found");
    await ctx.db.patch(id, { status });
  },
});
```

- [ ] **Step 5: Implement migration mutations**

`convex/migration.ts` (the `run` action is added in Task 12; keep an exported placeholder comment out — do not add a stub):

```ts
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { difficulty, mealPlanDay, mealType } from "./schema";

async function userByLegacy(ctx: MutationCtx, legacyId: string): Promise<Id<"users">> {
  const user = await ctx.db.query("users").withIndex("by_legacyId", (q) => q.eq("legacyId", legacyId)).unique();
  if (!user) throw new Error(`No migrated user for legacy id ${legacyId}`);
  return user._id;
}

async function recipeByLegacy(ctx: MutationCtx, legacyId: string): Promise<Id<"recipes">> {
  const recipe = await ctx.db.query("recipes").withIndex("by_legacyId", (q) => q.eq("legacyId", legacyId)).unique();
  if (!recipe) throw new Error(`No migrated recipe for legacy id ${legacyId}`);
  return recipe._id;
}

export const upsertUser = internalMutation({
  args: { legacyId: v.string(), email: v.string() },
  handler: async (ctx, { legacyId, email }): Promise<Id<"users"> | null> => {
    const byLegacy = await ctx.db.query("users").withIndex("by_legacyId", (q) => q.eq("legacyId", legacyId)).unique();
    if (byLegacy) return byLegacy._id;
    const byEmail = await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", email.toLowerCase())).unique();
    if (!byEmail) return null;
    await ctx.db.patch(byEmail._id, { legacyId });
    return byEmail._id;
  },
});

export const upsertRecipe = internalMutation({
  args: {
    legacyId: v.string(),
    userLegacyId: v.string(),
    title: v.string(),
    image: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
    sourceUrl: v.string(),
    prepTime: v.optional(v.string()),
    cookTime: v.optional(v.string()),
    totalTime: v.optional(v.string()),
    servings: v.optional(v.string()),
    author: v.optional(v.string()),
    cuisineType: v.optional(v.string()),
    difficulty: v.optional(difficulty),
    rating: v.optional(v.number()),
    isFavorite: v.boolean(),
    notes: v.optional(v.string()),
    ingredients: v.array(v.string()),
    instructions: v.array(v.string()),
    tags: v.array(v.string()),
    createdAt: v.string(),
  },
  handler: async (ctx, { legacyId, userLegacyId, createdAt: _createdAt, ...fields }): Promise<Id<"recipes">> => {
    const userId = await userByLegacy(ctx, userLegacyId);
    const existing = await ctx.db.query("recipes").withIndex("by_legacyId", (q) => q.eq("legacyId", legacyId)).unique();
    if (existing) {
      await ctx.db.patch(existing._id, { ...fields, userId });
      return existing._id;
    }
    return ctx.db.insert("recipes", { ...fields, userId, legacyId });
  },
});

export const findRecipeByLegacyId = internalMutation({
  args: { legacyId: v.string() },
  handler: async (ctx, { legacyId }): Promise<Id<"recipes"> | null> => {
    const r = await ctx.db.query("recipes").withIndex("by_legacyId", (q) => q.eq("legacyId", legacyId)).unique();
    return r?._id ?? null;
  },
});

export const upsertMealPlan = internalMutation({
  args: { userLegacyId: v.string(), recipeLegacyId: v.string(), date: v.string(), mealType, isLeftover: v.boolean(), position: v.number() },
  handler: async (ctx, args): Promise<boolean> => {
    const userId = await userByLegacy(ctx, args.userLegacyId);
    const recipeId = await recipeByLegacy(ctx, args.recipeLegacyId);
    const rows = await ctx.db.query("mealPlans").withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", args.date)).collect();
    if (rows.some((r) => r.mealType === args.mealType && r.recipeId === recipeId)) return false;
    await ctx.db.insert("mealPlans", { userId, recipeId, date: args.date, mealType: args.mealType, isLeftover: args.isLeftover, position: args.position });
    return true;
  },
});

export const upsertGroup = internalMutation({
  args: { legacyId: v.string(), userLegacyId: v.string(), name: v.string(), icon: v.optional(v.string()), sortOrder: v.number(), isDefault: v.boolean() },
  handler: async (ctx, { legacyId, userLegacyId, ...fields }): Promise<Id<"recipeGroups">> => {
    const userId = await userByLegacy(ctx, userLegacyId);
    const existing = await ctx.db.query("recipeGroups").withIndex("by_legacyId", (q) => q.eq("legacyId", legacyId)).unique();
    if (existing) {
      await ctx.db.patch(existing._id, { ...fields, userId });
      return existing._id;
    }
    return ctx.db.insert("recipeGroups", { ...fields, userId, legacyId });
  },
});

export const upsertGroupMember = internalMutation({
  args: { groupLegacyId: v.string(), recipeLegacyId: v.string() },
  handler: async (ctx, { groupLegacyId, recipeLegacyId }) => {
    const group = await ctx.db.query("recipeGroups").withIndex("by_legacyId", (q) => q.eq("legacyId", groupLegacyId)).unique();
    if (!group) throw new Error(`No migrated group for legacy id ${groupLegacyId}`);
    const recipeId = await recipeByLegacy(ctx, recipeLegacyId);
    const rows = await ctx.db.query("recipeGroupMembers").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect();
    if (rows.some((r) => r.recipeId === recipeId)) return;
    await ctx.db.insert("recipeGroupMembers", { groupId: group._id, recipeId });
  },
});

export const upsertIssueReportMember = internalMutation({
  args: { userLegacyId: v.string() },
  handler: async (ctx, { userLegacyId }) => {
    const userId = await userByLegacy(ctx, userLegacyId);
    const existing = await ctx.db.query("issueReportMembers").withIndex("by_user", (q) => q.eq("userId", userId)).unique();
    if (!existing) await ctx.db.insert("issueReportMembers", { userId });
  },
});

export const upsertTemplate = internalMutation({
  args: { legacyId: v.string(), userLegacyId: v.string(), name: v.string(), days: v.record(v.string(), mealPlanDay) },
  handler: async (ctx, { legacyId, userLegacyId, name, days }) => {
    const userId = await userByLegacy(ctx, userLegacyId);
    const all = await ctx.db.query("mealTemplates").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
    const existing = all.find((t) => t.legacyId === legacyId);
    if (existing) {
      await ctx.db.patch(existing._id, { name, days });
      return existing._id;
    }
    return ctx.db.insert("mealTemplates", { userId, name, days, legacyId });
  },
});
```

`createdAt` is accepted and ignored on purpose: Convex sets `_creationTime` itself. Prefix with underscore so lint passes.

- [ ] **Step 6: Run tests, lint, commit**

```bash
bunx convex codegen && bun run test --project convex && bun run typecheck && bun run lint
git add -A && git commit -m "feat(convex): groups, issue reports, and migration upserts"
```

---

### Task 7: Clerk shell in Next.js

**Files:**
- Create: `src/proxy.ts`, `src/components/convex-client-provider.tsx`, `src/lib/convex/use-user.ts`
- Modify: `src/app/layout.tsx`, `src/app/login/page.tsx`, `src/app/signup/page.tsx`, `src/components/user-menu.tsx`, `src/components/bottom-nav.tsx`, `src/app/page.tsx` (auth usage only), `src/app/profile/page.tsx` (auth usage only)
- Delete: `src/middleware.ts`, `src/lib/supabase/middleware.ts`, `src/lib/supabase/middleware.test.ts`, `src/components/auth-provider.tsx`, `src/app/auth/callback/route.ts`, `src/app/auth/confirmed/page.tsx`

**Interfaces:**
- Produces: `useCurrentUser(): { profile: Profile | null | undefined; isLoaded: boolean; isSignedIn: boolean; signOut(): Promise<void> }` from `src/lib/convex/use-user.ts`. `profile` is `undefined` while loading, `null` when signed out or not yet provisioned.
- Consumes: `api.users.ensure`, `api.users.current`.

- [ ] **Step 1: Proxy with strict CSP**

`src/proxy.ts`:

```ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublic = createRouteMatcher([
  "/login(.*)",
  "/signup(.*)",
  "/api(.*)",
  "/manifest.webmanifest",
  "/sw.js",
]);

export default clerkMiddleware(
  async (auth, req) => {
    if (!isPublic(req)) await auth.protect();
  },
  {
    contentSecurityPolicy: {
      strict: true,
      directives: {
        "connect-src": ["https://*.convex.cloud", "wss://*.convex.cloud"],
        "img-src": ["https:", "data:"],
        "frame-ancestors": ["'none'"],
      },
    },
  },
);

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
```

`auth.protect()` redirects to `NEXT_PUBLIC_CLERK_SIGN_IN_URL` (`/login`). API routes are excluded so they return JSON 401s themselves.

- [ ] **Step 2: Providers**

`src/components/convex-client-provider.tsx`:

```tsx
"use client";

import { type ReactNode, useEffect } from "react";
import { ConvexReactClient, useConvexAuth, useMutation } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useAuth } from "@clerk/nextjs";
import { api } from "../../convex/_generated/api";

const url = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!url) throw new Error("Missing NEXT_PUBLIC_CONVEX_URL");
const convex = new ConvexReactClient(url);

function EnsureUser() {
  const { isAuthenticated } = useConvexAuth();
  const ensure = useMutation(api.users.ensure);
  useEffect(() => {
    if (isAuthenticated) void ensure({});
  }, [isAuthenticated, ensure]);
  return null;
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      <EnsureUser />
      {children}
    </ConvexProviderWithClerk>
  );
}
```

Add a path alias for the generated API so imports read `@/../convex/_generated/api`? No: add `"@convex/*": ["./convex/*"]` to `tsconfig.json` `paths` and use `import { api } from "@convex/_generated/api"` everywhere in `src/`. Also add the same alias to `vitest.config.ts` `resolve.alias` (`"@convex": path.resolve(__dirname, "./convex")`). Use that alias in this file and all later tasks.

`src/lib/convex/use-user.ts`:

```ts
"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Profile } from "@/types";

export function useCurrentUser(): {
  profile: Profile | null | undefined;
  isLoaded: boolean;
  isSignedIn: boolean;
  signOut: () => Promise<void>;
} {
  const { isLoaded, isSignedIn } = useUser();
  const { signOut } = useAuth();
  const { isAuthenticated } = useConvexAuth();
  const profile = useQuery(api.users.current, isAuthenticated ? {} : "skip");
  return {
    profile: isSignedIn ? profile : null,
    isLoaded,
    isSignedIn: !!isSignedIn,
    signOut: async () => {
      await signOut({ redirectUrl: "/login" });
    },
  };
}
```

- [ ] **Step 3: Root layout**

Replace the provider section of `src/app/layout.tsx`:

```tsx
import { ClerkProvider } from "@clerk/nextjs";
import { ConvexClientProvider } from "@/components/convex-client-provider";
// keep the other imports; drop AuthProvider and OfflineSupport imports only if Task 9 has not run yet — leave OfflineSupport in place for now
```

and the JSX:

```tsx
<html lang="en" suppressHydrationWarning>
  <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
    <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4 focus:bg-background focus:text-foreground">
      Skip to content
    </a>
    <ClerkProvider dynamic nonce={nonce} signInUrl="/login" signUpUrl="/signup">
      <ConvexClientProvider>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem nonce={nonce}>
          <OfflineSupport />
          <main id="main-content" className="mx-auto min-h-dvh max-w-lg pb-20">{children}</main>
          <BottomNav />
          <Toaster position="top-center" richColors />
        </ThemeProvider>
      </ConvexClientProvider>
    </ClerkProvider>
  </body>
</html>
```

`nonce` stays as `(await headers()).get("x-nonce") ?? undefined`; Clerk's strict CSP sets that header.

- [ ] **Step 4: Login and signup pages**

`src/app/login/page.tsx`:

```tsx
import { SignIn } from "@clerk/nextjs";

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <SignIn routing="hash" signUpUrl="/signup" fallbackRedirectUrl="/" />
    </div>
  );
}
```

`src/app/signup/page.tsx`:

```tsx
import { SignUp } from "@clerk/nextjs";

export default function SignupPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <SignUp routing="hash" signInUrl="/login" fallbackRedirectUrl="/" />
    </div>
  );
}
```

Signed-in users visiting these pages: Clerk's components redirect to `fallbackRedirectUrl` automatically, which matches the old middleware behaviour.

- [ ] **Step 5: Replace `useAuth` consumers**

In `src/components/user-menu.tsx`, `src/components/bottom-nav.tsx`, `src/app/page.tsx`, and `src/app/profile/page.tsx` replace `import { useAuth } from "@/components/auth-provider"` with `import { useCurrentUser } from "@/lib/convex/use-user"` and map:

| old | new |
|---|---|
| `const { user, signOut } = useAuth()` | `const { profile, signOut } = useCurrentUser()` |
| `user.email` | `profile?.email` |
| `user.user_metadata.avatar_url` / `full_name` | `profile?.avatarUrl` / `profile?.displayName` |
| `const { user, loading } = useAuth()` | `const { isSignedIn, isLoaded } = useCurrentUser()` with `loading = !isLoaded`, `user = isSignedIn` |

In `src/app/page.tsx` the hydrate and localStorage-migration effects stay for now (Task 9 removes them); only the auth import changes.

- [ ] **Step 6: Delete Supabase auth files**

```bash
git rm src/middleware.ts src/lib/supabase/middleware.ts src/lib/supabase/middleware.test.ts src/components/auth-provider.tsx src/app/auth/callback/route.ts src/app/auth/confirmed/page.tsx
```

`src/lib/supabase/client.ts` and `service.ts` stay until Task 8.

- [ ] **Step 7: Typecheck, lint, tests, CSP check**

```bash
bun run typecheck && bun run lint && bun run test
```

Then start the dev server (`bunx convex dev` in one terminal is optional here; only Clerk is exercised) and load `/login`. Expected: Clerk sign-in card renders; browser console has no CSP violations; `curl -sI http://localhost:3000/login | grep -i content-security-policy` shows a `nonce-` value and `connect-src` including `*.convex.cloud`. If `next-themes` logs a CSP violation, pass `nonce` through and confirm the header's `script-src` includes the same nonce.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat(auth): replace Supabase auth with Clerk (proxy, providers, sign-in pages)"
```

---

### Task 8: Client hooks and trimmed store

**Files:**
- Create: `src/lib/convex/use-recipes.ts`, `use-meal-plan.ts`, `use-templates.ts`, `use-shopping.ts`, `use-grocery.ts`, `use-checked.ts`, `use-groups.ts`, `use-issues.ts`
- Modify: `src/stores/recipe-store.ts` (rewrite), `src/stores/recipe-store.test.ts` (keep only cooking-mode tests)
- Delete: `src/lib/offline-queue.ts`, `src/lib/offline-queue.test.ts`, `src/lib/supabase/service.ts`, `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts` (server.ts only after Task 10 if the routes still import it; check with grep and delete in Task 10 otherwise), `src/types/supabase.ts`

**Interfaces:**
- Produces (all `"use client"`):
  - `useRecipes(): Recipe[] | undefined`; `useRecipe(id: string): Recipe | null | undefined`; `useRecipeActions(): { addRecipe(scraped: ScrapedRecipe, sourceUrl: string): Promise<string>; updateRecipe(id, updates: Partial<Omit<Recipe, "id" | "createdAt">>): Promise<void>; deleteRecipe(id): Promise<void>; updateTags(id, tags): Promise<void> }`
  - `useMealPlan(startDate, endDate): MealPlan | undefined`; `useMealsForRecipe(recipeId): Array<{date; mealType}> | undefined`; `useMealPlanActions(): { assignMeal(date, slot, recipeId, isLeftover?): Promise<boolean>; removeMealFromSlot(date, slot, recipeId): Promise<void>; clearWeek(weekDates): Promise<void> }`
  - `useTemplates(): MealTemplate[] | undefined`; `useTemplateActions(): { saveWeekAsTemplate(name, weekDates, plan: MealPlan): Promise<void>; applyTemplate(templateId, weekDates): Promise<void>; deleteTemplate(id): Promise<void> }`
  - `useShoppingList(): ShoppingItem[] | undefined`; `useShoppingActions(): { addShoppingItem(text); toggleShoppingItem(id); uncheckAllShoppingItems(); clearCheckedItems(); clearShoppingList(); restoreShoppingItems(items: ShoppingItem[]); addIngredientsToShoppingList(ingredients: string[]); generateShoppingList(weekDates: string[], plan: MealPlan, recipes: Recipe[]) }`, every action returns `Promise<void>`
  - `useGroceryList(): GroceryItem[] | undefined`; `useGroceryActions(): { addGroceryItem; toggleGroceryItem; uncheckAllGroceryItems; clearCheckedGroceryItems; clearGroceryList; restoreGroceryItems }`
  - `useCheckedIngredients(): Record<string, number[]> | undefined`; `useCheckedActions(): { toggleIngredient(recipeId, index); clearCheckedIngredients(recipeId) }`
  - `useGroups(): RecipeGroup[] | undefined`; `useGroupMembers(): Record<string, string[]> | undefined`; `useGroupActions(): { createGroup(name, icon?); updateGroup(id, updates); deleteGroup(id); addRecipeToGroup(groupId, recipeId); removeRecipeFromGroup(groupId, recipeId) }`
  - `useIssues(): IssueReport[] | undefined`; `useIsIssueMember(): boolean | undefined`; `useIssueActions(): { createIssue(input); setIssueStatus(id, status) }`
  - Store: `useRecipeStore` now exposes only `{ cookingRecipeId, cookingCompletedSteps, startCooking, stopCooking, toggleCookingStep }`.
- Consumes: every `api.*` from Tasks 2–6, `aggregateIngredients`, `parseIngredient`, `SLOTS`.

- [ ] **Step 1: Failing test for the trimmed store**

Rewrite `src/stores/recipe-store.test.ts` to keep only the cooking-mode cases. Copy the existing `describe("Cooking mode", ...)` block (search the current file for `startCooking`) verbatim, delete everything else, and delete all Supabase mocks at the top of the file. Add:

```ts
it("exposes no server-state fields", () => {
  const state = useRecipeStore.getState();
  expect("recipes" in state).toBe(false);
  expect("hydrate" in state).toBe(false);
});
```

- [ ] **Step 2: Run to verify failure**

```bash
bun run test --project app src/stores
```

Expected: FAIL on the new assertion (`recipes` still present).

- [ ] **Step 3: Rewrite the store**

`src/stores/recipe-store.ts`:

```ts
"use client";

import { create } from "zustand";

const COOKING_KEY = "cooksnap:cooking";

interface CookingState {
  cookingRecipeId: string | null;
  cookingCompletedSteps: Set<number>;
  startCooking: (recipeId: string) => void;
  stopCooking: () => void;
  toggleCookingStep: (index: number) => void;
}

function readCooking(): { recipeId: string; steps: number[] } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(COOKING_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { recipeId, steps } = parsed as { recipeId?: unknown; steps?: unknown };
    if (typeof recipeId !== "string" || !Array.isArray(steps)) return null;
    return { recipeId, steps: steps.filter((s): s is number => typeof s === "number") };
  } catch {
    return null;
  }
}

function writeCooking(recipeId: string | null, steps: Set<number>): void {
  try {
    if (recipeId === null) localStorage.removeItem(COOKING_KEY);
    else localStorage.setItem(COOKING_KEY, JSON.stringify({ recipeId, steps: [...steps] }));
  } catch {
    /* localStorage unavailable */
  }
}

const initial = readCooking();

export const useRecipeStore = create<CookingState>((set, get) => ({
  cookingRecipeId: initial?.recipeId ?? null,
  cookingCompletedSteps: new Set(initial?.steps ?? []),
  startCooking: (recipeId) => {
    const steps = new Set<number>();
    writeCooking(recipeId, steps);
    set({ cookingRecipeId: recipeId, cookingCompletedSteps: steps });
  },
  stopCooking: () => {
    writeCooking(null, new Set());
    set({ cookingRecipeId: null, cookingCompletedSteps: new Set() });
  },
  toggleCookingStep: (index) => {
    const { cookingRecipeId, cookingCompletedSteps } = get();
    if (!cookingRecipeId) return;
    const next = new Set(cookingCompletedSteps);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    writeCooking(cookingRecipeId, next);
    set({ cookingCompletedSteps: next });
  },
}));
```

If the kept cooking tests relied on `hydrate()` restoring state, change them to reload the module (`vi.resetModules()` then `await import("./recipe-store")`) after seeding `localStorage`.

- [ ] **Step 4: Recipes hook**

`src/lib/convex/use-recipes.ts`:

```ts
"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { Recipe, ScrapedRecipe } from "@/types";

export function useRecipes(): Recipe[] | undefined {
  return useQuery(api.recipes.list, {});
}

export function useRecipe(id: string): Recipe | null | undefined {
  return useQuery(api.recipes.get, { id: id as Id<"recipes"> });
}

function isPersistable(image: string | null | undefined): image is string {
  return typeof image === "string" && (/^https?:\/\//.test(image) || image.startsWith("data:image/"));
}

async function persistImage(recipeId: string, image: string): Promise<void> {
  try {
    await fetch("/api/persist-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipeId, imageUrl: image }),
    });
  } catch (e) {
    console.error("Failed to persist recipe image:", e instanceof Error ? e.message : String(e));
  }
}

export function useRecipeActions() {
  const create = useMutation(api.recipes.create);
  const update = useMutation(api.recipes.update);
  const remove = useMutation(api.recipes.remove);
  const setTags = useMutation(api.recipes.setTags);

  return {
    addRecipe: async (scraped: ScrapedRecipe, sourceUrl: string): Promise<string> => {
      const id = await create({
        title: scraped.title,
        image: scraped.image,
        ingredients: scraped.ingredients,
        instructions: scraped.instructions,
        sourceUrl,
        prepTime: scraped.prepTime ?? null,
        cookTime: scraped.cookTime ?? null,
        totalTime: scraped.totalTime ?? null,
        servings: scraped.servings ?? null,
        author: scraped.author ?? null,
        cuisineType: scraped.cuisineType ?? null,
        tags: [],
      });
      if (isPersistable(scraped.image)) void persistImage(id, scraped.image);
      return id;
    },
    updateRecipe: async (id: string, updates: Partial<Omit<Recipe, "id" | "createdAt">>): Promise<void> => {
      await update({ id: id as Id<"recipes">, updates });
      if (updates.image !== undefined && isPersistable(updates.image)) void persistImage(id, updates.image);
    },
    deleteRecipe: async (id: string): Promise<void> => {
      await remove({ id: id as Id<"recipes"> });
    },
    updateTags: async (id: string, tags: string[]): Promise<void> => {
      await setTags({ id: id as Id<"recipes">, tags });
    },
  };
}
```

`updates` from `Partial<Omit<Recipe, ...>>` includes `sourceUrl`, which the mutation does not accept. Strip it before calling: `const { sourceUrl: _ignored, ...rest } = updates; await update({ id, updates: rest });`. Keep the validator strict.

- [ ] **Step 5: Meal plan and template hooks**

`src/lib/convex/use-meal-plan.ts`:

```ts
"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { MealPlan, MealSlot } from "@/types";

export function useMealPlan(startDate: string, endDate: string): MealPlan | undefined {
  return useQuery(api.mealPlans.forRange, { startDate, endDate });
}

export function useMealsForRecipe(recipeId: string) {
  return useQuery(api.mealPlans.forRecipe, { recipeId: recipeId as Id<"recipes"> });
}

export function useMealPlanActions() {
  const assign = useMutation(api.mealPlans.assign);
  const remove = useMutation(api.mealPlans.remove);
  const clearDates = useMutation(api.mealPlans.clearDates);
  return {
    assignMeal: (date: string, slot: MealSlot, recipeId: string, isLeftover = false): Promise<boolean> =>
      assign({ date, mealType: slot, recipeId: recipeId as Id<"recipes">, isLeftover }),
    removeMealFromSlot: async (date: string, slot: MealSlot, recipeId: string): Promise<void> => {
      await remove({ date, mealType: slot, recipeId: recipeId as Id<"recipes"> });
    },
    clearWeek: async (weekDates: string[]): Promise<void> => {
      await clearDates({ dates: weekDates });
    },
  };
}
```

`src/lib/convex/use-templates.ts`:

```ts
"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { MealPlan, MealPlanDay, MealTemplate } from "@/types";

export function useTemplates(): MealTemplate[] | undefined {
  return useQuery(api.mealTemplates.list, {});
}

export function useTemplateActions() {
  const save = useMutation(api.mealTemplates.save);
  const apply = useMutation(api.mealTemplates.apply);
  const remove = useMutation(api.mealTemplates.remove);
  return {
    saveWeekAsTemplate: async (name: string, weekDates: string[], plan: MealPlan): Promise<void> => {
      const days: Record<string, MealPlanDay> = {};
      weekDates.forEach((date, index) => {
        const day = plan[date];
        if (day) days[String(index)] = day;
      });
      await save({ name, days });
    },
    applyTemplate: async (templateId: string, weekDates: string[]): Promise<void> => {
      await apply({ templateId: templateId as Id<"mealTemplates">, weekDates });
    },
    deleteTemplate: async (id: string): Promise<void> => {
      await remove({ id: id as Id<"mealTemplates"> });
    },
  };
}
```

- [ ] **Step 6: Shopping, grocery, checked hooks**

`src/lib/convex/use-shopping.ts`:

```ts
"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { aggregateIngredients } from "@/lib/ingredient-aggregator";
import { SLOTS } from "@/lib/constants";
import type { MealPlan, Recipe, ShoppingItem } from "@/types";

export function useShoppingList(): ShoppingItem[] | undefined {
  return useQuery(api.shoppingItems.list, {});
}

export function useShoppingActions() {
  const add = useMutation(api.shoppingItems.add);
  const addMany = useMutation(api.shoppingItems.addMany);
  const toggle = useMutation(api.shoppingItems.toggle).withOptimisticUpdate((store, { id }) => {
    const current = store.getQuery(api.shoppingItems.list, {});
    if (!current) return;
    store.setQuery(api.shoppingItems.list, {}, current.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i)));
  });
  const uncheckAll = useMutation(api.shoppingItems.uncheckAll);
  const clearChecked = useMutation(api.shoppingItems.clearChecked);
  const clear = useMutation(api.shoppingItems.clear);
  const restore = useMutation(api.shoppingItems.restore);

  return {
    addShoppingItem: async (text: string) => { await add({ text }); },
    toggleShoppingItem: async (id: string) => { await toggle({ id: id as Id<"shoppingItems"> }); },
    uncheckAllShoppingItems: async () => { await uncheckAll({}); },
    clearCheckedItems: async () => { await clearChecked({}); },
    clearShoppingList: async () => { await clear({}); },
    restoreShoppingItems: async (items: ShoppingItem[]) => {
      await restore({ items: items.map((i) => ({ text: i.text, checked: i.checked, recipeId: i.recipeId as Id<"recipes"> | undefined })) });
    },
    addIngredientsToShoppingList: async (ingredients: string[]) => {
      const items = aggregateIngredients(ingredients).map((text) => ({ text }));
      if (items.length > 0) await addMany({ items });
    },
    generateShoppingList: async (weekDates: string[], plan: MealPlan, recipes: Recipe[]) => {
      const byId = new Map(recipes.map((r) => [r.id, r]));
      const lines: string[] = [];
      for (const date of weekDates) {
        const day = plan[date];
        if (!day) continue;
        for (const slot of SLOTS) {
          for (const entry of day[slot]) {
            if (entry.isLeftover) continue;
            const recipe = byId.get(entry.recipeId);
            if (recipe) lines.push(...recipe.ingredients);
          }
        }
      }
      const items = aggregateIngredients(lines).map((text) => ({ text }));
      if (items.length > 0) await addMany({ items });
    },
  };
}
```

Check the current `generateShoppingList` in `src/stores/recipe-store.ts` (around line 1204) before writing this: if it dedupes against existing list items by `normalizeIngredientName` or attaches `recipeId` per item, replicate that exactly here (pass the current list from `useShoppingList()` into the action as a fourth argument if needed). The signature of `aggregateIngredients` is in `src/lib/ingredient-aggregator.ts`; match its real input and output types.

`src/lib/convex/use-grocery.ts` mirrors the shopping hook with `api.groceryItems.*`, the same optimistic toggle, and actions `addGroceryItem`, `toggleGroceryItem`, `uncheckAllGroceryItems`, `clearCheckedGroceryItems`, `clearGroceryList`, `restoreGroceryItems(items: GroceryItem[])`.

`src/lib/convex/use-checked.ts`:

```ts
"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

export function useCheckedIngredients(): Record<string, number[]> | undefined {
  return useQuery(api.checkedIngredients.list, {});
}

export function useCheckedActions() {
  const toggle = useMutation(api.checkedIngredients.toggle).withOptimisticUpdate((store, { recipeId, index }) => {
    const current = store.getQuery(api.checkedIngredients.list, {});
    if (!current) return;
    const list = current[recipeId] ?? [];
    const next = list.includes(index) ? list.filter((i) => i !== index) : [...list, index].sort((a, b) => a - b);
    store.setQuery(api.checkedIngredients.list, {}, { ...current, [recipeId]: next });
  });
  const clear = useMutation(api.checkedIngredients.clear);
  return {
    toggleIngredient: async (recipeId: string, index: number) => { await toggle({ recipeId: recipeId as Id<"recipes">, index }); },
    clearCheckedIngredients: async (recipeId: string) => { await clear({ recipeId: recipeId as Id<"recipes"> }); },
  };
}
```

- [ ] **Step 7: Groups and issues hooks**

`src/lib/convex/use-groups.ts`:

```ts
"use client";

import { useEffect } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { RecipeGroup } from "@/types";

export function useGroups(): RecipeGroup[] | undefined {
  const { isAuthenticated } = useConvexAuth();
  const ensureDefaults = useMutation(api.recipeGroups.ensureDefaults);
  const groups = useQuery(api.recipeGroups.list, {});
  useEffect(() => {
    if (isAuthenticated && groups && !groups.some((g) => g.isDefault)) void ensureDefaults({});
  }, [isAuthenticated, groups, ensureDefaults]);
  return groups;
}

export function useGroupMembers(): Record<string, string[]> | undefined {
  return useQuery(api.recipeGroups.members, {});
}

export function useGroupActions() {
  const create = useMutation(api.recipeGroups.create);
  const update = useMutation(api.recipeGroups.update);
  const remove = useMutation(api.recipeGroups.remove);
  const addRecipe = useMutation(api.recipeGroups.addRecipe);
  const removeRecipe = useMutation(api.recipeGroups.removeRecipe);
  return {
    createGroup: async (name: string, icon?: string) => { await create({ name, icon }); },
    updateGroup: async (id: string, updates: Partial<Pick<RecipeGroup, "name" | "icon" | "sortOrder">>) => {
      await update({ id: id as Id<"recipeGroups">, updates });
    },
    deleteGroup: async (id: string) => { await remove({ id: id as Id<"recipeGroups"> }); },
    addRecipeToGroup: async (groupId: string, recipeId: string) => {
      await addRecipe({ groupId: groupId as Id<"recipeGroups">, recipeId: recipeId as Id<"recipes"> });
    },
    removeRecipeFromGroup: async (groupId: string, recipeId: string) => {
      await removeRecipe({ groupId: groupId as Id<"recipeGroups">, recipeId: recipeId as Id<"recipes"> });
    },
  };
}
```

`src/lib/convex/use-issues.ts`:

```ts
"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { IssueReport, IssueReportSeverity, IssueReportStatus } from "@/types";

export function useIssues(): IssueReport[] | undefined {
  return useQuery(api.issueReports.list, {});
}

export function useIsIssueMember(): boolean | undefined {
  return useQuery(api.users.isIssueMember, {});
}

export interface NewIssue {
  title: string;
  description: string;
  steps?: string;
  expected?: string;
  actual?: string;
  pageUrl?: string;
  severity: IssueReportSeverity;
}

export function useIssueActions() {
  const create = useMutation(api.issueReports.create);
  const setStatus = useMutation(api.issueReports.setStatus);
  return {
    createIssue: async (input: NewIssue) => { await create(input); },
    setIssueStatus: async (id: string, status: IssueReportStatus) => {
      await setStatus({ id: id as Id<"issueReports">, status });
    },
  };
}
```

- [ ] **Step 8: Delete the Supabase data layer**

```bash
git rm src/lib/offline-queue.ts src/lib/offline-queue.test.ts src/lib/supabase/service.ts src/lib/supabase/client.ts src/types/supabase.ts
```

Components still import the old store fields at this point, so `bun run typecheck` will fail until Task 9. Run `bun run test --project app src/stores src/lib` and `bun run lint` instead; both must pass. Commit:

```bash
git add -A && git commit -m "feat(client): Convex hooks; zustand reduced to cooking state"
```

---

### Task 9: Move pages and components onto the hooks

**Files:**
- Modify: `src/app/page.tsx`, `src/app/recipes/page.tsx`, `src/app/recipes/[id]/page.tsx`, `src/app/cook/page.tsx`, `src/app/meal-plan/page.tsx`, `src/app/shopping-list/page.tsx`, `src/app/profile/page.tsx`, `src/app/issues/page.tsx`, `src/components/bottom-nav.tsx`, `src/components/meal-prep-sheet.tsx`, `src/components/recipe-card.tsx`, `src/components/url-input.tsx`, `src/components/recipe-detail.tsx`, `src/components/offline-support.tsx`, `src/components/schedule-picker-sheet.tsx`, `src/components/cooking-view.tsx`, `src/components/recipe-edit-form.tsx`
- Create: `src/lib/convex/use-offline-snapshot.ts`, `src/components/offline-banner.tsx`

**Interfaces:**
- Consumes: every hook from Task 8, `useCurrentUser`.
- Produces: `useOfflineSnapshot<T>(key: string, live: T | undefined): { data: T | undefined; offline: boolean }`; `<OfflineBanner />`.

Mapping rules applied to every file (do them mechanically, one file at a time, running `bun run typecheck` after each):

| old store read | new |
|---|---|
| `useRecipeStore((s) => s.recipes)` | `const recipes = useRecipes() ?? []` (or keep `undefined` where a loading state is rendered) |
| `s.hydrated`, `s.isLoading`, `s.hydrate`, `s.error`, `s.clearError`, `s.migrateFromLocalStorage`, `s.flushOfflineWrites` | delete; loading is `useRecipes() === undefined`; errors come from `await`ed actions in `try/catch` with `toast.error` |
| `s.mealPlan` + `s.fetchMealPlanForWeek(start, end)` | `const mealPlan = useMealPlan(start, end) ?? {}` (no fetch call; the hook subscribes) |
| `s.mealTemplates` | `useTemplates() ?? []` |
| `s.shoppingList` / `s.groceryList` | `useShoppingList() ?? []` / `useGroceryList() ?? []` |
| `s.checkedIngredients` | `useCheckedIngredients() ?? {}` |
| `s.recipeGroups` / `s.groupMembers` | `useGroups() ?? []` / `useGroupMembers() ?? {}` |
| `s.cookingRecipeId`, `s.cookingCompletedSteps`, `startCooking`, `stopCooking`, `toggleCookingStep` | unchanged |
| any action | the same-named function from the matching `use*Actions()` hook; `generateShoppingList(weekDates)` becomes `generateShoppingList(weekDates, mealPlan, recipes)`; `saveWeekAsTemplate(name, weekDates)` becomes `saveWeekAsTemplate(name, weekDates, mealPlan)` |

Page-specific notes:

- `src/app/page.tsx`: remove both `useEffect`s (hydrate and localStorage migration) and the "migrated N recipes" toast. Show a `Skeleton` while `recipes === undefined`.
- `src/app/meal-plan/page.tsx`: compute `startDate`/`endDate` from the visible week and pass them to `useMealPlan`. Replace `fetchMealsForRecipe(supabase, id)` with `useMealsForRecipe(id)` inside the component that renders the per-recipe list (if it is called imperatively inside a handler, lift it into a small child component that receives `recipeId` and renders the result).
- `src/components/meal-prep-sheet.tsx` and `schedule-picker-sheet.tsx`: same `useMealPlan(start, end)` pattern; delete `fetchMealPlanForWeek` calls.
- `src/app/profile/page.tsx`: replace `updateProfile(client, { display_name })` with `useMutation(api.users.updateDisplayName)`; replace the import flow that called `addRecipeToDb`/`updateRecipeInDb`/`updateRecipeTags` with `useRecipeActions().addRecipe` followed by `updateRecipe` for the extra fields and `updateTags`; `signOut` from `useCurrentUser`; the delete-account fetch to `/api/account/delete` stays. Profile data comes from `useCurrentUser().profile`.
- `src/app/issues/page.tsx`: `useIssues()`, `useIsIssueMember()`, `useIssueActions()`; delete the `useMemo(() => createClient())`.
- `src/components/offline-support.tsx`: delete the `flushOfflineWrites` effect and the `online` listener that triggered it; keep service-worker registration.
- `src/components/url-input.tsx`: `addRecipe` now returns a promise; `await` it inside the existing try/catch and keep the toast copy identical.

- [ ] **Step 1: Offline snapshot hook and banner**

`src/lib/convex/use-offline-snapshot.ts`:

```ts
"use client";

import { useEffect, useState } from "react";
import { useConvex } from "convex/react";

const PREFIX = "cooksnap:snapshot:";

export function useOfflineSnapshot<T>(key: string, live: T | undefined): { data: T | undefined; offline: boolean } {
  const convex = useConvex();
  const [connected, setConnected] = useState(true);
  const [snapshot, setSnapshot] = useState<T | undefined>(undefined);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw) setSnapshot(JSON.parse(raw) as T);
    } catch { /* ignore */ }
  }, [key]);

  useEffect(() => {
    if (live === undefined) return;
    try { localStorage.setItem(PREFIX + key, JSON.stringify(live)); } catch { /* ignore */ }
  }, [key, live]);

  useEffect(() => {
    const read = () => setConnected(convex.connectionState().isWebSocketConnected);
    read();
    const id = window.setInterval(read, 2000);
    return () => window.clearInterval(id);
  }, [convex]);

  const offline = !connected && live === undefined;
  return { data: live ?? (offline ? snapshot : undefined), offline };
}
```

`src/components/offline-banner.tsx`:

```tsx
export function OfflineBanner() {
  return (
    <p role="status" className="mb-3 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
      Offline, showing your saved copy. Changes are disabled until you reconnect.
    </p>
  );
}
```

Use it in `src/app/recipes/page.tsx` and `src/app/shopping-list/page.tsx`:

```tsx
const live = useRecipes();
const { data: recipes, offline } = useOfflineSnapshot("recipes", live);
// render <OfflineBanner /> when offline, disable mutating buttons with `disabled={offline}`
```

- [ ] **Step 2: Convert the files, one at a time**

Order: `url-input.tsx`, `recipe-card.tsx`, `recipe-edit-form.tsx`, `recipe-detail.tsx`, `cooking-view.tsx`, `bottom-nav.tsx`, `offline-support.tsx`, `meal-prep-sheet.tsx`, `schedule-picker-sheet.tsx`, then pages `page.tsx`, `recipes/page.tsx`, `recipes/[id]/page.tsx`, `cook/page.tsx`, `meal-plan/page.tsx`, `shopping-list/page.tsx`, `profile/page.tsx`, `issues/page.tsx`. After each file:

```bash
bun run typecheck 2>&1 | grep -c "error TS"
```

The count must go down monotonically and reach 0 after `issues/page.tsx`.

- [ ] **Step 3: Component tests**

Existing component tests under `src/components/*.test.tsx` and `src/app/**/*.test.tsx` that mocked `useRecipeStore` now need to mock the hooks. For each failing test file, replace `vi.mock("@/stores/recipe-store", ...)` with a mock of the specific hook module, for example:

```ts
vi.mock("@/lib/convex/use-recipes", () => ({
  useRecipes: () => [recipeFixture],
  useRecipeActions: () => ({ addRecipe: vi.fn(), updateRecipe: vi.fn(), deleteRecipe: vi.fn(), updateTags: vi.fn() }),
}));
```

Keep the assertions unchanged; only the data source changes.

- [ ] **Step 4: Run everything, manual pass, commit**

```bash
bun run typecheck && bun run lint && bun run test
```

Manual pass with `bunx convex dev` running alongside the Next dev server: sign up with your own email, paste a recipe URL, confirm it appears, assign it to a day, generate the shopping list, toggle an item, open cook mode, create a group, file an issue, edit display name. Every action must reflect without a reload.

```bash
git add -A && git commit -m "feat(client): pages and components read from Convex hooks"
```

---

### Task 10: API routes on Clerk and Convex

**Files:**
- Modify: `src/app/api/scrape/route.ts`, `src/app/api/scrape/route.test.ts`, `src/app/api/persist-image/route.ts`, `src/app/api/persist-image/route.test.ts`, `src/app/api/account/delete/route.ts`
- Create: `src/lib/convex/server.ts`
- Delete: `src/lib/supabase/server.ts`

**Interfaces:**
- Produces: `getConvexToken(): Promise<string | null>` (server-only) in `src/lib/convex/server.ts`.
- Consumes: `api.images.generateUploadUrl`, `api.images.attach`, `api.users.deleteAccount`.

- [ ] **Step 1: Server helper**

`src/lib/convex/server.ts`:

```ts
import { auth } from "@clerk/nextjs/server";

export async function getConvexToken(): Promise<string | null> {
  const session = await auth();
  if (!session.userId) return null;
  return session.getToken({ template: "convex" });
}
```

- [ ] **Step 2: Scrape route**

In `src/app/api/scrape/route.ts` replace the Supabase block (lines around 128–137) with:

```ts
import { auth } from "@clerk/nextjs/server";
// ...
const { userId } = await auth();
if (!userId) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

Update `route.test.ts`: replace the `@/lib/supabase/server` mock with

```ts
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
import { auth } from "@clerk/nextjs/server";
// in tests: vi.mocked(auth).mockResolvedValue({ userId: "user_1" } as Awaited<ReturnType<typeof auth>>);
// for the 401 case: vi.mocked(auth).mockResolvedValue({ userId: null } as Awaited<ReturnType<typeof auth>>);
```

- [ ] **Step 3: Persist-image route**

In `src/app/api/persist-image/route.ts` keep everything up to the point where `bytes` and `contentType` are known, then replace the Supabase upload and recipe update with:

```ts
import { fetchMutation } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { getConvexToken } from "@/lib/convex/server";

// ...after validating body and fetching bytes:
const token = await getConvexToken();
if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

const uploadUrl = await fetchMutation(api.images.generateUploadUrl, {}, { token });
const upload = await fetch(uploadUrl, {
  method: "POST",
  headers: { "Content-Type": contentType },
  body: bytes,
});
if (!upload.ok) return NextResponse.json({ error: "Upload failed" }, { status: 502 });
const { storageId } = (await upload.json()) as { storageId: Id<"_storage"> };

try {
  const image = await fetchMutation(api.images.attach, { recipeId: recipeId as Id<"recipes">, storageId }, { token });
  return NextResponse.json({ image });
} catch {
  return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
}
```

The ownership check moved into `images.attach` (it throws for recipes the caller does not own). Delete the old "recipe must belong to user" Supabase query. In `route.test.ts` mock `convex/nextjs` (`fetchMutation: vi.fn()`) and `@/lib/convex/server` (`getConvexToken: vi.fn().mockResolvedValue("tok")`), and mock the global `fetch` for the upload URL the way the test already mocks image fetches. Keep every SSRF, size, and content-type test unchanged.

- [ ] **Step 4: Account delete route**

`src/app/api/account/delete/route.ts`:

```ts
import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { fetchMutation } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { getConvexToken } from "@/lib/convex/server";

export async function POST() {
  const { userId } = await auth();
  const token = await getConvexToken();
  if (!userId || !token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await fetchMutation(api.users.deleteAccount, {}, { token });
  } catch {
    return NextResponse.json({ error: "Failed to delete account data" }, { status: 500 });
  }

  try {
    const client = await clerkClient();
    await client.users.deleteUser(userId);
  } catch {
    return NextResponse.json(
      { error: "Your data was removed but the sign-in account could not be deleted. Sign in again and retry." },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
```

If `users.deleteAccount` throws "User not provisioned" on a retry (data already purged), treat that as success: catch `ConvexError` with that message and continue to the Clerk deletion.

- [ ] **Step 5: Delete the last Supabase file, verify, commit**

```bash
git rm src/lib/supabase/server.ts
rmdir src/lib/supabase
grep -rn "supabase" src --include='*.ts' --include='*.tsx' | grep -v "\.test\." ; echo "expect no output above"
bun run typecheck && bun run lint && bun run test
git add -A && git commit -m "feat(api): routes authenticate with Clerk and store images in Convex"
```

Manual check: paste a recipe with an external image; within a few seconds the recipe's image URL should start with your `*.convex.cloud` storage domain (check the Convex dashboard Files tab).

---

### Task 11: Remove Supabase packages and leftovers

**Files:**
- Modify: `package.json`, `.env.local.example`, `README.md` (if it mentions Supabase setup), `playwright.config.ts`
- Delete: `scripts/backfill-images.mjs`

- [ ] **Step 1: Remove dependencies and files**

```bash
bun remove @supabase/ssr @supabase/supabase-js
git rm scripts/backfill-images.mjs
grep -rn "SUPABASE" .env.local.example README.md src convex 2>/dev/null
```

Remove every `SUPABASE_*` line from `.env.local.example`. Leave `.env.local` alone (the migration action still needs the Supabase values as Convex env vars, set in Task 12; the local file is yours).

- [ ] **Step 2: Playwright web server command**

In `playwright.config.ts` change `command: "npm run dev"` to `command: "bun run dev"`.

- [ ] **Step 3: Verify and commit**

```bash
bun run typecheck && bun run lint && bun run test
git add -A && git commit -m "chore: remove Supabase dependencies and scripts"
```

---

### Task 12: Migration action and dev-deployment import

**Files:**
- Modify: `convex/migration.ts` (add the `run` action)
- Create: `scripts/migrate.md`

**Interfaces:**
- Produces: `internal.migration.run({ apply: boolean, skipUnmatched: boolean })` → summary object `{ users: { read, linked, unmatched: string[] }, recipes: { read, written }, images: { copied, failed: string[] }, mealPlans: { read, written, skipped }, groups: { read, written }, groupMembers: { read, written }, issueMembers: { read, written }, templates: { read, written } }`.
- Consumes: the `internal.migration.upsert*` mutations; Convex env vars `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

- [ ] **Step 1: Set the Supabase secrets on the dev deployment**

```bash
bunx convex env set SUPABASE_URL https://hbxafgtdxnfrkgtpyzii.supabase.co
bunx convex env set SUPABASE_SERVICE_ROLE_KEY "$(grep -o 'SUPABASE_SERVICE_ROLE_KEY=[^ ]*' .env.local | cut -d= -f2)"
```

- [ ] **Step 2: Write the action**

Append to `convex/migration.ts`:

```ts
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

type Row = Record<string, unknown>;

async function sbFetchAll(table: string, order: string): Promise<Row[]> {
  const base = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const rows: Row[] = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${base}/rest/v1/${table}?select=*&order=${order}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Range-Unit": "items", Range: `${offset}-${offset + 999}` },
    });
    if (!res.ok) throw new Error(`Supabase ${table} ${res.status}`);
    const page = (await res.json()) as Row[];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

async function sbUsers(): Promise<Array<{ id: string; email: string }>> {
  const base = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const res = await fetch(`${base}/auth/v1/admin/users?per_page=1000`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`Supabase auth users ${res.status}`);
  const body = (await res.json()) as { users: Array<{ id: string; email: string }> };
  return body.users;
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v.length > 0 ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);

export const run = internalAction({
  args: { apply: v.boolean(), skipUnmatched: v.boolean() },
  handler: async (ctx, { apply, skipUnmatched }) => {
    const summary = {
      users: { read: 0, linked: 0, unmatched: [] as string[] },
      recipes: { read: 0, written: 0 },
      images: { copied: 0, failed: [] as string[] },
      mealPlans: { read: 0, written: 0, skipped: 0 },
      groups: { read: 0, written: 0 },
      groupMembers: { read: 0, written: 0 },
      issueMembers: { read: 0, written: 0 },
      templates: { read: 0, written: 0 },
    };

    // 1. users
    const users = await sbUsers();
    summary.users.read = users.length;
    const linked = new Set<string>();
    for (const u of users) {
      const id = apply ? await ctx.runMutation(internal.migration.upsertUser, { legacyId: u.id, email: u.email.toLowerCase() }) : "dry";
      if (id) { linked.add(u.id); summary.users.linked++; } else summary.users.unmatched.push(u.email);
    }
    if (apply && summary.users.unmatched.length > 0 && !skipUnmatched) {
      throw new Error(`Unmatched Supabase users: ${summary.users.unmatched.join(", ")}. Create them in Clerk or pass skipUnmatched=true.`);
    }
    const ok = (userId: unknown) => typeof userId === "string" && (!apply || linked.has(userId));

    // 2. recipes with embedded lists
    const [recipes, ingredients, instructions, tags] = await Promise.all([
      sbFetchAll("recipes", "created_at"),
      sbFetchAll("recipe_ingredients", "sort_order"),
      sbFetchAll("recipe_instructions", "sort_order"),
      sbFetchAll("recipe_tags", "id"),
    ]);
    summary.recipes.read = recipes.length;
    const byRecipe = <T extends Row>(rows: T[]) => {
      const m = new Map<string, T[]>();
      for (const r of rows) (m.get(String(r.recipe_id)) ?? m.set(String(r.recipe_id), []).get(String(r.recipe_id))!).push(r);
      return m;
    };
    const ingBy = byRecipe(ingredients), insBy = byRecipe(instructions), tagBy = byRecipe(tags);
    const bucketPrefix = `${process.env.SUPABASE_URL}/storage/v1/object/public/recipe-images/`;

    for (const r of recipes) {
      if (!ok(r.user_id)) continue;
      const legacyId = String(r.id);
      let imageStorageId: Id<"_storage"> | undefined;
      const image = str(r.image);
      if (apply && image && image.startsWith(bucketPrefix)) {
        const existing = await ctx.runMutation(internal.migration.findRecipeByLegacyId, { legacyId });
        if (!existing) {
          try {
            const res = await fetch(image);
            if (!res.ok) throw new Error(String(res.status));
            imageStorageId = await ctx.storage.store(await res.blob());
            summary.images.copied++;
          } catch (e) {
            summary.images.failed.push(`${legacyId}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      }
      if (apply) {
        await ctx.runMutation(internal.migration.upsertRecipe, {
          legacyId,
          userLegacyId: String(r.user_id),
          title: String(r.title),
          image,
          imageStorageId,
          sourceUrl: str(r.source_url) ?? "",
          prepTime: str(r.prep_time), cookTime: str(r.cook_time), totalTime: str(r.total_time),
          servings: str(r.servings), author: str(r.author), cuisineType: str(r.cuisine_type),
          difficulty: r.difficulty === "Easy" || r.difficulty === "Medium" || r.difficulty === "Hard" ? r.difficulty : undefined,
          rating: num(r.rating),
          isFavorite: r.is_favorite === true,
          notes: str(r.notes),
          ingredients: (ingBy.get(legacyId) ?? []).sort((a, b) => Number(a.sort_order) - Number(b.sort_order)).map((x) => String(x.text)),
          instructions: (insBy.get(legacyId) ?? []).sort((a, b) => Number(a.sort_order) - Number(b.sort_order)).map((x) => String(x.text)),
          tags: (tagBy.get(legacyId) ?? []).map((x) => String(x.tag)),
          createdAt: String(r.created_at),
        });
      }
      summary.recipes.written++;
    }

    // 3. groups, members
    const groups = await sbFetchAll("recipe_groups", "sort_order");
    summary.groups.read = groups.length;
    for (const g of groups) {
      if (!ok(g.user_id)) continue;
      if (apply) await ctx.runMutation(internal.migration.upsertGroup, {
        legacyId: String(g.id), userLegacyId: String(g.user_id), name: String(g.name), icon: str(g.icon),
        sortOrder: num(g.sort_order) ?? 0, isDefault: g.is_default === true,
      });
      summary.groups.written++;
    }
    const groupIds = new Set(groups.filter((g) => ok(g.user_id)).map((g) => String(g.id)));
    const members = await sbFetchAll("recipe_group_members", "id");
    summary.groupMembers.read = members.length;
    for (const m of members) {
      if (!groupIds.has(String(m.group_id))) continue;
      if (apply) await ctx.runMutation(internal.migration.upsertGroupMember, { groupLegacyId: String(m.group_id), recipeLegacyId: String(m.recipe_id) });
      summary.groupMembers.written++;
    }

    // 4. meal plans
    const plans = await sbFetchAll("meal_plans", "date");
    summary.mealPlans.read = plans.length;
    for (const p of plans) {
      if (!ok(p.user_id)) continue;
      const mt = p.meal_type;
      if (mt !== "breakfast" && mt !== "lunch" && mt !== "dinner" && mt !== "snack") continue;
      const written = apply
        ? await ctx.runMutation(internal.migration.upsertMealPlan, {
            userLegacyId: String(p.user_id), recipeLegacyId: String(p.recipe_id), date: String(p.date),
            mealType: mt, isLeftover: p.is_leftover === true, position: num(p.position) ?? 0,
          })
        : true;
      if (written) summary.mealPlans.written++; else summary.mealPlans.skipped++;
    }

    // 5. templates (recipe ids inside days are remapped)
    const templates = await sbFetchAll("meal_templates", "created_at");
    summary.templates.read = templates.length;
    for (const t of templates) {
      if (!ok(t.user_id)) continue;
      const days = t.template as Record<string, { breakfast?: unknown[]; lunch?: unknown[]; dinner?: unknown[]; snack?: unknown[] }>;
      const remapped: Record<string, { breakfast: Entry[]; lunch: Entry[]; dinner: Entry[]; snack: Entry[] }> = {};
      type Entry = { recipeId: string; isLeftover: boolean; position: number };
      for (const [k, day] of Object.entries(days ?? {})) {
        const slot = async (list: unknown[] | undefined): Promise<Entry[]> => {
          const out: Entry[] = [];
          for (const e of list ?? []) {
            const entry = e as { recipeId?: unknown; isLeftover?: unknown; position?: unknown };
            if (typeof entry.recipeId !== "string") continue;
            const id = apply ? await ctx.runMutation(internal.migration.findRecipeByLegacyId, { legacyId: entry.recipeId }) : entry.recipeId;
            if (!id) continue;
            out.push({ recipeId: id, isLeftover: entry.isLeftover === true, position: num(entry.position) ?? 0 });
          }
          return out;
        };
        remapped[k] = { breakfast: await slot(day.breakfast), lunch: await slot(day.lunch), dinner: await slot(day.dinner), snack: await slot(day.snack) };
      }
      if (apply) await ctx.runMutation(internal.migration.upsertTemplate, { legacyId: String(t.id), userLegacyId: String(t.user_id), name: String(t.name), days: remapped });
      summary.templates.written++;
    }

    // 6. issue report members
    const issueMembers = await sbFetchAll("issue_report_members", "user_id");
    summary.issueMembers.read = issueMembers.length;
    for (const m of issueMembers) {
      if (!ok(m.user_id)) continue;
      if (apply) await ctx.runMutation(internal.migration.upsertIssueReportMember, { userLegacyId: String(m.user_id) });
      summary.issueMembers.written++;
    }

    return summary;
  },
});
```

Move the `type Entry` declaration above its first use inside the templates loop (TypeScript needs it declared before `remapped`). Add `import type { Id } from "./_generated/dataModel"` at the top if not already present (it is, from the mutations).

- [ ] **Step 3: Write the runbook**

`scripts/migrate.md`:

```markdown
# Migrating Supabase data into Convex

Prerequisites: every Supabase user has signed up in Clerk with the same email
(dev instance for the dev deployment, prod instance for prod). The Convex
deployment has SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set.

Dry run (reads everything, writes nothing, prints counts and unmatched users):

    bunx convex run migration:run '{"apply": false, "skipUnmatched": false}'

Apply:

    bunx convex run migration:run '{"apply": true, "skipUnmatched": false}'

Production:

    bunx convex env set SUPABASE_URL ... --prod
    bunx convex env set SUPABASE_SERVICE_ROLE_KEY ... --prod
    bunx convex run migration:run '{"apply": true, "skipUnmatched": false}' --prod

Re-running is safe: rows are keyed by legacyId. Afterwards remove the two
Supabase env vars from the deployment:

    bunx convex env remove SUPABASE_URL
    bunx convex env remove SUPABASE_SERVICE_ROLE_KEY
```

- [ ] **Step 4: Dry run, then apply on dev**

Sign up in the app (dev Clerk instance) with `abeche88@gmail.com` and, if available, the second account. Then:

```bash
bunx convex dev --once
bunx convex run migration:run '{"apply": false, "skipUnmatched": false}'
```

Expected dry-run counts: users 2, recipes 91, groups 3, groupMembers 4, mealPlans 17, templates 0, issueMembers 1. Then:

```bash
bunx convex run migration:run '{"apply": true, "skipUnmatched": true}'
```

Expected: `images.copied` 90, `images.failed` empty, `recipes.written` 91 (or 72 if only one account is matched and `skipUnmatched` is true; the summary says which). Open the app: the recipes list shows the migrated recipes with images served from Convex storage. Run it a second time and confirm `written` counts are unchanged and nothing is duplicated.

- [ ] **Step 5: Test and commit**

```bash
bun run typecheck && bun run lint && bun run test
git add -A && git commit -m "feat(migration): Convex action that imports Supabase data and images"
```

---

### Task 13: End-to-end test on Clerk and CSP assertion

**Files:**
- Create: `e2e/global.setup.ts`
- Modify: `playwright.config.ts`, `e2e/core-loop.spec.ts`, `.gitignore`

- [ ] **Step 1: Global setup**

`e2e/global.setup.ts`:

```ts
import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { test as setup } from "@playwright/test";
import path from "path";

setup.describe.configure({ mode: "serial" });

setup("clerk testing token", async () => {
  await clerkSetup();
});

const authFile = path.join(__dirname, "../playwright/.clerk/user.json");

setup("sign in test user", async ({ page }) => {
  await page.goto("/login");
  await clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_USER_EMAIL! });
  await page.goto("/");
  await page.waitForSelector("[aria-label='Recipe URL']");
  await page.context().storageState({ path: authFile });
});
```

Add `playwright/.clerk/` to `.gitignore`.

- [ ] **Step 2: Playwright config**

In `playwright.config.ts` add a setup project and make chromium depend on it, and switch the skip condition env var:

```ts
projects: [
  { name: "setup", testMatch: /global\.setup\.ts/ },
  {
    name: "chromium",
    use: { ...devices["Desktop Chrome"], storageState: "playwright/.clerk/user.json" },
    dependencies: ["setup"],
  },
],
```

- [ ] **Step 3: Update the core loop**

In `e2e/core-loop.spec.ts` delete the `EMAIL`/`PASSWORD` constants and the Login section (the `page.goto("/login")` through the "Sign in" click). Replace the skip with:

```ts
test.skip(!process.env.E2E_CLERK_USER_EMAIL, "Set E2E_CLERK_USER_EMAIL (a Clerk dev-instance test user) to run");
```

Start the flow at `await page.goto("/")` and keep every later step. Add one assertion right after the first navigation:

```ts
const response = await page.goto("/");
const csp = response?.headers()["content-security-policy"] ?? "";
expect(csp).toContain("nonce-");
expect(csp).toContain("convex.cloud");
```

Update the header comment to say sign-in uses Clerk's testing token and data goes to the Convex dev deployment.

- [ ] **Step 4: Run**

Create a test user in the Clerk dev instance (dashboard → Users → Create) with a throwaway email, then:

```bash
E2E_CLERK_USER_EMAIL=<that email> bun run test:e2e
```

Expected: setup project passes, core loop passes. Commit:

```bash
git add -A && git commit -m "test(e2e): sign in through Clerk testing token; assert CSP header"
```

---

### Task 14: Review gate and cutover checklist

**Files:**
- Create: `docs/superpowers/plans/2026-09-11-convex-cutover-checklist.md`

- [ ] **Step 1: Independent review**

Run the codex-review skill (gpt-6-astra, read-only) over `git diff main...convex-migration` with the spec as the requirements source. Then run one fresh-session audit asking for `AUDIT: PASS` or `AUDIT: CONCERNS`. Fix confirmed findings in follow-up commits on the branch.

- [ ] **Step 2: Cutover checklist**

Write the file with these items, each a checkbox, for Che to execute:

1. Clerk: "Go to prod" on the CookSnap app; enable email/password and Google with own Google OAuth credentials; set the production domain; activate the Convex integration on the production instance; copy prod keys.
2. Convex: `bunx convex deploy` from the branch creates the prod deployment; set `CLERK_JWT_ISSUER_DOMAIN` on prod to the production Clerk Frontend API URL.
3. Both users sign up on the production app URL (a Vercel preview of the branch pointed at prod Convex is fine) with the same emails.
4. Run the migration on prod per `scripts/migrate.md`; confirm counts match the dev run; remove the Supabase env vars from the prod deployment.
5. Vercel: set `NEXT_PUBLIC_CONVEX_URL`, `CONVEX_DEPLOY_KEY` (for build-time deploys), `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and the four `NEXT_PUBLIC_CLERK_*_URL` vars; delete all `SUPABASE_*` vars; merge the branch; deploy.
6. Spot-check recipes list, one meal-plan week, shopping list, cook mode, profile.
7. Two weeks later: delete the Supabase project, then delete the `supabase/` directory from the repo.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "docs: Convex cutover checklist"
```
