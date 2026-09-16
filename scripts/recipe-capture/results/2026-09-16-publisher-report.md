# Real publisher evaluation — September 16, 2026

**Release blocked: only 1 of 19 analyzable publisher pages produced a valid AI capture.** Ten timed out; eight failed output or annotation validation. One additional page returned HTTP 403 and was not analyzed.

This supersedes the small synthetic regression sample as evidence of practical import reliability. Production behavior was not changed during this evaluation.

## Scope and method

The [manifest](../publishers.json) contains 20 verified URLs across ten publishers. The [capture metadata](2026-09-16-publisher-captures.json) records timestamps, HTTP status, hashes, extraction method, and source size. The [machine-readable summary](2026-09-16-publisher-summary.json) records every outcome.

The new `evaluate-publishers.ts` runner fetched pages through the protected direct transport and retained exact HTML locally. Nineteen captures had usable structured candidates. Simply Recipes banana bread returned HTTP 403; no access control was bypassed. No actual browser rendering was invoked.

Two independent reviewers inspected separate ten-page groups before comparing model output. They checked JSON-LD, visible recipe cards, and five unambiguous ingredient mentions per accessible page. All 19 HTML hashes were verified. These 95 sampled mentions are not exhaustive precision or recall ground truth.

Each eligible page ran through the existing `interpretCapture` implementation with `muse-spark-1.3`, low reasoning, and prompt `capture-4-meta`. The runner deducted recorded fetch duration from the 55-second route budget and retained the existing 45-second analysis cap. Two processes ran concurrently. Captures were cached; these are analysis timings, not measured end-to-end API route latency.

## Results

| Outcome | Count | Evidence |
| --- | ---: | --- |
| Accepted | 1 | BBC Good Food pancakes; 44.038 seconds, two generations |
| Analysis timeout | 10 | Approximately 45 seconds; final answer and usage unavailable |
| Output limit reached without usable final answer | 3 | Both King Arthur recipes and Simply Recipes guacamole each reported 8,000 output tokens |
| Annotation validation failure | 5 | Ham/lentil soup, BBC banana loaf, quinoa salad, hummus, vegan banana bread |
| Source unavailable | 1 | Simply Recipes banana bread, HTTP 403; no AI call |

Across 19 analysis attempts, median latency was 45.067 seconds and p95 was 45.100 seconds. Abort/read overhead accounts for small excesses above the cap.

All five completed-but-rejected recipes preserved their structured candidate facts. Their annotations failed for different reasons:

- Ham/lentil soup: literal quantity spans inside descriptive parentheses exceeded the deterministic validator's supported grammar.
- BBC banana loaf: expanded aliases conflicted with the narrower ingredient identities expected by validation.
- Quinoa salad: ten incorrect instruction reference offsets and one incorrect ingredient quantity offset.
- Hummus: an unsupported synonym, despite valid literal spans elsewhere.
- Vegan banana bread: a wrong ingredient reference span, unsupported aliases, and malformed range/mixed-fraction annotations.

The three output-limited responses had no usable final answer. Guacamole explicitly reported `incomplete`; earlier King Arthur observations did not capture response status. Their token count supports output exhaustion, but their exact provider completion reason is unavailable.

BBC pancakes preserved candidate title, ingredient list, instructions, and metadata. All five sampled mentions had the correct ingredient owner. Four matched exact reference boundaries; the fifth validly included an adjective. Delivered sampled coverage was 5/95 across all eligible pages, counting failed imports as zero. Accepted-only coverage was 5/5. Neither metric establishes exhaustive precision or recall. Half/original/double projections were saved for this one accepted recipe; app rendering and downstream flows were not exercised.

## Structured data is not complete source truth

Independent visible-card inspection exposed differences that a candidate equality check alone cannot detect:

| Source | Difference |
| --- | --- |
| [King Arthur soft cookies](https://www.kingarthurbaking.com/recipes/soft-chocolate-chip-cookies-recipe) | Yield and baking-time ranges collapse to single endpoints in the candidate. |
| [Sally's cinnamon rolls](https://sallysbakingaddiction.com/2013/05/08/easy-cinnamon-rolls-from-scratch/) | Dough, filling, and icing sections disappear, weakening duplicate-ingredient ownership. |
| [Serious Eats Bolognese](https://www.seriouseats.com/the-best-slow-cooked-bolognese-sauce-recipe) | The visible pasta quantity is absent from the structured candidate; the serving range and serving section also lose information. |
| Other inspected cards | Some serving ranges, ingredient descriptors, preparation notes, and an optional oats topping subrecipe are absent or reduced in candidates. |

Some missing candidate details remain in the selected source's visible text. This is a conflict between source representations, not proof that the complete model input lacks them. No affected recipe was accepted, so this evaluation does not show these differences reaching saved recipes.

## Recommended next implementation

Reduce the provider response to source-supported semantic decisions. Avoid requiring the model to repeat canonical recipe text and calculate every character offset and quantity annotation. Resolve literal positions and supported quantities in application code, retaining strict validation and always-AI behavior.

Reconcile visible-card evidence with structured candidates before treating either as authoritative. Preserve ambiguous ranges and section ownership, or require explicit review. Keep unsupported synonyms and invented facts rejected. Re-run this exact captured corpus after the contract change, preserving these baseline failures.

This recommendation has not been implemented. Actual rendering/network checks and the import → preview → detail → cooking → shopping browser flow remain open.

## Cost, evidence, and checks

Twenty generation requests ran across 19 eligible pages. Ten returned usage: 37,908 input tokens and 63,382 output tokens, estimated at **$0.3167585** using the previously verified standard rates. Ten timed-out generations have unknown usage; that estimate is not total spend. The configured generation ceiling for 19 captures was **$1.862**. Evaluation usage is outside the production admission ledger.

Only the selected CookSnap credential was used. Raw HTML, selected source, final model answers, projections, and independent audit files are archived locally under `test-results/recipe-publisher-evaluation/2026-09-16/`. This directory is gitignored. Public artifacts contain metadata and short labels rather than complete publisher recipes. No credentials or model reasoning were saved.

Validation passed: `bun run typecheck`, `bun run lint`, and 90 relevant source/model/corpus tests across three files. JSON parsing, archived HTML hashes, and `git diff --check` passed. No production code changes, build, server startup, deployment, commit, or push occurred in this evaluation.

## Attribution

| Contributor | Model and reasoning | Work |
| --- | --- | --- |
| Main agent | Exact runtime model unknown; reasoning unset | Runner, live evaluation, integration, evidence, and report |
| Publisher source worker | Explicitly assigned `gpt-6-astra`, medium reasoning; runtime identity/effort unexposed | Verified URL selection |
| Two independent source reviewers | Explicitly assigned `gpt-6-astra`, medium reasoning; runtime identity/effort unexposed | Source ground truth and failed-output diagnosis |
| Recipe inference | Requested `muse-spark-1.3`, low reasoning | Twenty provider generations |

No worker descendants, escalations, or provider fallbacks. The reviewers supplied separate context, not model-family independence.
