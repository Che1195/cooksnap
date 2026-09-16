# Recipe capture evaluation

The [compact capture implementation and final evaluation](results/2026-09-16-compact-report.md) produced **19/19 reviewable publisher drafts**, with a 15.077-second median analysis time. Eighteen require preview. Unsupported highlights are omitted, and incomplete scaling is flagged. [Final development release checks](results/2026-09-16-release-checks.md) pass the direct and rendered import paths, HTTP(S) isolation, keyboard completion, 320px reflow, and native browser 200% zoom. Production rollout remains separate. Compact raw payloads were lost during earlier Playwright cleanup; public summaries remain, with availability corrections in the report.

The [original publisher evaluation](results/2026-09-16-publisher-report.md) accepted only 1/19 analyzable pages. Its failures remain archived for comparison. A twentieth page returned HTTP 403 and was not bypassed.

[Reliability fixes and final regression evidence](results/2026-09-16-reliability-fixes.md) address title loss, incomplete instruction quantities, and deadline/retry handling. All four final targeted synthetic captures passed; that small sample did not establish publisher reliability.

Capture the verified publisher manifest without AI calls:

```bash
bun scripts/recipe-capture/evaluate-publishers.ts --manifest=scripts/recipe-capture/publishers.json --artifacts=test-results/recipe-publisher-evaluation/new-run
```

For an explicitly authorized paid evaluation, add `--live` with `META_API_KEY` already loaded. Use `--id=bbc-pancakes` to select one capture. Keep baseline evidence in its original directory: capture and live modes overwrite their respective files. The runner checks HTML hashes, skips inaccessible/render-required sources, and stops after provider authentication, billing, permission, or rate-limit errors. The manifest permits at most 20 sources; the generation ceiling is $0.098 per analyzed source. It does not invoke a renderer or production admission. Raw publisher artifacts belong in the gitignored `test-results/` directory; commit only summarized evidence.

The [September 16 live evaluation](results/2026-09-16-report.md) completed with 34/36 baseline captures preserving the exact expected recipe. Two timed out; a separate repeat exposed title loss. Release checks remain open.

For detailed, incremental output with accepted recipes, displayed projections, provider statuses, and usage, use the explicitly paid runner:

```bash
bun scripts/recipe-capture/run-evaluation.ts --live --suite=measurement --output=/tmp/cooksnap-measurement.json
bun scripts/recipe-capture/run-evaluation.ts --live --suite=balanced --output=/tmp/cooksnap-balanced.json
```

Each suite uses its ceiling below. `--id=fixture-id` runs only that named case, with a $0.098 ceiling. Save diagnostic repeats separately; never overwrite a baseline failure. `complete` means all selected cases ran, not that their quality passed. Missing usage means unknown cost, never zero. Only use these detailed artifacts with the synthetic fixtures; they contain recipe text and final model answers.

Run the deterministic baseline without provider access:

```bash
bun scripts/recipe-capture/evaluate.ts
```

Run an explicitly authorized paid evaluation with the selected key already loaded into `META_API_KEY`:

```bash
bun scripts/recipe-capture/evaluate.ts --live --limit=20
```

The runner permits at most 20 sources and two generation attempts per source. Its conservative generation ceiling is $1.96. It does not read credential files or print credentials. This separate evaluation bypasses production admission; its cost is outside the production app's $5 ceiling.

The checked corpus contains 20 synthetic HTML sources, each with literal expected title, ingredient, and instruction facts. It covers structured markup and visible text, measurement edge cases, missing amounts, and adversarial page text. It is **not a captured publisher corpus**. A production release still requires representative publisher pages, partial/contradictory markup, rendered pages, and failure fixtures. Do not treat synthetic preservation results as a completed release quality gate.

## Runtime limits and operational boundaries

- Prompt `capture-7-meta` returns only quoted ingredient references and warnings for structured sources; application code retains the canonical recipe and calculates positions/quantities. Visible extraction must preserve whole source ingredient/step lines in order. Unsupported references force preview with validated remaining annotations; malformed schemas, unsupported recipe facts, and provider failures still reject. Measurement and marked-card conflict warnings also force review.
- Production uses only Muse Spark 1.3 (standard tier), with no tools and no provider switching. The server requires `META_API_KEY`; use an explicitly selected Meta project key. The contributor tier is not used. Requests set `store: false` and low reasoning.
- Clerk's `convex` token template and a provisioned Convex user are required. Admission atomically reserves $0.098 per attempt ID, with no refunds; the monthly global ceiling is $5. Per-user limits are three attempts/minute and twenty/day. Failed captures consume a reservation. Other use of the same provider key and infrastructure costs are outside this cap.
- The full request is counted with Meta `POST /v1/responses/input_tokens` before inference. More than 12,000 input tokens fails closed. Output is limited to 8,000 tokens per generation, including reasoning, and two generations. Count and generation receive the same request body, including instructions and output schema. No hosted tools run. Selected source is capped at 48 KiB, HTML at 5 MiB, request at 8 KiB.
- The route returns within a 55-second deadline. Direct fetch uses at most 10 seconds and rendering 15 seconds. Analysis can use remaining route time, capped at 45 seconds with a two-second response margin. A retry requires enough time for its delay plus at least five seconds or the preceding generation duration plus 500 ms, whichever is larger. This is an admission estimate, not a provider latency guarantee. The protected direct transport pins the validated DNS address into the actual connection and checks each redirect.
- Cloudflare renders from its own network. Application DNS checks and URL deny patterns do **not** guarantee private-subresource exclusion for arbitrary DNS names, remote rebinding, or redirects. Its remote egress isolation remains an unverified boundary. This preserves the existing renderer while reducing its timeout and blocking obvious private URL forms; it is not equivalent to direct transport pinning.
- Success telemetry logs model/prompt/schema, extraction strategy, rendering use, duration, retry count, tokens, and estimated cost, without source contents, full URLs, or prompts. Failure logging is deliberately minimal; no durable provenance store is implemented.

Provider wire format reference: https://ai.developer.meta.com/docs/protocols/responses
Cloudflare request restrictions: https://developers.cloudflare.com/browser-run/quick-actions/content-endpoint/

## Balanced offline corpus

Run `bun scripts/recipe-capture/evaluate-corpus.ts` for twenty cases across clean structured/microdata, partial, contradictory, noisy, rendered snapshots, and failures. Every expected fact has literal HTML evidence. Provenance distinguishes adapted repository test examples from new synthetic sources. `--live` explicitly enables sixteen analyzable cases with a $1.568 maximum generation reservation.

The offline result preserves all source evidence in 16/16 analyzable cases; four failure fixtures stop before inference in the runner. The deterministic baseline preserves the exact expected title/ingredient/step tuples in 10/16 analyzable cases. Renderer fixtures are captured hand-authored before/after snapshots, not real browser execution. Failure cases model source status/content; route behavior has separate unit tests. No publisher capture, live model quality, or real rendering claim follows from these results.

Standard pricing is $1.25 per million input tokens and $4.25 per million output tokens, verified September 16, 2026. Reservations ignore cache discounts. See [Meta pricing](https://ai.developer.meta.com/docs/pricing-rate-limits), [token counting](https://ai.developer.meta.com/docs/token-counting), and [structured output](https://ai.developer.meta.com/docs/structured-output). The compact contract retains the verified `strict: false` provider mode. Meta constrains JSON decoding, and the app independently validates response shape, source facts, and final spans.
