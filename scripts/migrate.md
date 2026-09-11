# Migrating Supabase data into Convex

Prerequisites: every Supabase user has signed up in Clerk with the same email
(dev instance for the dev deployment, prod instance for prod). The Convex
deployment has SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set.

Set up the dev deployment:

    bunx convex env set SUPABASE_URL ...
    bunx convex env set SUPABASE_SERVICE_ROLE_KEY ...
    bunx convex dev --once

Dry run (reads everything, writes nothing, prints counts and unmatched users):

    bunx convex run migration:run '{"apply": false, "skipUnmatched": false}'

Apply:

    bunx convex run migration:run '{"apply": true, "skipUnmatched": false}'

Production:

    bunx convex env set SUPABASE_URL ... --prod
    bunx convex env set SUPABASE_SERVICE_ROLE_KEY ... --prod
    bunx convex run migration:run '{"apply": true, "skipUnmatched": false}' --prod

The summary reports `read`/`written` for `users` (as `read`/`linked`, plus
`unmatched` emails), `recipes`, `groups`, `groupMembers`, `mealPlans`,
`templates`, `issueMembers`, `shoppingItems`, `groceryItems`,
`checkedIngredients` and `issueReports`, plus `images` as `copied`/`failed`.

If `images.failed` contains errors, fix the cause and re-run. Images are retried
for recipes that have no stored file. In dry run, `images.copied` counts images
that would be copied.

Re-running is safe. Recipes, groups, group members, meal plans, templates,
issue members and issue reports are keyed by legacyId and are upserted. Shopping
items, grocery items and checked ingredients have no such key, so they are
imported per user, all at once: the first run imports a user's rows and later
runs see rows already there and leave them alone. Their `written` count is
therefore the number of rows inserted in apply mode (0 on a re-run) and the
number of eligible rows in a dry run. A user whose list rows need re-importing
must have that table emptied for them first.

User display names come from the Supabase `profiles` table and overwrite the
name Clerk supplied.

Afterwards remove the two Supabase env vars from the deployment:

    bunx convex env remove SUPABASE_URL
    bunx convex env remove SUPABASE_SERVICE_ROLE_KEY
