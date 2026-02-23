# Code Audit — CookSnap

**Initial audit:** 2026-02-23
**Re-audit:** 2026-02-23
**Audited by:** Claude Code

---

## Summary

CookSnap is a well-structured Next.js recipe management app with strict TypeScript, Zod schemas, Supabase RLS, error boundaries on all routes, and solid mobile-first design.

**Initial audit** found 4 critical, 13 high, 17 medium, and 17 low issues.
**Security fix pass** resolved 17 security issues (all critical, high-security, and medium-security items).
**Re-audit** verified all 17 fixes as correct and complete. Found 6 new minor issues (0 critical, 0 high, 5 medium, 1 low).
**Second fix pass** resolved all 6 remaining security issues. **All 23 security issues are now fixed.** Only non-security code quality items remain open.

---

## Round 1 — Fixed Issues (Verified in Re-audit)

All 17 issues below have been **verified as correctly and completely fixed**.

### Critical (all fixed)
| ID | Issue | File | Status |
|----|-------|------|--------|
| C1 | Unauthenticated scrape API | `src/app/api/scrape/route.ts` | FIXED — Supabase auth check added |
| C2 | SSRF bypass (DNS rebinding + redirects) | `src/app/api/scrape/route.ts` | FIXED — DNS resolution before fetch, `redirect: "manual"`, per-hop validation, expanded IP blocklist |
| C3 | Open redirect in auth callback | `src/app/auth/callback/route.ts` | FIXED — `next` param validated (must start with `/`, not `//`) |
| C4 | Render-time side effect in cook page | `src/app/cook/page.tsx` | FIXED — `stopCooking()` moved to `useEffect` |

### High — Security (all fixed)
| ID | Issue | File | Status |
|----|-------|------|--------|
| H2 | Account deletion partial failure | `src/app/api/account/delete/route.ts` | FIXED — Auth deleted first, then profile |
| H3 | Middleware route matching prefix collisions | `src/lib/supabase/middleware.ts` | FIXED — Exact match + boundary check |
| H5 | Accessibility zoom blocked | `src/app/layout.tsx` | FIXED — `maximumScale: 5`, removed `userScalable: false` |
| H6 | CSP `unsafe-eval` in production | `next.config.ts` | FIXED — Conditional on `NODE_ENV === 'development'` |
| H7 | Missing HSTS header | `next.config.ts` | FIXED — Added with 2-year max-age, includeSubDomains, preload |
| H8 | Wildcard image hostname undocumented | `next.config.ts` | FIXED — Documented rationale, added `minimumCacheTTL: 60` |

### Medium — Security (all fixed)
| ID | Issue | File | Status |
|----|-------|------|--------|
| M1 | Unbounded scrape response size | `src/app/api/scrape/route.ts` | FIXED — Streaming reader with 5MB cap |
| M2 | No rate limiting | `src/app/api/scrape/route.ts` | FIXED — In-memory rate limiter, 10 req/min/user |
| M3 | Non-null env var assertions | `src/lib/env.ts` (new) | FIXED — Zod validation module, all clients updated |
| M5 | Weak sourceUrl validation | `src/lib/schemas.ts` | FIXED — `z.string().url().or(z.literal(""))` |
| M14 | `useAuth` context always truthy | `src/components/auth-provider.tsx` | FIXED — Default changed to `null` |
| M15 | Session tokens in URL hash | `src/app/auth/confirmed/page.tsx` | FIXED — Hash cleared via `history.replaceState` after consumption |
| L10 | No Content-Type validation on scrape | `src/app/api/scrape/route.ts` | FIXED — Validates `text/html` or `application/xhtml+xml` |

---

## Round 2 — New Findings from Re-audit (all fixed)

All 6 issues below have been **fixed**.

### Medium — Defense-in-depth (all fixed)
| ID | Issue | File | Status |
|----|-------|------|--------|
| R2-1 | Service layer write operations missing `user_id` filter | `src/lib/supabase/service.ts` | FIXED — Added `user_id` filter to `updateRecipe`, `deleteRecipe`, `toggleShoppingItem`, `deleteTemplate`, `updateGroup`, `deleteGroup`; added ownership verification to `addRecipeToGroup`, `removeRecipeFromGroup` |
| R2-2 | User avatar rendered via raw `<img>` | `src/components/user-menu.tsx` | FIXED — Replaced with Next.js `<Image>` component |
| R2-3 | `sourceUrl` in `<a href>` without protocol check | `src/components/recipe-detail.tsx` | FIXED — Link only renders when URL starts with `http://` or `https://` |
| R2-4 | `image` field not validated as URL in schema | `src/lib/schemas.ts` | FIXED — Added `.url()` validation |

