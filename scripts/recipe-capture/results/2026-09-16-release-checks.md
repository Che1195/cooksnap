# Recipe capture release checks — September 16, 2026

The remaining development release checks pass: rendered imports, HTTP(S) network isolation, keyboard completion, 320px reflow, and native browser 200% zoom. Production rollout is separate from this verified development state.

## Renderer behavior and verification

The old Cloudflare `/content` fallback used URL filters that could not establish DNS isolation. Rendering now acquires a CDP session with `allowedDomains: []` and verifies the provider's denial response before untrusted scripts run. CookSnap intercepts each HTTP(S) request and fulfills permitted GET resources through its DNS-pinned transport. Redirects are paused individually through CDP Fetch; Playwright's higher-level routing skipped redirected requests and was replaced after a live regression test exposed that limitation.

Limits: 50 requests, 5 MB per resource, 15 MB aggregate, and a 15-second rendering deadline. Cleanup independently closes the CDP connection and deletes the remote session, with bounded waits. WebSockets, service workers, frames, forms, media, and alternative transport APIs are restricted. Untrusted status-600 responses now reject safely instead of throwing outside the fetch promise.

The opt-in live renderer test passed with `playwright-core` 1.63.0 in 2.975 seconds. A real Cloudflare browser executed external JavaScript, followed a public fixture redirect, fetched JSON, and produced recipe content. Private redirect and direct private subresource requests each reached the real validating transport and were rejected before opening a socket. Fixture resources were supplied by a controlled transport mock; remote execution and the denial policy were real. A harmless blank-frame test could not recover a WebRTC constructor.

The final **unmocked application import** used a public HTTP testing endpoint serving a synthetic JavaScript-only recipe. The initial HTML had zero selected text and no recipe candidate. Real network fetching, Cloudflare execution, JSON subresource fetching, Meta interpretation, Clerk authentication, Convex admission, editable preview, save, and reload all passed. The server recorded `rendered: true`, structured extraction, one generation, two ingredients, two instructions, no warnings, and exact expected ingredient text after reload. Browser request time was **14.558 seconds**; application duration was **13.844 seconds**.

HTTP(S) isolation is the enforced network boundary. Alternative transport restrictions are defense in depth, not proof of arbitrary-protocol isolation or browser-vulnerability resistance. Sites requiring POST requests, authenticated cookies, workers, frames, or larger resources may fail. Production compatibility with every publisher is not claimed.

