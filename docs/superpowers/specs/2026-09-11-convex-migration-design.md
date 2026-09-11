# CookSnap: migrate from Supabase to Convex + Clerk

Date: 2026-09-11
Status: approved 2026-09-11 (revised same day: migration runs as a Convex action; route protection stays in the proxy)
Author: Claude Fable 5.1 (main session, effort: high) with Che

## Goal

Replace Supabase (Postgres, Auth, Storage) with Convex for data and file
storage and Clerk for authentication, in one cutover, keeping every recipe,
meal plan, list, group, and issue report that exists in production today.

## Decisions already made

| Decision | Choice | Why |
|---|---|---|
| Migration style | Full replacement, Convex-native (option 1) | Two-user app; a strangler or transport-only swap keeps Supabase-shaped code without Convex's reactivity |
| Auth provider | Clerk | Matches stack preference, first-class Convex integration, email/password and Google out of the box |
| Existing data | Migrate all rows and images | It is Che's and family's data |
| Existing accounts | Not migrated; users re-sign-up in Clerk with the same email, then rows are linked by email | Two known users; avoids exporting password hashes |
| Offline | Read-only snapshot, no offline writes | Convex retries in-session but does not persist mutations across reloads; offline editing is not worth the queue |
| State management | Zustand keeps ephemeral UI state only (cooking mode) | Server state lives in Convex subscriptions |

## Out of scope

- Row-level security parity beyond ownership checks (no org or sharing model exists today).
- Offline writes. The existing offline queue is deleted, not ported.
- Any UI redesign. Pages keep their current layout and copy except where the
  auth pages are replaced by Clerk components.
- Deleting the Supabase project. It stays paused as a rollback for two weeks
  after cutover, then Che deletes it manually.

## Current Supabase surface (what has to move)

- Tables (13): profiles, recipes, recipe_ingredients, recipe_instructions,
  recipe_tags, meal_plans, meal_templates, shopping_items, grocery_items,
  checked_ingredients, recipe_groups, recipe_group_members, issue_reports,
  issue_report_members. Source of truth: `supabase/schema.sql` plus five
  migrations.
- Storage: one public bucket `recipe-images`. 90 recipe images live there
  (the export on 2026-09-11 counted 90 objects; an earlier commit message
  said 62).
- Auth: email/password, Google OAuth, PKCE callback route, email-confirmed page.
- Code: `src/stores/recipe-store.ts` (1,406 lines, every DB call),
  `src/components/auth-provider.tsx`, `src/lib/supabase/*`, `src/middleware.ts`,
  three API routes (`scrape`, `persist-image`, `account/delete`), the
  `login`, `signup`, `auth/callback`, `auth/confirmed`, `profile`, `issues`,
  and `meal-plan` pages, and 18 components that read the store.
- Untouched: scraper, ingredient parser and aggregator, recipe export/backup,
  schemas, UI components, service worker shell caching.

## Architecture

### 1. Auth and app shell

- `@clerk/nextjs` and `convex` are added; `@supabase/ssr` and
  `@supabase/supabase-js` are removed.
- `src/middleware.ts` is deleted. `src/proxy.ts` exports
  `clerkMiddleware({ contentSecurityPolicy: { strict: true } })`. Clerk
  generates the per-request nonce and sets the CSP header; the hand-rolled
  nonce and header code in the old middleware goes away. The route matcher
  keeps excluding `manifest.webmanifest`, `sw.js`, and static assets. Routes
  are public by default; page and route-handler code enforce sign-in.
- Root layout wraps children in `ClerkProvider` (with `dynamic` so the nonce
  is read per request) and a client-component wrapper around
  `ConvexProviderWithClerk`. `next-themes` keeps its `nonce` prop, read from
  the `x-nonce` header Clerk sets.
- `convex/auth.config.ts` lists Clerk as the JWT issuer using
  `CLERK_JWT_ISSUER_DOMAIN`. Dev and prod Clerk instances map to the Convex
  dev deployment and prod deployment respectively.
- `/login` and `/signup` render Clerk's `<SignIn />` and `<SignUp />` with
  the app's card styling via Clerk appearance props. `/auth/callback` and
  `/auth/confirmed` are deleted. Google is enabled in the Clerk dashboard.
- Route protection stays in the proxy, mirroring the old middleware: a
  `createRouteMatcher` marks `/login`, `/signup`, `/api`, the manifest, and
  `sw.js` public and `auth.protect()` redirects everything else to `/login`.
  API routes return their own JSON 401s. Clerk's sign-in and sign-up
  components send already signed-in users to `/`.
- `src/components/auth-provider.tsx` is deleted. Components use Clerk's
  `useUser` and `useAuth`.
- User records: a `users` table keyed by Clerk subject is upserted by a
  `users.ensure` mutation the client calls once after sign-in (via a small
  `useEnsureUser` hook in the provider wrapper). No Clerk webhook is needed
  for creation. Profile page edits `displayName`; email and avatar come from
  Clerk.

### 2. Data model (`convex/schema.ts`)

