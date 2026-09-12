# Handoff: CookSnap Supabase → Convex + Clerk migration

Written 2026-09-12 for a fresh session. Read this first, then the spec and
checklist it links. Nothing in this file needs the old conversation.

> **Update 2026-09-12, later session:** Che decided not to buy a domain, so the
> Clerk development instance stays in production and steps 1 and 3 below are
> replaced. The live runbook is Linear CHE-92 and the "Production" section of
> the cutover checklist. Convex prod deployment: `amiable-llama-661`.

## State in one paragraph

Branch `convex-migration` (33 commits, HEAD 0245e32) is code-complete,
reviewed, and pushed as [PR #4](https://github.com/Che1195/cooksnap/pull/4)
against `main`; all CI checks pass and GitHub reports it mergeable. The dev
Convex deployment (`fastidious-hummingbird-755`) holds Che's migrated data
(19 recipes with images, 3 meal plans, 1 group) and every core flow has been
verified by hand in Chrome and by the live Playwright suite. **Do not merge
yet:** Vercel deploys `main` automatically and its environment still has
only Supabase variables, so merging first would break production. The
production cutover is blocked on Che's accounts (Clerk production instance,
Vercel env), not on code.

## Files that carry the record

| What | Where |
|---|---|
| Spec (binding) | `docs/superpowers/specs/2026-09-11-convex-migration-design.md` |
| Plan (14 tasks, all done) | `docs/superpowers/plans/2026-09-11-convex-migration.md` |
| Cutover checklist (the to-do list now) | `docs/superpowers/plans/2026-09-11-convex-cutover-checklist.md` |
| Migration runbook | `scripts/migrate.md` |
| Ledger of every ruling and review (gitignored) | `.superpowers/sdd/2026-09-11-convex-migration/progress.md` |
| Review reports (gitignored) | `.superpowers/sdd/2026-09-11-convex-migration/*.md`, `astra/` |
| Supabase export snapshot (session scratch, may be gone) | `/private/tmp/claude-501/.../scratchpad/supabase-export-2026-09-11/` |

Linear (team Chedev, project "CookSnap: Supabase → Convex + Clerk"):
CHE-46 … CHE-59 are the plan tasks, all Done. CHE-85 … CHE-91 are
follow-ups from the reviews (backlog, none block merge).

## Accounts and identifiers

- Clerk application `CookSnap`, app id `app_3JBcrn7GNWyFJ8rVdCbWFcU2RZt`,
  development instance `ins_3JBcrndXAFyIxmRNhZSA7OM1WVL`, issuer
  `https://busy-mule-7049.clerk.accounts.dev`. Keys are in `.env.local`
  (gitignored). No production instance exists yet.
- Convex project `cooksnap` (team `che-ndumbi`), dev deployment
  `fastidious-hummingbird-755`. `CLERK_JWT_ISSUER_DOMAIN` is set on it; the
  Supabase secrets were removed after the dev migration. No production
  deployment exists yet.
- Supabase project `hbxafgtdxnfrkgtpyzii` (free tier, pauses after ~7 days
  idle). Restored on 2026-09-11; it is the source for the production
  migration and the rollback for two weeks after cutover. Service role key
  is in `.env.local`.
- Users: `abeche88@gmail.com` (Che, 19 recipes) and
  `jessicag.vsp@gmail.com` (Jessica, 72 recipes). Only Che has a Clerk dev
  account so far; Jessica's rows migrate when she signs up on production.

## Gotchas learned the hard way

1. **Clerk's Convex integration only adds the `aud` claim.** Convex reads
   `email`, `name`, `picture` from the session token; without them
   `users.ensure` stores an empty email and the migration links nothing.
   Fix: Clerk → Configure → Sessions → Customize session token:
   `{"email": "{{user.primary_email_address}}", "name": "{{user.full_name}}",
   "picture": "{{user.image_url}}"}`. Done on dev; **must be repeated on the
   production instance**. The classifier blocks Claude from saving this
   setting, so Che does it.