### Low (all fixed)
| ID | Issue | File | Status |
|----|-------|------|--------|
| R2-5 | `setInterval` missing `.unref()` | `src/app/api/scrape/route.ts` | FIXED — Added `.unref()` to cleanup interval |
| R2-6 | `getSession()` instead of `getUser()` for initial hydration | `src/components/auth-provider.tsx` | FIXED — Replaced with server-verified `getUser()` |

### Informational — Confirmed Safe

- **No `dangerouslySetInnerHTML`** anywhere in the codebase
- **No prototype pollution** vectors
- **No ReDoS** vulnerabilities in user-facing regex
- **No CSRF risk** — JSON content-type + CORS preflight blocks cross-origin form attacks
- **All user content** rendered via React JSX auto-escaping
- **All form inputs** use controlled components with parameterized Supabase queries
- **DNS rebinding TOCTOU** — theoretical millisecond window between `dns.resolve` and `fetch()` is an inherent limitation of user-space SSRF protection, not an implementation bug. Mitigate at infra level (AWS IMDSv2).

---

## Code Quality Issues (from Round 1) — All Fixed

### High (all fixed)
| ID | Issue | Fix |
|----|-------|-----|
| H1 | Optimistic updates never roll back on failure | FIXED — All 13 optimistic update functions now capture previous state and restore on error |
| H4 | Race condition in recipe delete flow | FIXED — `deleteRecipe` called before `router.push`, with try/catch |
| H9 | Suspense boundaries missing fallback UI | FIXED — Added loading spinner fallbacks to `meal-plan/page.tsx` and `recipes/page.tsx` |
| H10 | Duplicated schedule picker sheet code (~120 lines) | FIXED — Extracted shared `SchedulePickerSheet` component |
| H11 | Service tests too weak to catch real bugs | FIXED — Enhanced existing tests to verify field transformations and query chains |
| H12 | No error-path tests for service functions | FIXED — Added error-path tests for 9 core service functions |
| H13 | No tests for API routes or SSRF protection | FIXED — New `route.test.ts` with 17 tests covering `isBlockedIP` and route handler |

### Medium (all fixed)
| ID | Issue | Fix |
|----|-------|-----|
| M4 | Module-level stateful regex with `g` flag | FIXED — Pattern stored as string, fresh regex created per call |
| M6 | `formatWeekRange` crashes on short arrays | FIXED — Uses `dates[dates.length - 1]` with empty/single guards |
| M7 | `addRecipeToGroup` allows duplicate entries | FIXED — Checks for existing membership before insert |
| M8 | N+1 database calls for shopping list | FIXED — Batch insert via `restoreShoppingItems` |
| M9 | `migrateFromLocalStorage` has no duplicate prevention | FIXED — Checks existing `sourceUrl` set before importing |
| M10 | `SlotRow` defined inside render body | FIXED — Extracted to standalone component with explicit props |
| M11 | RecipeCard is heavyweight for a list item | FIXED — Sheets conditionally rendered only when open |
| M12 | Instruction steps use array index as key | FIXED — Stable IDs via `useRef` counter |
| M13 | Missing aria-labels on interactive elements | FIXED — Added to schedule picker slot buttons |
| M16 | Several untested service functions | FIXED — Added tests for 12 previously untested functions (86 total service tests) |
| M17 | Unused imports in recipe-edit-form | FIXED — Removed `useEffect` import |

### Low (code quality)
- **L1–L9, L11–L17** — Various schema, type, documentation, and test issues (not detailed in current audit)

---

## Architecture Notes

**Overall structure is solid.** Standard Next.js App Router conventions with clean separation.

**Positive patterns:** Supabase RLS, Zustand with optimistic updates + rollback, error boundaries, Server/Client Component separation, mobile-first PWA, Zod validation, validated env vars.

**Shared components:** SchedulePickerSheet extracted and shared between RecipeDetail and RecipeCard. SlotRow extracted from MealPlanContent with explicit props.

**Dependency usage is lean.** No unnecessary libraries.

---

## Recommended Next Steps

### Security
All 23 security issues (17 from round 1 + 6 from round 2) are **resolved**. No open security items.

### Code quality
All High and Medium issues are **resolved**. Test count increased from 239 to 318 (33% increase).

Remaining Low items (L1–L17) are minor schema, type, and documentation improvements not detailed in the current audit.
