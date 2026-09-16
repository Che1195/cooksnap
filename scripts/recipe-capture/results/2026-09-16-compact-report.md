# Compact AI capture and required review — September 16, 2026

**The final live run produced 19/19 reviewable drafts, up from 1/19 before this change.** All 19 preserve their structured candidate facts. Eighteen require editable preview; this is not a claim of 19 unattended imports or complete automatic scaling.

The twentieth original URL still has only its archived HTTP 403 result. It was not bypassed, refetched, or sent to AI.

Subsequent development verification: [signed-in browser report](2026-09-16-browser-verification.md). Three browser cases and one real URL import now pass after fixing native Clerk/Convex server authentication. Raw archive availability is corrected below.

## Product decision and implementation

The user explicitly chose to omit uncertain ingredient highlights and require editable preview. That preference now applies even when normal preview is disabled. Unsupported references cannot reach saved interpretation metadata; malformed response schemas, unsupported recipe facts, and provider failures still reject the import.

For structured sources, AI returns `recipe: null`, quoted ingredient references, and warnings. Application code retains the exact source recipe, resolves UTF-16 positions, parses measurements, and validates the existing version-1 interpretation. Visible extraction additionally returns exact recipe facts; ingredients and instructions must match complete source lines in order. AI still runs on every usable import.

Reference resolution requires literal instruction quotations and supported ingredient ownership. It can remove a limited preparation prefix, such as “chopped,” while retaining a validated literal ingredient span. Unsupported synonyms, ambiguous ownership, unknown indexes, and overlaps are omitted with a review warning. Transport failures never trigger source-only saving.

Deterministic source checks flag marked recipe-card discrepancies: serving ranges/counts, ingredient sections, missing amounts, and differing numbers where ingredient/step wording matches. Canonical text remains unchanged. Measurement parsing now handles additional parenthetical and slash equivalents while preserving fixed package sizes. Incomplete measured or counted amounts trigger warnings before saving and when changing servings, including after persistence.

## Live comparison on identical captured HTML

| Run | Drafts accepted | Timeouts | Other failures | Median analysis | p95 analysis |
| --- | ---: | ---: | ---: | ---: | ---: |
| Original `capture-4-meta` | 1/19 | 10 | 8 | 45.067 s | 45.100 s |
| Intermediate compact, strict references | 6/19 | 1 | 12 | 23.600 s | 45.142 s |
| Final `capture-7-meta`, required review | 19/19 | 0 | 0 | 15.077 s | 25.892 s |

The intermediate run showed that smaller output resolved most output exhaustion, while one unsupported reference still blocked otherwise preserved recipes. The user's review decision resolved that remaining usability problem without accepting unsupported annotations.

Every final capture used one generation. All title, ingredient, instruction, yield, duration, author, and cuisine fields match the archived structured candidate. Of 95 preselected ingredient mentions, 88 match the exact expected owner and boundaries. Independent review found two valid narrower ingredient phrases and five absent mentions, giving semantic coverage of 90/95 for this sample. This is sampled evidence, not exhaustive precision or recall.

Eighteen captures have `needsReview: true`. The Mediterranean lentil soup is the only final capture without review warnings. Existing preview tests confirm flagged drafts cannot auto-save when the user's normal preview setting is off.

Analysis timings use cached HTML and subtract recorded fetch time from the route budget. They are not browser or end-to-end API route latency. The provider, low reasoning setting, 45-second analysis cap, 55-second route budget, token limits, two-generation maximum, and cost reservation remain unchanged.

## Remaining limits

- Some ingredient highlights are intentionally absent. Review is mandatory for unsupported model references.
- Some equivalents and divided instruction amounts remain unscaled. These now warn instead of silently appearing complete. Original-serving text remains exact.
- Structured candidates can omit visible-card details. Detected differences force review; matching the candidate does not establish complete page fidelity.
- Source comparison uses marked HTML and matching wording. It does not reconcile every unit conversion, paraphrase, CSS-hidden element, note, or subrecipe. Model warnings can also include low-value page details.
- Actual rendering/network isolation and signed-in import → preview → detail → cooking → shopping verification remain open. `localhost:3000` was unavailable. No server was started, build run, or deployment performed.

## Validation and review

`bun run typecheck`, `bun run lint`, and **690 tests across 33 files** pass. Whitespace/diff and result JSON checks pass. A full-suite run exposed a timing race in an existing focus test; the test now waits for initial review focus before submitting an incomplete draft. The final full suite passes.

Independent review reproduced and verified fixes for partial numeric extraction, fixed-package scaling, missing source-conflict warnings, and persisted counted-amount warnings. The final scoped review reports no remaining findings. A separate evidence review checks candidate fidelity, sampled references, and the previously observed partial-scaling warnings.

No production browser session or real save was exercised. Component tests cover forced preview and save gating; shared projection tests cover detail/cooking/shopping behavior.

## Evidence and cost

The [final summary](2026-09-16-compact-review-summary.json) records every final outcome. The [intermediate summary](2026-09-16-compact-summary.json) retains failures. The [original publisher report](2026-09-16-publisher-report.md) and source hashes remain unchanged.

Final live usage: 19 generations, all reported; 85,155 input and 39,149 output tokens, estimated **$0.272827**. Final configured generation ceiling: **$1.862**.

This implementation turn also ran four pilot captures and the intermediate 19-page comparison. Across all three stages, reported usage totals approximately **$0.7780**; one intermediate generation has unknown usage, so this is not total spend. Combined configured generation ceilings total **$4.116**. Offline replays and review made no API calls. Only the selected CookSnap Meta key was used; evaluation usage remains outside the production admission ledger.

Artifact availability correction, September 16: the subsequent Playwright setup cleared its default `test-results/` output directory. The original publisher baseline and two source audits were restored from separate temporary copies. Intermediate, pilot, and final compact model answers, projections, and final audits could not be recovered. The public summaries and original source hashes remain intact, but those compact raw payloads are unavailable for reinspection. Playwright now writes only to `test-results/playwright/` to protect evaluation archives. No replacement generations were presented as the original evidence.

## Attribution

| Contributor | Model and reasoning | Work |
| --- | --- | --- |
| Main | Runtime model unknown; reasoning unset | Provider contract, integration, evaluations, report |
| Source worker | Explicit `gpt-6-astra`, medium reasoning; runtime unexposed | Source conflict checks and evidence audit |
| Measurement worker | Explicit `gpt-6-astra`, medium reasoning; runtime unexposed | Semantic resolver, quantities, persisted warnings |
| Independent reviewer | Explicit `gpt-6-astra`, medium reasoning; runtime unexposed | Concrete reproductions and scoped rechecks |
| Recipe inference | Requested `muse-spark-1.3`, low reasoning | Live recipe interpretation |

No descendants, model escalations, or provider fallbacks. Reviews provide independent context, not model-family independence.
