# CookSnap

A mobile-first PWA for managing recipes, planning meals, and building shopping lists. Paste a recipe URL and CookSnap extracts its source recipe, runs AI interpretation, and offers an editable preview. Saved recipes feed your meal plan, cooking view, and shopping list. JavaScript-only pages use an isolated Cloudflare rendering session.

## Features

- **AI recipe capture** — paste a URL, review an editable recipe, then save; every usable import runs through source-grounded AI interpretation
- **Import preference** — enable or disable the preview in Profile → Recipe imports; the setting syncs across devices, and incomplete recipes or flagged details still need review
- **Recipe book** — tags, groups, favorites, ratings, serving scaling, notes
- **Meal planner** — weekly view, multiple recipes per slot, leftovers tracking, reusable week templates
- **Shopping list** — generated from the week's plan with quantities summed and units converted; separate free-form grocery list; category grouping
- **Cooking mode** — step-by-step view with progress that survives page refreshes
- **Issue inbox** — in-app bug reports shared with household members

## Stack

Next.js (App Router) · React · TypeScript · Tailwind CSS 4 · shadcn/ui · Zustand · Convex (database + file storage) · Clerk (auth) · Zod · Vitest

## Development

```bash
bun install
bun run dev        # needs the Convex and Clerk env vars below
```

Checks:

```bash
bun run typecheck
bun run lint
bun run test      # vitest unit/integration suite
bun run test:e2e  # Playwright core-loop smoke test (see below)
```

Browser tests need a running app, Clerk keys in `.env.local`, and a **disposable** Clerk development user named by `E2E_CLERK_USER_EMAIL`. They write real recipes and preferences. Set `PLAYWRIGHT_BASE_URL` to the existing server and run with `--workers=1` because preferences are account-wide. Without the email, authenticated tests skip. The accessibility tests use a temporary Chromium profile and test-only extension to verify native 200% browser zoom. Delete the disposable account through the app afterward to remove any remaining fixtures. Playwright clears only `test-results/playwright/`; keep evaluation archives outside that subdirectory.

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
| `META_API_KEY` | Server-only Meta Model API key for recipe interpretation; never use a `NEXT_PUBLIC_` prefix |

Recipe capture uses `muse-spark-1.3` (standard tier) with bounded input/output and a shared Convex generation budget. The initial budget reserves at most $5/month across this deployment, plus limits of 20 imports per user/day and 3/minute. Each admitted import reserves $0.098 for at most two attempts at 12,000 input and 8,000 output tokens each, including reasoning. Failed attempts consume conservative reservations. This cap excludes rendering, hosting, Convex, and other applications using the same provider key.

The Meta key belongs in `.env.local` for local development and in the Vercel server environment for deployment. Deploy the updated Convex functions/schema before using the new client. Without the key, capture returns a configuration error and never silently saves an unanalyzed recipe.

Original recipe text remains authoritative. Interpretation stores ingredient references and scalable amount spans separately. Serving changes use deterministic arithmetic; they preserve package sizes, times, temperatures, and relative amounts. Metric/US conversion is deferred. Older recipes and version-1 backups remain supported without automatic AI calls.

See [recipe capture evaluation](scripts/recipe-capture/README.md) for the bounded evaluation runner and release evidence. Mocked tests do not establish live provider quality or compatibility.

The renderer uses Cloudflare CDP sessions with a deny-all HTTP(S) policy, verified before loading source content. CookSnap fetches allowed GET resources through its DNS-pinned transport, including every redirect, and fulfills them into the browser. Limits are 50 requests, 5 MB per response, 15 MB total, and a 15-second rendering deadline with bounded cleanup. WebSockets, service workers, frames, media, and alternative transport APIs are restricted. Sites requiring authentication, POST requests, or these restricted features may fail. This is HTTP(S) isolation, not a guarantee about arbitrary browser protocols or browser vulnerabilities.

An explicit live renderer check uses real Cloudflare execution with controlled fixture resources. It is skipped by ordinary tests and consumes provider resources:

```bash
RUN_RENDERER_LIVE=1 bun run test src/lib/cloudflare-render.live.test.ts
```

## Database

Schema lives in `convex/schema.ts` and the functions in `convex/*.ts`, deployed with `bunx convex dev`.

Issue-report inbox access is controlled by the `issueReportMembers` table; add a row via the Convex dashboard or `bunx convex run`.

## Deployment

Deployed on Vercel. CI (typecheck + lint + tests) runs on GitHub Actions for pushes and PRs.
