# CookSnap

A mobile-first PWA for managing recipes, planning meals, and building shopping lists. Paste a recipe URL and CookSnap scrapes it (JSON-LD, microdata, Open Graph, DOM heuristics, with a Cloudflare Browser Rendering fallback for JavaScript-only sites), files it into your recipe book, and feeds your weekly meal plan and consolidated shopping list.

## Features

- **Recipe scraping** — paste a URL, get structured ingredients/instructions/times/servings; supports ingredient group headers and SPA sites
- **Recipe book** — tags, groups, favorites, ratings, serving scaling, notes
- **Meal planner** — weekly view, multiple recipes per slot, leftovers tracking, reusable week templates
- **Shopping list** — generated from the week's plan with quantities summed and units converted; separate free-form grocery list; category grouping
- **Cooking mode** — step-by-step view with progress that survives page refreshes
- **Issue inbox** — in-app bug reports shared with household members

## Stack

Next.js (App Router) · React · TypeScript · Tailwind CSS 4 · shadcn/ui · Zustand · Supabase (auth + Postgres with RLS) · Zod · Vitest

## Development

```bash
npm install
npm run dev        # assumes Supabase env vars are set, see below
```

Checks:

```bash
npm run typecheck
npm run lint
npm test          # vitest unit/integration suite
npm run test:e2e  # Playwright core-loop smoke test (see below)
```

The E2E smoke test needs a running app (auto-starts `npm run dev` if :3000 is free) and a **disposable** test account via `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` — it writes real recipes/meal plans. Without those env vars the spec self-skips.

## Offline

The app works offline in the ways that matter for cooking and shopping: the store snapshot is cached in `localStorage` (instant cold start, stale-while-revalidate), a service worker (`public/sw.js`, production only) caches the app shell and pages, and shopping/grocery checkbox toggles made offline are queued and replayed automatically when the connection returns.

## Environment

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side operations (account deletion) |
| `CLOUDFLARE_ACCOUNT_ID` | Optional — enables the SPA-rendering scrape fallback |
| `CLOUDFLARE_BR_API_TOKEN` | Optional — Browser Rendering API token |

## Database

Schema lives in `supabase/schema.sql` (full fresh-install DDL) and `supabase/migrations/` (incremental changes). Every schema change must be committed as a migration — the `grocery_items` drift incident is the cautionary tale.

Issue-report inbox access is controlled by the `issue_report_members` table; add household members by inserting their profile id (see `supabase/migrations/20260707000000_issue_reports_access.sql`).

## Deployment

Deployed on Vercel. CI (typecheck + lint + tests) runs on GitHub Actions for pushes and PRs.
