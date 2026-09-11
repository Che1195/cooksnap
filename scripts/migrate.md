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
