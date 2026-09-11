# CookSnap Convex cutover checklist

Branch `convex-migration` is code-complete and reviewed. Everything below is
an account-side or production action for Che to run, in order. Each step
names the evidence that it worked.

## Before cutover (dev deployment)

- [ ] Sign up on the dev app (`bun run dev`, http://localhost:3000) with
      `abeche88@gmail.com`; optionally have the second household member sign
      up with `jessicag.vsp@gmail.com`. Evidence: `bunx convex data users`
      shows the rows.
- [ ] Run the migration on dev per `scripts/migrate.md`:
      `bunx convex run migration:run '{"apply": true, "skipUnmatched": true}'`.
      Evidence: `recipes.written` 91 (or 72 if only one account exists),
      `images.copied` 90, `images.failed` empty. Run it a second time:
      every `written` count unchanged, `images.copied` 0.
- [ ] Manual pass on dev: recipes list shows migrated recipes with images
      served from `*.convex.cloud`; paste a recipe URL; assign to a day;
      generate the shopping list; toggle an item; cook mode; create a group;
      file an issue; edit display name. Every action reflects without a
      reload.
- [ ] Create a throwaway Clerk dev-instance user (Clerk dashboard → Users →
      Create) and run `E2E_CLERK_USER_EMAIL=<that email> bun run test:e2e`.
      Evidence: setup and core loop both pass.
- [ ] Remove the Supabase secrets from the dev deployment once the dev
      migration is done: `bunx convex env remove SUPABASE_URL` and
      `bunx convex env remove SUPABASE_SERVICE_ROLE_KEY`.

## Production

- [ ] Clerk: press "Go to prod" on the CookSnap application; enable
      email/password and Google with your own Google OAuth credentials; set
      the production domain; activate the Convex integration on the
      production instance; copy the production publishable key, secret key,
      and Frontend API URL.
- [ ] Convex: `bunx convex deploy` from the branch creates the production
      deployment. Then `bunx convex env set CLERK_JWT_ISSUER_DOMAIN
      <production Frontend API URL> --prod`.
- [ ] Vercel environment: set `NEXT_PUBLIC_CONVEX_URL` (prod deployment
      URL), `CONVEX_DEPLOY_KEY` (Settings → Deploy keys, production),
      `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and the four
      `NEXT_PUBLIC_CLERK_*_URL` values from `.env.local`. Delete every
      `SUPABASE_*` variable. Set the build command to
      `bunx convex deploy --cmd 'bun run build'` so functions deploy with
      each build.
- [ ] Both users sign up on the production app URL (a Vercel preview of the
      branch pointed at the prod Convex deployment is fine) with the same
      emails as Supabase.
- [ ] Production migration: `bunx convex env set SUPABASE_URL ... --prod`,
      `bunx convex env set SUPABASE_SERVICE_ROLE_KEY ... --prod`, dry run
      with `--prod` (expect users linked 2, recipes 91, images.copied 90),
      then apply, then a second apply to confirm nothing changes. Remove the
      two Supabase variables from the prod deployment afterwards.
- [ ] Merge `convex-migration` into `main` and let Vercel deploy.
- [ ] Spot-check production: recipes list, one meal-plan week, shopping
      list, cook mode, profile.

## After two weeks

- [ ] Delete the Supabase project `hbxafgtdxnfrkgtpyzii` from the
      Supabase dashboard.
- [ ] Delete the `supabase/` directory from the repo and remove the
      `SUPABASE_*` lines from `.env.local`.

## Rollback (inside the two-week window)

Redeploy the previous Vercel deployment and restore the Supabase project
from its dashboard. Data written to Convex during the window is not copied
back.