Ingredients, instructions, and tags are embedded in the recipe document as
ordered arrays. They are always read and written together with the recipe
and have no independent identity, so three tables and every join disappear.
Everything else maps one to one.

```
users            { clerkId, email, displayName?, avatarUrl?, legacyId? }
                 index by_clerkId, by_email
recipes          { userId, title, image?, imageStorageId?, sourceUrl,
                   prepTime?, cookTime?, totalTime?, servings?, author?,
                   cuisineType?, difficulty?, rating?, isFavorite, notes?,
                   ingredients: string[], instructions: string[],
                   tags: string[], legacyId? }
                 index by_user, by_legacyId
mealPlans        { userId, date, mealType, recipeId, isLeftover, position }
                 index by_user_date, by_user_date_type
mealTemplates    { userId, name, template: any (validated jsonb shape) }
                 index by_user
shoppingItems    { userId, text, checked, recipeId? }      index by_user
groceryItems     { userId, text, checked }                index by_user
checkedIngredients { userId, recipeId, ingredientIndex }  index by_user_recipe
recipeGroups     { userId, name, icon?, sortOrder, isDefault, legacyId? }
                 index by_user
recipeGroupMembers { groupId, recipeId }                  index by_group, by_recipe
issueReports     { reporterId?, reporterEmail?, title, description, steps?,
                   expected?, actual?, pageUrl?, severity, status }
                 index by_status
issueReportMembers { userId }                             index by_user
```

- `createdAt` and `updatedAt` columns are not carried; Convex's
  `_creationTime` covers creation. Where the UI sorts by `updated_at`
  (recipes list), it sorts by `_creationTime` instead. This is a visible
  ordering change for edited recipes and is accepted.
- `image` keeps the last known URL. `imageStorageId` is set when the image
  has been persisted to Convex storage; queries return a resolved
  `imageUrl` via `ctx.storage.getUrl`, falling back to `image`.
- Postgres check constraints (difficulty enum, rating 1-5, text length caps,
  meal type enum, severity and status enums) become `v.union(v.literal(...))`
  validators and explicit length checks in mutations.
- Unique constraints (meal plan slot, checked ingredient, group member) are
  enforced in mutations by index lookup before insert.
- Cascades: deleting a recipe removes its meal plans, checked ingredients,
  group memberships, and sets `recipeId` to undefined on shopping items.
  Deleting a group removes its memberships. Deleting a user removes
  everything owned by the user. Each cascade is one mutation that walks the
  relevant indexes.

### 3. Server functions (`convex/`)

One module per domain: `users`, `recipes`, `mealPlans`, `mealTemplates`,
`shoppingItems`, `groceryItems`, `checkedIngredients`, `recipeGroups`,
`issueReports`, plus `images` and `migration`.

- Every public query and mutation calls a shared `requireUser(ctx)` helper
  that reads `ctx.auth.getUserIdentity()`, looks up the `users` row by
  `clerkId`, and throws when absent. Ownership is checked by comparing the
  document's `userId` with that row's id. This replaces row-level security.
- Issue reports: any signed-in user can list and create; only members of
  `issueReportMembers` can change status. Mirrors the current policies.
- Queries return data already shaped for the UI (for example the meal plan
  for a week grouped by date and slot), so components do no client-side
  joining.
- `images.attach` is a mutation that sets `imageStorageId` and `image` on a
  recipe the caller owns. `images.generateUploadUrl` returns an upload URL
  for the authenticated caller.
- `migration.*` are `internalMutation`s used only by the import script
  (section 5). They are not callable from clients.

### 4. Next.js server routes

- `POST /api/scrape` stays. Auth via `auth()` from Clerk instead of Supabase.
- `POST /api/persist-image` keeps its SSRF blocklist, size cap, content-type
  allowlist, and data-URI decoding. After fetching the bytes it asks Convex
  for an upload URL (`fetchMutation` with the caller's Clerk token via
  `convex/nextjs` and `getAuthToken`), POSTs the bytes there, and calls
  `images.attach` with the returned storage id. The route stays in Next
  because `convex-test` runs in an edge runtime and cannot exercise the
  Node-only fetch controls, and because the existing safe-fetch tests keep
  covering it.
- `POST /api/account/delete` runs `users.deleteAccount` (an authenticated
  mutation that removes every row owned by the caller, and their image
  files from storage) and then deletes the Clerk user through the Clerk
  backend SDK. Data goes first: if the Clerk call fails the user is still
  signed in and can retry; the retry finds nothing to purge and proceeds to
  Clerk.

### 5. Client data layer

- `src/lib/convex/` holds one hook module per domain (`use-recipes.ts`,
  `use-meal-plan.ts`, `use-shopping.ts`, `use-grocery.ts`, `use-groups.ts`,
  `use-issues.ts`, `use-user.ts`). Each wraps `useQuery` and `useMutation`
  with typed arguments and, for toggles (shopping item, grocery item,
  checked ingredient, favorite), an optimistic update via
  `useMutation(...).withOptimisticUpdate`.
