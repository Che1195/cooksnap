# Signed-in capture verification — September 16, 2026

The development browser flow passes. One real publisher import exposed and verified a fix for server authentication with Clerk’s native Convex integration. No production deployment, build, commit, or push occurred.

## Runtime findings and fix

Clerk’s development instance has no legacy JWT templates. Its native session token already has `aud: convex`. Client-side Convex operations worked, but the capture route requested the missing `convex` JWT template and returned HTTP 500 before admission or AI analysis. The exact template request returned HTTP 404 `resource_not_found`.

The shared server token helper now matches the installed Convex Clerk adapter: use the session token when its audience is `convex`; otherwise request the legacy template. Capture reuses its authenticated session. Account deletion and image persistence also benefit through the shared helper. Unexpected capture failures record stage and error type without raw error messages, source text, or credentials.

## Evidence

- Clerk testing setup: 2 tests passed. Three Chromium browser cases passed in 1.2 minutes against real Clerk and Convex, mocking only capture responses.
- Preview preference persists across reload and a separate browser context. Normal preview supports cancellation. Flagged capture requires review despite opt-out and creates no recipe before Save. Edited quantities survive saving and reload. Clean capture auto-saves with preview disabled.
- Unchanged interpretation preserves original quantities after reload. Four-serving quantities match detail, cooking, and the saved shopping list. Cooking servings survive reload; reset restores original quantities after another reload. Partial-equivalent warnings remain visible while scaling.
- Real, unmocked import of Budget Bytes Mediterranean Lentil Soup: HTTP 200, 10.910 seconds browser request duration, 10.183 seconds application duration, 13 ingredients, five steps, validated interpretation, no warnings. A renamed draft saved and survived reload. Main visually inspected preview and detail screenshots at a 390 × 844 viewport, including rendered ingredient highlights.
- Typecheck and full lint pass. 56 relevant tests across five files pass: server tokens, capture route, account deletion route, image persistence route, and Convex user cleanup. Independent scoped authentication review found no actionable issues. This turn did not rerun the entire previous 690-test suite.

The new browser tests initially failed on test timing: immediate controlled-checkbox assertions raced Convex persistence; immediate reload interrupted Next.js navigation. Tests now await saved state and detail navigation. These failures did not require product UI changes.

## Development operations and cleanup

The user explicitly authorized starting the local server, syncing the existing development backend, and creating/deleting a temporary test account. `convex dev --once --typecheck enable --codegen disable --tail-logs disable` succeeded against `fastidious-hummingbird-755`. Convex reported that the workspace exceeds Free-plan limits; no plan or billing change was made.

The temporary Clerk account used a reserved test email and ownership metadata. Cleanup verified ownership, called the authenticated account-deletion endpoint successfully, confirmed the Convex profile was absent, and confirmed Clerk returned 404 for that exact account. The endpoint purges owned recipe, shopping, and import-attempt data; its cascade has regression tests. The temporary browser authentication file was removed. The development admission budget retains its intentional nonrefundable $0.098 reservation.

The local development server remains running at http://localhost:3000. No production data or credentials were changed.

## Live usage and limits

One Meta generation: requested `muse-spark-1.3`, low reasoning, prompt `capture-7-meta`; 5,265 input tokens and 1,575 output tokens; application estimate **$0.013275**. Only the selected CookSnap Meta key was loaded. Earlier failed live requests stopped at authentication, before admission or AI. The per-import configured ceiling remains $0.098.

This proves a direct structured-page import through the real application. Actual remote rendering and renderer network isolation remain unverified. Full keyboard completion and actual browser 200% zoom remain unverified. Mobile screenshots establish visual inspection at the stated viewport, not an exhaustive accessibility audit. Existing partial-scaling and source-reconciliation limits remain documented in the compact report.

## Artifact retention correction

The first Playwright setup cleared its old default `test-results/` output directory. The original publisher baseline and two source audits were recovered from separate temporary copies. Compact pilot/intermediate/final answers, projections, and final audit payloads were not recovered. Public evaluation summaries remain; historical results must not be described as having fully inspectable raw archives.

Playwright now clears only `test-results/playwright/`. New mobile screenshots, live summary, and cleanup confirmation are in gitignored `test-results/browser-verification/2026-09-16/`. No authentication storage or API keys are included.

## Models used

| Contributor | Model and reasoning | Work |
| --- | --- | --- |
| Main | Runtime model unknown; reasoning unset | Runtime verification, authentication fix, regression tests, visual inspection, cleanup, evidence |
| Browser worker | Explicitly assigned `gpt-6-astra`, medium; runtime unexposed | Browser test implementation and timing fixes |
| Authentication reviewer | Explicitly assigned `gpt-6-astra`, medium; runtime unexposed | Independent source and installed-SDK review |
| Recipe inference | Requested `muse-spark-1.3`, low | One live recipe interpretation |

No descendants or model fallbacks. Review used separate context, not a different model family.
