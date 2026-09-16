# Feedback and recipe deletion

Tracking: https://github.com/Che1195/cooksnap/issues/8

## Intent and decisions

Users can report issues or request features without leaving their current screen. Reuse the existing private Convex report inbox and staff permissions. A labeled Feedback action opens a compact accessible dialog in app headers. Collect one description and an explicit issue/feature category. Store only the pathname as automatic page context. Show pending, recoverable error, and confirmed receipt states. Preserve legacy issue reports.

Deleting a recipe removes its derived state atomically. This includes meal assignments, grocery rows, ingredient checks, group memberships, stored images, and entries within saved meal templates. Preserve template containers, unrelated slots, manual groceries, other recipes, and other users.

Groceries aggregate within each recipe. Keep rows from different recipes separate, because the existing cross-recipe aggregate retains only the first source ID. Direct additions also retain recipe ownership. This can show the same ingredient in multiple rows but allows exact deletion without losing another recipe's groceries. Reject stale source IDs on creation and undo. Previously detached items and lost legacy contributions cannot be safely reconstructed from text.

## Exclusions

No external email or issue-service delivery, attachments, voting, or new dev server. Production release and its required build were subsequently authorized by the user. Do not remove manual groceries by matching ingredient names. Do not retroactively guess lost provenance.

## Acceptance and evidence

1. Visible feedback access on signed-in screens; issue and feature submissions persist and appear with correct categories. Legacy reports show as issues.
2. Keyboard-accessible dialog, labels, focus return, mobile fit, draft preservation after errors, duplicate-submit protection, and receipt with inbox access.
3. Reporter isolation and staff-only status changes remain enforced by the server.
4. Schedule → generate groceries → delete removes recipe-derived state and preserves independent state. Equal ingredients from two recipes and a manual row remain independently owned.
5. Bun typecheck, lint, relevant regression tests, existing-server runtime verification, independent review, and fresh audit. Blocked checks stay explicitly unverified.

## Gauntlet ownership and bounds

Feedback worker owns feedback UI/backend; deletion worker owns cleanup/provenance. Main owns integration, browser evidence, and this document. Fresh critic reviews current artifacts without worker transcripts. Use at most three review rounds plus one final auditor who did no earlier work. First review uses gpt-6-astra high; workers, later reviews, and audit use gpt-6-astra medium. Stop after the first round with no high findings; record lower findings. Review is independent context within one model family.

## Status

Implementation and development verification are complete. The user authorized production release on September 16, 2026. Release through a dedicated pull request, GitHub CI, and the existing Vercel build that deploys Convex before the frontend.

## Verification evidence

- Root `bun run typecheck` and `bun run lint`: pass.
- Convex `bunx tsc --noEmit -p convex/tsconfig.json`: pass. First sync exposed shared path-alias errors; relative type imports fixed them. Development sync then passed with typecheck enabled.
- Full `bun run test`: 727 passed, one unrelated Cloudflare live-renderer test skipped. Initial full run exposed an invalid legacy-template fixture using the newly guarded save API; the fixture now seeds historical data directly and still tests safe application.
- Real Clerk/Convex browser run: two setup tests and two application tests passed. Capture response alone is mocked for deterministic recipe creation. Schedule → generate groceries → check item → delete recipe verifies both grocery rows and meal assignment disappear.
- Feedback browser test submits both categories, verifies receipts, follows the inbox link, reloads persisted reports, and verifies keyboard opening/Escape/focus return.
- A scoped feedback rerun passed after fixing long reporter-email wrapping. Header presence and document overflow checks pass at 320px across home, recipes, meal plan, shopping list, cook, profile, and feedback.
- Main visually inspected mobile receipts, inbox, narrow inbox, and desktop dialog. Screenshots: `test-results/feedback-verification/{mobile-receipt,mobile-inbox,narrow-inbox,desktop-form}.png` (gitignored).
- Two owned disposable development accounts were removed through the authenticated account-deletion endpoint. Four clearly labeled automated feedback records remain anonymized under the app's existing report-retention policy. Temporary authentication storage was removed.

## Review ledger

Round 1 critic: gpt-6-astra, high, explicit assignment. Feedback, deletion, and integration PASS. One MEDIUM finding R1-DEL-01 identified stale recipe snapshots; fixed recipe and shopping cache cleanup, added regression coverage, and independently rechecked. No open round-one findings. The critic independently ran 48 focused tests, 10 targeted rechecks, and Convex typecheck. The main visual pass also fixed long-email card overflow and verified the final screenshots. Final fresh audit: **AUDIT: PASS**, gpt-6-astra at medium reasoning. The auditor independently ran 49 focused tests across eight files, checked the diff, inspected all four final screenshots and both E2E definitions, and found no actionable issues. Authenticated E2E, full-suite, typecheck, and lint results remain main-agent evidence. Review and audit used fresh contexts within the same model family.

## Known limits

Historical rows whose recipe links were removed cannot be safely identified. Old cross-recipe aggregates also lost exact contribution history. New rows preserve provenance. A disconnected second device may show its last offline snapshot until it reconnects. Browser evidence covers Chromium and the stated viewports, not every browser or assistive technology. The remote live renderer is outside this change and remains unverified. Convex reported existing Free-plan limits during successful development sync; no billing changes were made.


## Handoff

Requested implementation and development verification are complete. Issue #8 tracks the authorized production release. Preserve the pre-existing untracked `.claude/` directory outside the release. Record merge, CI, backend deployment, and frontend readiness in the tracking issue.

## Model attribution

| Contributor | Model and reasoning | Work |
| --- | --- | --- |
| Main | GPT-6; exact variant unexposed, reasoning unset | Specification, design decisions, integration, local cleanup, E2E, visual inspection, final checks |
| Feedback worker | gpt-6-astra, medium, explicitly requested | Feedback frontend/backend and focused tests |
| Deletion worker | gpt-6-astra, medium, explicitly requested | Cascade, grocery provenance, regression tests and integration fixes |
| Critic | gpt-6-astra, high, explicitly requested | Independent review and cache-fix verification |
| Auditor | gpt-6-astra, medium, explicitly requested | Fresh final audit |

Agent runtime model identities were not separately exposed. No descendants, fallbacks, or model changes.