Primary references: [Cloudflare guardrails](https://developers.cloudflare.com/browser-run/features/guardrails/), [session management](https://developers.cloudflare.com/browser-run/cdp/session-management/), [CDP integration](https://developers.cloudflare.com/browser-run/cdp/playwright/), and [Chrome Fetch protocol](https://chromedevtools.github.io/devtools-protocol/tot/Fetch/).

## Accessibility and consumer checks

Removed `maximumScale: 1` from viewport metadata so mobile users can zoom. Two browser cases completed import, validation-error correction, ingredient editing, saving, and cancellation using keyboard actions at 320 CSS pixels and 200% native browser zoom. The test-only extension calls Chromium's tabs zoom API; `getZoom()` returns 2 and measured layout width falls from 1280 to 640 CSS pixels. This is browser zoom, not CSS magnification. Focus moves to the review heading, returns to the invalid title and URL input as appropriate, and remains visible at the tested save and ingredient controls. Preview has no horizontal overflow at either tested size.

Main visually inspected native viewport screenshots. Chromium screenshots were captured through CDP because Playwright's viewport overrides cropped the zoomed image. The temporary extension is confined to a disposable test browser profile, which is removed after each case. This is bounded keyboard/zoom verification, not a full screen-reader or contrast audit.

Three consumer browser cases pass: preference reload and separate-context sync; forced review and cancellation without saving; edited save persistence; automatic saving with preview off; matching detail/cooking/shopping quantities; cooking reload/reset; and partial-scaling warnings. The existing meal-plan/shopping smoke also passes. Its fixture shopping rows are now removed before subsequent tests.

Independent review found one additional scaling defect: spelled-out percentages and quote-based dimensions could change with serving count. The shared projection now preserves them. Nine new regressions cover plain and validated-metadata projections.

Zoom methodology: [Playwright extension testing](https://playwright.dev/docs/chrome-extensions) and [Chrome tabs zoom API](https://developer.chrome.com/docs/extensions/reference/api/tabs).

## Verification and cleanup

- `bun run typecheck`: pass.
- `bun run lint`: pass.
- `bun run test`: **707 passed**, one opt-in live test skipped; 34 files passed, one skipped. The skipped live test passed separately as described above.
- Six browser scenarios passed against real Clerk/Convex: two accessibility cases, three capture/consumer cases, and one meal-plan/shopping smoke. Clerk setup also passed its two setup tests.
- Independent general feature review and fresh renderer review found no remaining high or medium findings after the projection, redirect, cleanup, and malformed-response fixes. The renderer reviewer independently reran all 21 transport/renderer unit tests.

The remote main branch was fetched and matched the feature branch's starting commit. Final Convex validation was synced to development deployment `fastidious-hummingbird-755`. Convex reported that the workspace exceeds Free-plan limits; billing was not changed. No production build or production deployment was requested or performed.

At 21:00:05 UTC, Cloudflare's session listing reported zero active browser sessions. The temporary Clerk account and Convex profile were deleted through the authenticated account-deletion endpoint, with ownership checks and post-deletion verification. Browser authentication storage was removed. The local development server remains running.

Current screenshots, fixture input, live result, and cleanup evidence live in gitignored `test-results/release-verification/2026-09-16/`, outside Playwright's disposable output directory. Prior compact evaluation raw payload loss remains documented in the [compact report](2026-09-16-compact-report.md); retained summaries do not replace missing raw artifacts.

## Usage and remaining limits

This turn made three Meta generations: an escaped-HTML fixture that correctly produced an incomplete correction draft, an initial successful rendered integration run, and the final run. Reported application estimates total **$0.014361**, with all three usage reports present. The final run used 651 input and 765 output tokens, estimated **$0.004065**. Three development admission reservations total $0.294 and remain intentionally nonrefundable. The escaped-HTML fixture did not execute JavaScript; it was replaced with a raw-HTML testing endpoint before the rendered gate was claimed.

Cloudflare usage: the worker reported one successful REST render and eight acquired CDP sessions (five successful probes/tests, two Bun connection failures, and one reproduced redirect failure), plus one rate-limited creation without a session. The main agent ran two additional CDP sessions through the app. Provider rendering charges were not retrieved. Node/Next execution passed; standalone Bun CDP connections timed out. Application rendering targets the Node runtime.

Remaining documented product limits include incomplete automatic scaling for some equivalents/divided amounts, omitted uncertain highlights, and mandatory preview for flagged drafts. No metric/US conversion, source-only saving after AI failure, production rollout, or backfill was added.

## Models used

| Contributor | Model and reasoning | Work |
| --- | --- | --- |
| Main | Runtime model unknown; reasoning unset | Integration, accessibility tests and visual review, projection fix, live imports, cleanup, release evidence and PR |
| Renderer worker | Explicit `gpt-6-astra`, medium; runtime unexposed | Renderer implementation and live isolation tests |
| Feature reviewer | Explicit `gpt-6-astra`, medium; runtime unexposed | Feature review and projection/accessibility recheck |
| Renderer reviewer | Explicit `gpt-6-astra`, medium; runtime unexposed | Fresh transport/renderer review and test recheck |
| Recipe inference | Requested `muse-spark-1.3`, low | Three live interpretations |

No descendants or provider fallbacks. Reviewer separation provides independent context, not model-family independence.