2. Claude cannot create accounts (Clerk sign-up, Clerk test users) or enter
   secrets into Vercel; those steps are Che's. The live Playwright run used
   Che's own account with `E2E_CLERK_USER_EMAIL=abeche88@gmail.com`.
3. The app creates a default "Favorites" group on first sign-in; the
   migration adopts it (`upsertGroup`) and dedupes strays
   (`groups.dedupedDefaults` in the summary). Already handled.
4. `bun` only; `bun.lock` is the lockfile. CI runs on `oven-sh/setup-bun`.
5. Codex lane (gpt-6-astra) runs in a no-network sandbox that cannot write
   `.git`: `bunx convex codegen`, `bunx convex dev --once`, and commits are
   the wrapper's steps, not Codex's.
6. `.next` from an older Next build deadlocks `next dev` at "Starting…";
   delete `.next` if that happens.
7. The Browser pane and some Chrome extensions cause false hydration
   warnings; confirm with headless Playwright before chasing them.

## Exact remaining steps

1. **Che:** Clerk "Go to prod" on the CookSnap app (needs own Google OAuth
   credentials and the production domain); on the production instance add
   the session-token claims from gotcha 1 and activate the Convex
   integration; note the production Frontend API URL, publishable key, and
   secret key.
2. **Claude:** with that URL:
   `bunx convex deploy` (creates the prod deployment and pushes functions),
   `bunx convex env set CLERK_JWT_ISSUER_DOMAIN <prod URL> --prod`,
   `bunx convex env set SUPABASE_URL https://hbxafgtdxnfrkgtpyzii.supabase.co --prod`,
   `bunx convex env set SUPABASE_SERVICE_ROLE_KEY "$(grep -o 'SUPABASE_SERVICE_ROLE_KEY=[^ ]*' .env.local | cut -d= -f2)" --prod`.
3. **Che:** Vercel project env: set `NEXT_PUBLIC_CONVEX_URL` (prod URL),
   `CONVEX_DEPLOY_KEY` (Convex dashboard → Settings → Deploy keys, prod),
   `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`,
   `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/signup`,
   `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/`,
   `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/`; delete every
   `SUPABASE_*`; build command `bunx convex deploy --cmd 'bun run build'`.
4. **Che and Jessica:** sign up on the production app URL (a Vercel preview
   of the branch pointed at prod Convex is fine) with the same emails.
5. **Claude:** production migration:
   `bunx convex run migration:run '{"apply": false, "skipUnmatched": false}' --prod`
   (expect users linked 2, recipes 91, images would-copy 90), then
   `... '{"apply": true, "skipUnmatched": false}' --prod`, then apply again
   (expect no changes), then `bunx convex env remove SUPABASE_URL --prod`
   and `... SUPABASE_SERVICE_ROLE_KEY --prod`.
6. **Claude, with Che's go-ahead:** merge PR #4; Vercel deploys. Spot-check
   recipes, one meal-plan week, shopping list, cook mode, profile on prod.
7. **Two weeks later, Che:** delete the Supabase project, then remove the
   `supabase/` directory and `SUPABASE_*` lines from `.env.local`.
8. After merge: `rm -rf .superpowers/sdd/2026-09-11-convex-migration`
   (git history is the record).

Rollback inside the window: redeploy the previous Vercel deployment and
restore the Supabase project; Convex writes made meanwhile are not copied
back.

## Optional follow-ups (separate scope)

CHE-85 image update as its own mutation; CHE-86 default group in
`users.ensure`; CHE-87 index/schema tidy-ups; CHE-88 migration dry-run
accuracy; CHE-89 test coverage gaps; CHE-90 docs drift; CHE-91 shopping
merge edge case. Each is self-contained in Linear.

## Model routing used

fable-5.1 orchestrated and ruled; opus-5 implemented the user-facing tasks
and reviewed every task; gpt-6-astra (Codex, read-only or workspace-write)
implemented the routine backend tasks, gave the independent whole-branch
review, and the fresh-session audit. Per-task attribution is in the Linear
issues and the ledger.
