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
| `NEXT_PUBLIC_CONVEX_URL` | Convex deployment URL |
| `CONVEX_DEPLOYMENT` | Convex deployment identifier |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk public authentication key |
| `CLERK_SECRET_KEY` | Clerk server-side authentication key |
| `CLERK_JWT_ISSUER_DOMAIN` | Clerk JWT issuer domain for Convex authentication |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Sign-in page URL |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Sign-up page URL |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | Default redirect after sign-in |
| `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` | Default redirect after sign-up |
| `CLOUDFLARE_ACCOUNT_ID` | Optional — enables the SPA-rendering scrape fallback |
| `CLOUDFLARE_BR_API_TOKEN` | Optional — Browser Rendering API token |

## Database

Schema lives in `convex/schema.ts` and the functions in `convex/*.ts`, deployed with `bunx convex dev`.

Issue-report inbox access is controlled by the `issueReportMembers` table; add a row via the Convex dashboard or `bunx convex run`.

## Deployment

Deployed on Vercel. CI (typecheck + lint + tests) runs on GitHub Actions for pushes and PRs.