- `src/stores/recipe-store.ts` shrinks to cooking mode state
  (`cookingRecipeId`, `cookingCompletedSteps`, start, stop, toggle step),
  still persisted to localStorage. The hydrate flow, localStorage-to-server
  migration, offline queue, and persist middleware for server data are
  deleted, along with `src/lib/offline-queue.ts` and its test.
- The 18 components that call `useRecipeStore` for server data switch to the
  domain hooks. Loading states use `useQuery` returning `undefined`.
- Read-only offline snapshot: `src/lib/convex/use-offline-snapshot.ts`
  mirrors the recipes and both lists to localStorage whenever a query
  resolves, and the recipes and shopping pages render the snapshot with an
  "Offline, showing saved copy" banner when `useConvexConnectionState()`
  reports disconnected and the live query is still `undefined`. Mutations
  are disabled in that state. Budget: about 60 lines plus the banner.

### 6. Data migration action

`internal.migration.run({ apply, skipUnmatched })`, a Convex internal action
invoked with `bunx convex run migration:run '{...}'` once per target
deployment (dev first, then prod), documented in `scripts/migrate.md`. It
runs inside Convex so it can call `ctx.storage.store` for images directly
and needs no admin deploy key; the Supabase URL and service role key are set
as deployment env vars for the migration window and removed afterwards.
`apply: false` is a dry run that reads everything and writes nothing.

1. Reads every table from Supabase with the service role key, paginating
   in pages of 1,000 rows (PostgREST caps unpaginated responses at 1,000).
2. Links each Supabase user to the Convex `users` row with the same email
   (created when that person signed in through Clerk). Supabase users
   without a match are listed and their rows skipped; in apply mode the
   action throws unless `skipUnmatched` is true.
3. For each matched user, upserts `users` with `legacyId` = Supabase user id.
4. Assembles recipes with embedded ingredient, instruction, and tag arrays
   ordered by `sort_order`. For each image hosted in the `recipe-images`
   bucket, downloads the bytes and stores them with `ctx.storage.store`,
   setting `imageStorageId`. External image URLs are copied as-is.
5. Writes remaining tables in dependency order, remapping ids through
   `legacyId` lookups.
6. Every write goes through `migration.upsert*` internal mutations keyed by
   `legacyId`, so re-running is idempotent and safe after a partial failure.
7. Returns per-table counts read, written, and skipped, image copy failures,
   and the list of unmatched users.

The action needs the Supabase project restored and reachable. Nothing is
modified or deleted on the Supabase side.

### 7. Testing

- Unchanged: scraper, ingredient parser, aggregator, export, schema, and
  safe-fetch tests.
- Deleted: `recipe-store.test.ts` server-state cases and
  `offline-queue.test.ts`. The cooking-mode cases stay.
- New: one `convex-test` file per Convex module under `convex/*.test.ts`,
  covering ownership rejection, cascades, unique-slot enforcement, and
  issue-report member gating. These run in Vitest with
  `// @vitest-environment edge-runtime` at the top of each file, and the
  vitest config adds `server.deps.inline: ["convex-test"]`.
- Middleware tests are deleted with the middleware; Clerk's CSP behaviour
  is verified in the Playwright run by asserting the header.
- Playwright core loop: sign in through `@clerk/testing`'s
  `clerk.signIn({ emailAddress })` in a global setup with a dedicated test
  user in the dev Clerk instance. The rest of the flow is unchanged.
- Acceptance: the project's `typecheck`, `lint`, `test`, and `test:e2e`
  scripts pass; a manual pass in the dev deployment confirms scrape,
  save, plan, shop, cook, groups, issues, profile edit, and account delete.

### 8. Environment and cutover

Environment variables:

| Where | Variable |
|---|---|
| Next (Vercel + `.env.local`) | `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` |
| Convex dashboard | `CLERK_JWT_ISSUER_DOMAIN` |
| Convex deployment, migration window only | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |

Removed after cutover: all `SUPABASE_*` variables from Vercel and
`.env.local` (except in the script's env during the migration window).

Cutover order:

1. Che and family create Clerk accounts in the prod instance with the same
   emails as Supabase.
2. Run the migration action against the prod Convex deployment.
3. Deploy the branch to Vercel with the new variables.
4. Spot-check the recipes list, one meal-plan week, and the shopping list.
5. Leave Supabase paused for two weeks, then delete.

Rollback within that window is redeploying the previous Vercel deployment
and restoring the Supabase project.

## Files to delete

`src/lib/supabase/`, `src/middleware.ts`, `src/components/auth-provider.tsx`,
`src/app/auth/`, `src/lib/offline-queue.ts` and test, `supabase/` (after the
migration has run in prod and the two-week window has passed; kept in git
history), `scripts/backfill-images.mjs`.

## Risks

- Clerk's strict CSP mode must coexist with `next-themes`' inline script
  and Sonner. Verified in the first implementation step by loading every
  page with the header on and checking the console.
- Ordering by `_creationTime` instead of `updated_at` changes recipe list
  order for edited recipes. Accepted above.
- Two users must sign up in Clerk before the prod migration runs. The action
  refuses to apply with unmatched users unless told to skip them.
