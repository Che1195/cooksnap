# Reliability fixes — September 16, 2026

Known title, instruction-scaling, and deadline/retry gaps are fixed locally. Final targeted live verification passed. Publisher, browser, and remote-renderer release checks remain open.

## Changes

- Capture selects bounded title evidence from structured markup or an unambiguous scoped heading. After successful AI interpretation, it preserves that title and requires review if restoration was necessary. Generic site headings, ambiguous scopes, hidden headings, and unsupported evidence do not supply titles. Visible headings can replace the scraper's synthesized placeholder without causing structured-source validation to fail.
- Instruction quantities derive from source text and validated ingredient-reference choices. Empty or partial AI quantity arrays no longer suppress scaling. Intentionally excluded references remain excluded. Relative fractions, temperatures, times, and equipment sizes stay unchanged.
- Nested package wording such as “2 packages of 8 oz cream cheese” is conservative: package size and instruction count remain unchanged, with a warning to check counts for selected servings. Ingredient package counts still scale. This is an explicit unresolved-amount fallback, not automatic package-count scaling.
- Analysis uses remaining route time, capped at 45 seconds, within the existing 55-second import deadline and a two-second response margin. Retries require remaining time for the delay plus the greater of five seconds or the preceding generation duration plus 500 ms. Cancellation, two-attempt limits, token caps, source validation, and spending reservations remain enforced.
- Prompt `capture-4-meta` explicitly restricts instruction references to ingredient names/aliases, excluding quantities and modifiers. No provider fallback or relaxed span validation was introduced.

## Verification

Typecheck, lint, all **603 tests across 33 files**, and whitespace checks passed. Added regression coverage for missing/ambiguous titles, structured placeholder recovery, omitted/partial instruction quantities, relative fractions, package-size safety, exhausted deadlines, and retry admission.

A fresh reviewer independently reproduced two intermediate defects: placeholder-title rejection and package-size scaling. Both were fixed. The reviewer reran **141 targeted tests** and reported no remaining actionable findings in that scoped recheck. Main also reproduced the package issue and inspected final displayed quantities.

Eight initial live regression captures under `capture-3-meta` produced seven exact successes and one failed-closed butter capture. Both generations of that failure returned invalid ingredient-reference spans. The original failure remains recorded in `2026-09-16-fix-butter.json`. Other cases included two repeats each of prior title/rendered-snapshot failures, a range, missing steps, and contradictory quantities.

After the narrower reference prompt, all four final captures used one generation and preserved exact title, ingredient lines, and instructions:

| Final case | Duration | Source preserved |
| --- | ---: | --- |
| Divided butter, repeat 1 | 11.643 s | Yes |
| Divided butter, repeat 2 | 12.871 s | Yes |
| Embedded instruction-injection source | 12.190 s | Yes |
| Simulated rendered DOM source | 14.200 s | Yes |

Both final butter outputs displayed ingredient `8 tbsp butter` and instruction `Melt 4 tbsp butter. Add remaining butter.` at 2×. At 0.5× they displayed `2 tbsp butter` and `Melt 1 tbsp butter. Add remaining butter.` The injection source retained its title and original text without creating the requested fictitious egg ingredient.

These four successes are bounded regression evidence, not a reliability-rate estimate. They do not prove that longer recipes finish within the deadline or that unrelated sites import correctly. Renderer fixtures still use synthetic HTML snapshots; no actual renderer, UI, network fetch, admission, or save flow ran.

## Cost and artifacts

This fix round made 12 capture calls and 14 generation requests. Provider usage was present for all 14 generations, including rejected output: 19,174 input tokens and 21,630 output tokens. Estimated generation cost: **$0.115895**. The configured maximum across the twelve captures was **$1.176**. This evaluation cost is outside production's admission ledger.

Eight `2026-09-16-fix-*.json` files retain the intermediate run. Four `2026-09-16-final-*.json` files retain the final prompt's raw final answers, usage, validated recipes, and display projections. Prior evaluation artifacts were not overwritten.

No production build, server startup, deployment, commit, push, or credential copying occurred. Next: evaluate representative publisher sources, then complete UI and remote-renderer network checks before release.

## Attribution

Main exact model unknown, reasoning unset: deadline/retry implementation, provider integration, prompt correction, live evaluation, review, and final verification. Three workers were explicitly assigned gpt-6-astra, medium reasoning: title evidence implementation, instruction-scaling implementation, and independent review. Their runtime-resolved identity/effort were not exposed. No descendants. Recipe inference used muse-spark-1.3, low reasoning. This was ordinary independent review, not a formal audit loop.
