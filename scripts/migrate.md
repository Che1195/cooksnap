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

If `images.failed` contains errors, fix the cause and re-run. Images are retried
for recipes that have no stored file. In dry run, `images.copied` counts images
that would be copied.

Re-running is safe: rows are keyed by legacyId. Afterwards remove the two
Supabase env vars from the deployment:

    bunx convex env remove SUPABASE_URL
    bunx convex env remove SUPABASE_SERVICE_ROLE_KEY
