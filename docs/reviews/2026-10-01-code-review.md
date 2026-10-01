# Post-review report — CookSnap

| Field | Value |
| --- | --- |
| Document | Post-review report |
| Review date | 2026-10-01 |
| Repository | [Che1195/cooksnap](https://github.com/Che1195/cooksnap) |
| Reviewed revision | `03e64b7225f9627d977e6cf784f6208140f42819` |
| Revision subject | Add feedback and clean up recipe-derived data on deletion (#9) |
| Revision commit time | 2026-09-16 19:25:42 -0400 |
| Branch reviewed | `main` |
| Reviewer | Cursor Cloud Agent |
| Review type | Independent static code review of the current tree |
| Prior audit | [`AUDIT.md`](../../AUDIT.md), rounds 1–5, closed 2026-02-23 |
| Finding totals | 0 critical, 0 high, 3 medium, 8 low |
| Disposition | Open. This pass records findings. It does not change application code. |

## Scope

This review covers the application as it stands after the Convex and Clerk cutover, AI recipe capture, and the feedback inbox. The areas read in detail were:

- Convex schema and public functions: auth, recipes, images, imports, users and account purge, issue reports, meal plans, templates, groups, shopping and grocery lists, checked ingredients
- Next.js routes: `/api/scrape`, `/api/persist-image`, `/api/account/delete`
- Fetch and render path: `src/lib/safe-fetch.ts`, `src/lib/recipe-capture-fetch.ts`, `src/lib/cloudflare-render.ts`, `src/lib/recipe-capture-model.ts`, `src/lib/recipe-interpretation.ts`
- Client trust boundary: Clerk proxy, offline snapshots, sign-out cleanup, recipe deletion cache cleanup, service worker

Generated Convex bindings, historical recipe-capture JSON dumps, and the February audit’s closed Supabase items were not re-litigated. A finding from that audit is cited only where the same control is missing from the current server boundary.

## Method

The review was a manual reading of the current source, checked against the tests that lock the same behavior. It looked for broken ownership checks, server-side request forgery gaps, unbounded writes, and client caches that survive account changes.

The unit suite was not executed in this pass. CI on push and pull request runs typecheck, lint, and Vitest (`.github/workflows/ci.yml`). Playwright end-to-end tests are outside that workflow.

## Result

The current boundary is in good shape for a single-user recipe app. Public Convex functions authenticate, recipe and group mutations check ownership, recipe interpretation is rejected when it does not match the saved text, and recipe capture pins DNS before it connects. Sign-out clears `cooksnap*` `localStorage`, and offline snapshots include the Clerk user id.

The open issues are places where a second path is weaker than the path that was already hardened: image fetch versus pinned recipe fetch, the shared issue table versus per-user indexes, and upload or import rows that accumulate without a bound. None of them is an unauthenticated data leak between accounts.

## Findings

### Medium

#### CR-2026-10-01-01 — Image fetch does not use the pinned recipe client

`POST /api/persist-image` loads a caller-supplied image URL through `safeFetch` (`src/app/api/persist-image/route.ts`). That helper resolves the name, checks the answers, then calls `fetch` on the original URL (`src/lib/safe-fetch.ts`, `resolveAndValidateHost` and `safeFetch`). The connection is a second lookup. Recipe import and the Cloudflare renderer already avoid that pattern: `pinnedRecipeFetch` (`src/lib/recipe-capture-fetch.ts`) installs the chosen address as the socket lookup.

`isBlockedIP` also allows destinations that `publicAddress` in the pinned client rejects. The image path’s blocklist does not cover IPv4 multicast `224.0.0.0/4`, `192.0.0.0/24`, `192.88.99.0/24`, or IPv6 multicast `ff00::/8`. The pinned client still accepts 6to4 addresses under `2002::/16`, because its global-unicast check only carves out `2001:db8::/32` and Teredo `2001:0::/32`.

The route requires a signed-in Convex token, and it refuses non-HTTP(S) URLs and non-standard ports before the fetch. Impact is a signed-in user asking the server to connect somewhere the blocklist was meant to refuse, including a name whose address changes between the check and the connection. Cloud metadata and private ranges are the sensitive cases; whether those addresses are reachable depends on the host that runs the route.

Use `pinnedRecipeFetch` for image bytes, or fold one shared pinned client over both routes, and extend the address check so both callers reject the same ranges. Add tests that multicast, `192.0.0.0/24`, `192.88.99.0/24`, and `2002::/16` are refused.

#### CR-2026-10-01-02 — Issue queries and account deletion read every report

`issueReports.list` loads the whole `issueReports` table and then keeps either every row (inbox members) or the caller’s rows (`convex/issueReports.ts`). The schema indexes status and legacy id. It has no index on `reporterId`. The filter that hides other people’s reports is correct, and the tests in `convex/issueReports.test.ts` lock that result. The read set is still the entire table, and every subscribed client reruns when any report changes.

`purgeUser` does the same full scan to clear `reporterId` and `reporterEmail` on the departing user’s rows (`convex/users.ts`). Account deletion therefore gets more expensive as the shared inbox grows, and a large table can fail the mutation that is supposed to delete the account. The HTTP handler then stops before deleting the Clerk user, which is the safe failure, and it leaves the account in place.

Add an index on `reporterId`. Non-members should query only their rows. Members should page the inbox. Anonymize the departing user through that index.

#### CR-2026-10-01-03 — Storage uploads are not tied to a recipe or a quota

`images.generateUploadUrl` returns an upload URL to any signed-in user (`convex/images.ts`). Nothing records the pending file, limits how many a user can create, or deletes bytes that are never attached. `discard` runs only when `/api/persist-image` fails after a successful upload, and any signed-in user who knows an unreferenced storage id can delete it. Attached files are left alone, including another user’s file. Ids are unguessable, so the cross-user delete is not a practical attack on its own. The practical issue is cost: a signed-in caller can keep uploading objects the app never references.

`attach` correctly refuses a storage id that another account’s recipe already points at. The same user can attach one id to two recipes. `cascadeDeleteRecipe` and a later `attach` then delete that blob outright (`convex/recipes.ts`, `convex/images.ts`). The normal UI uploads a new blob per save, so the app does not hit this. A direct mutation can leave a second recipe pointing at a deleted file.

Record uploads against the user, reject or ignore unreferenced ids that the caller did not upload, and delete a blob only when no recipe still points at it. Clean up abandoned uploads from a scheduled internal job.

### Low

#### CR-2026-10-01-04 — Import admission reads a user’s entire attempt history

`imports.reserve` loads every `importAttempts` row for the user and then filters to the last day in memory (`convex/imports.ts`). Rows are removed only when the account is purged. At the published cap of 20 imports a day, the read set grows without a matching index on time. Convex serializes concurrent reserves that touch the shared monthly budget document, so the cap itself holds. The failure mode is later: admission keeps reading history that can no longer affect the 24-hour or 1-minute windows.

Keep a counter, or index attempts by user and time, and drop rows outside the retention window with an internal job.

#### CR-2026-10-01-05 — Group rename skips the rules used at create

`recipeGroups.create` requires a trimmed name of 1–60 characters (`convex/recipeGroups.ts`). `recipeGroups.update` stores `updates.name.trim()` with no length check, so a rename can persist an empty name or a name far past 60 characters. `icon` is unbounded on both create and update. Template names are checked for a non-empty trim only (`convex/mealTemplates.ts`).

Apply the same trimmed length check on update. Cap icon and template-name length.

#### CR-2026-10-01-06 — Meal-plan dates are unconstrained strings

`mealPlans.date` is documented as `YYYY-MM-DD` (`convex/schema.ts`) and is only a `v.string()` at the mutation boundary (`convex/mealPlans.ts`, `convex/mealTemplates.ts`). The week UI sends dates from `getWeekDates` (`src/lib/utils.ts`), which are real local calendar days. A direct client can store other strings. Range queries compare those strings, so a non-ISO value sorts in the wrong place and never appears on the week grid. The February audit required an ISO check in the old service layer (AUDIT.md, R5-39). That check did not move to Convex.

Reject dates that are not `YYYY-MM-DD` in `assign`, `setLeftover`, `remove`, `clearDates`, and template apply.

#### CR-2026-10-01-07 — Recipe documents have weaker limits than lists and feedback

Shopping items and feedback fields are length-capped. `recipes.create` and `recipes.update` require a non-empty title and, when a rating is present, an integer from 1 to 5 (`convex/recipes.ts`). Ingredient lines, steps, tags, notes, and `sourceUrl` are not capped beyond Convex’s document size. `sourceUrl` is not required to be an HTTP(S) URL. The recipe screen only renders a source link when the value matches `^https?://` (`src/components/recipe-detail.tsx`), so a `javascript:` value is stored and is not turned into a link.

Cap the same fields the editor already treats as short text, and persist `sourceUrl` only when it is empty or an HTTP(S) URL without credentials.

#### CR-2026-10-01-08 — Public Convex functions omit return validators

Argument validators are present on the public functions that were read. None of the Convex modules declare a `returns` validator. ESLint is the Next.js flat config (`eslint.config.mjs`) and does not load `@convex-dev/eslint-plugin`, so missing returns, `.filter()` on queries, and unbounded `.collect()` are not gated in CI.

`toIssue` and `users.current` set `updatedAt` from `_creationTime` (`convex/lib/shape.ts`, `convex/users.ts`). Status and profile edits do not move that timestamp. The current screens do not display it. Any client that treats `updatedAt` as a modification time will be wrong.

Add `returns` validators on public functions and enable the Convex ESLint rules in CI. Store a real update time, or stop returning `updatedAt` until one exists.

#### CR-2026-10-01-09 — Security docs still describe Supabase

[`AUDIT.md`](../../AUDIT.md) closes 176 findings and states that Supabase row-level security is the database enforcement layer. That stack is gone. `public/sw.js` still says offline data lives in a Zustand snapshot. The ESLint override comment still says test files stub the Supabase client. `next.config.ts` says CSP is set in `middleware.ts`; the nonce CSP is Clerk’s `contentSecurityPolicy` in `src/proxy.ts`.

Treat this report as the current review. Keep `AUDIT.md` as the historical record. A banner at the top of that file points here.

#### CR-2026-10-01-10 — The service worker page cache is shared on the device

`public/sw.js` caches navigations with a network-first strategy and does not vary the cache by user. Sign-out wipes `localStorage` keys that start with `cooksnap` (`src/components/convex-client-provider.tsx`) and does not clear the Cache API. Recipe documents are loaded in the browser from Convex, and offline snapshots are keyed by Clerk user id (`src/lib/convex/use-offline-snapshot.ts`), so today’s recipe data is not what the page cache stores. A later server-rendered page that embeds account data would be reused across accounts on that browser profile until the cache entry is replaced.

Clear `cooksnap-pages-v1` on sign-out, or keep navigations out of the Cache API.

#### CR-2026-10-01-11 — Import idempotency does not require an interpretation

`recipes.create` with an `importId` requires some ingredient text and some instruction text, and it returns the existing row when that id was already used (`convex/recipes.ts`). An interpretation is stored only when the caller sends one that `validateInterpretation` accepts. The official capture path does not have this hole: `interpretCapture` returns a recipe only after `buildSemanticInterpretation` succeeds (`src/lib/recipe-capture-model.ts`), and a failed analysis becomes an error response. A custom client can still mark a hand-written recipe with an import id and skip that check.

When `importId` is set, require a valid interpretation before insert.

## What held up

- Public Convex functions call `requireUser`. Recipe, group, meal, shopping, and checked-ingredient writes load the row and compare `userId`.
- `issueReports.setStatus` is limited to `issueReportMembers`. Non-members receive only their own reports from `list`, which the Convex tests cover.
- Cross-account image attach is rejected, and a rejected attach leaves the other account’s file in place (`convex/images.test.ts`).
- Recipe capture admits work through `imports.reserve`, pins DNS, caps body size, and refuses private addresses on each redirect. The renderer checks Cloudflare’s deny-all guardrail before it loads the page, then fulfills HTTP(S) GETs through the same pinned client with request and byte caps.
- Interpretation stored on a recipe must match the ingredient, instruction, and serving text. Edits that change that text clear the interpretation and the positional check-off rows.
- Account deletion removes Convex data before the Clerk user. A Clerk failure tells the user the data is already gone and that signing in again can retry. A purge failure other than “user not provisioned” does not delete the Clerk user (`src/app/api/account/delete/route.test.ts`).
- The three Route Handlers under `src/app/api` check a Clerk session and a Convex token. The proxy marks `/api(.*)` public so those handlers can return JSON 401s; new API routes need the same check inside the handler.
- Avatar URLs are rendered only when they start with `https://`. Source links use `rel="noopener noreferrer"`. There is no `dangerouslySetInnerHTML` in the TypeScript sources.
- Queries that were read do not call `Date.now()`. The import reserve mutation does, which is the right place for a clock.
- Offline snapshots are per Clerk user. A signed-out or still-loading session does not read or write them. Deleting a recipe strips that id from recipe and shopping snapshots after the server delete succeeds.

## Residual risks

These are recorded so the next pass does not treat them as new defects.

- **Image optimizer allowlist.** `next.config.ts` allows every HTTPS host so scraped images can render before they are copied into Convex storage. `/_next/image` sits outside the Clerk matcher because `_next` is excluded. Once a recipe’s image lives in Convex storage, the wildcard is what still makes the deployment fetch arbitrary HTTPS URLs. Prefer storage URLs and narrow the allowlist.
- **Shared analysis budget.** `imports.reserve` is a public mutation. Each admitted id reserves the fixed ceiling (about $0.098) against the deployment’s $5 monthly budget, including attempts that never call the model. That matches the product cap. It also means a signed-in client can spend the shared budget up to the per-user daily limit without importing a recipe.
- **Account deletion without a fresh sign-in.** The February audit left re-authentication as a product choice (AUDIT.md, R5-26). `POST /api/account/delete` still relies on the current session.
- **Check-then-connect on any helper that is not pinned.** The recipe and renderer paths are pinned. The image path is the remaining user-controlled fetch and is CR-2026-10-01-01.
- **In-memory rate limits from the old scrape route.** Admission now lives in Convex, so it is shared across server instances. The old per-process limiter is gone.

## Suggested order

1. Pin image fetches and share one address policy with recipe capture (CR-2026-10-01-01).
2. Index issue reports by reporter and stop scanning the table from `list` and `purgeUser` (CR-2026-10-01-02).
3. Attribute storage uploads and delete blobs only when nothing references them (CR-2026-10-01-03).
4. Bound import-attempt reads, group names, and meal-plan dates (CR-2026-10-01-04, CR-2026-10-01-05, CR-2026-10-01-06).
5. Add Convex `returns` validators and the Convex ESLint plugin in CI (CR-2026-10-01-08).

## Coverage notes

Reviewed at `03e64b7225f9627d977e6cf784f6208140f42819` on 2026-10-01. The next review can start from the open CR-2026-10-01 items above and from any commit after this revision.
