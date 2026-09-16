---
phase: 34-tutorial-video-generation
plan: 03
subsystem: testing
tags: [playwright, e2e, i18n, video-recording, rbac, caja, reports]

# Dependency graph
requires:
  - phase: 34-01
    provides: "Tutorial-video harness (pacing.ts, i18n-selectors.ts, locale.ts, fixtures.ts, playwright.tutorial.config.ts, scripts/tutorial-videos-convert.ts) and the proven checkout tracer"
provides:
  - "e2e/tutorials/staff-rbac/staff-rbac.spec.ts — admin adds staff (forced PIN change), cashier redirected from /rbac"
  - "e2e/tutorials/caja/caja.spec.ts — manager opens/registers-entry/closes a caja session via real UI, open-tabs close guard"
  - "e2e/tutorials/reports/reports.spec.ts — admin reviews a closed session's revenue/product-sales, CSV export from Payment Methods"
  - "Six real, playable es-MX tutorial video recordings across 3 domains (raw .webm, not yet ffmpeg-converted)"
affects: [34-04, 34-05, 34-06]

# Actuals (#2632)
actuals:
  tokens: 4430
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Domain video specs import test/expect from ../fixtures, staffForRole/loginAs/logout from ../../helpers/auth, seedStaffLocale/currentTutorialLocale from ../locale — zero new harness code, matching 34-01's established pattern"
    - "Dual-locale (es-MX/en-US) selectors built by reading the real i18n JSON catalog for each string, not by copying an English-only regex from the cited CI spec"
    - "A dialog/label whose i18n key appends a required-field marker (e.g. 'Amount *') needs a non-anchored regex — an exact ^...$ match against the base translated word never resolves"

key-files:
  created:
    - e2e/tutorials/staff-rbac/staff-rbac.spec.ts
    - e2e/tutorials/caja/caja.spec.ts
    - e2e/tutorials/reports/reports.spec.ts
  modified: []

key-decisions:
  - "staff-rbac Test 1 must log out before re-navigating to /login to verify the new staff member's forced PIN change — an already-authenticated session redirects away from /login instead of showing the staff picker, unlike the reference checkout tracer which never re-visits /login mid-test"
  - "reports.spec.ts's beforeEach closes the caja via the real UI (not a DB helper) since Reports needs a real closed session with real history, and the close-caja UI flow is already proven by caja.spec.ts's own first test"
  - "caja.spec.ts's open-tabs-block test queries the just-opened session's id via the service-role client after opening through the UI, since the UI flow doesn't return the caja_session_id the way the openCaja() DB helper does"

patterns-established: []

requirements-completed: [VIDEO-02, VIDEO-04, VIDEO-06]

coverage:
  - id: D1
    description: "Staff/RBAC tutorial: admin adds a new staff member with a forced PIN change; a cashier is redirected away from /rbac"
    requirement: "VIDEO-02"
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/tutorials/staff-rbac --config=playwright.tutorial.config.ts — 2 passed"
        status: pass
    human_judgment: false
  - id: D2
    description: "Caja tutorial: manager opens a caja, registers a cash expense, and closes at end of day; closing is blocked while a tab is open"
    requirement: "VIDEO-02"
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/tutorials/caja --config=playwright.tutorial.config.ts — 2 passed"
        status: pass
    human_judgment: false
  - id: D3
    description: "Reports tutorial: admin reviews a closed session's revenue/cash reconciliation and Product Sales breakdown; admin exports Payment Methods to CSV"
    requirement: "VIDEO-02"
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/tutorials/reports --config=playwright.tutorial.config.ts — 2 passed"
        status: pass
    human_judgment: false
  - id: D4
    description: "All 6 new tests pass together in one combined run, producing 6 real .webm recordings across the 3 domains"
    requirement: "VIDEO-02"
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/tutorials/staff-rbac e2e/tutorials/caja e2e/tutorials/reports --config=playwright.tutorial.config.ts — 6 passed (2.3m)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Dual-locale (es-MX/en-US) selectors built from the real i18n catalog, not copied English-only from the cited CI specs (VIDEO-04)"
    requirement: "VIDEO-04"
    verification:
      - kind: e2e
        ref: "All 6 tests above run with TUTORIAL_LOCALE defaulting to es-MX and pass, proving the selectors resolve against the Spanish UI"
        status: pass
    human_judgment: false
  - id: D6
    description: "No flow needed more than 3 debugging attempts beyond dual-locale selector rebuilding (VIDEO-06 stop-and-ask threshold never triggered)"
    requirement: "VIDEO-06"
    verification:
      - kind: other
        ref: "See Issues Encountered — the two real bugs found (missing logout before /login re-visit; unanchored asterisk-suffixed labels) were each single-attempt fixes"
        status: pass
    human_judgment: false

duration: 70min
completed: 2026-09-16
status: complete
---

# Phase 34 Plan 03: Staff/RBAC, Caja, and Reports Tutorial Videos Summary

**Three more domain tutorial-video specs (staff/RBAC, caja, reports) built on the unmodified 34-01 harness, all 6 scenarios recorded in es-MX and verified passing together in one run.**

## Performance

- **Duration:** 70 min
- **Started:** 2026-09-16T13:35:00Z (approx.)
- **Completed:** 2026-09-16T14:45:00Z (approx.)
- **Tasks:** 3
- **Files modified:** 3 (all new)

## Accomplishments
- `e2e/tutorials/staff-rbac/staff-rbac.spec.ts` — admin adds a new staff member through the real Add Staff dialog, proving the forced-PIN-change-on-first-login flow (D-04); a cashier is redirected away from `/rbac`
- `e2e/tutorials/caja/caja.spec.ts` — manager opens a caja with a drawer float, registers a cash expense, and closes at end of day through the real UI (deliberately not the `openCaja()` DB helper, since the open/close flow itself is the recorded content); a second scenario proves the open-tabs close guard
- `e2e/tutorials/reports/reports.spec.ts` — a real checkout + closed caja session (per RESEARCH.md Pitfall 3) gives Reports real history to review; admin walks through revenue/cash-reconciliation/Product Sales, then exports the Payment Methods report to CSV
- **All 6 tests pass together** in a single `npx playwright test e2e/tutorials/staff-rbac e2e/tutorials/caja e2e/tutorials/reports --config=playwright.tutorial.config.ts` run (2.3m), producing 6 non-empty `.webm` recordings across the 3 domains' `e2e-results-tutorials/raw/` folders

## Task Commits

Each task was committed atomically:

1. **Task 1: Staff/RBAC tutorial video** - `5ff08e7` (feat)
2. **Task 2: Caja tutorial video** - `00bf45a` (feat)
3. **Task 3: Reports tutorial video** - `c2712ac` (feat)

## Files Created/Modified
- `e2e/tutorials/staff-rbac/staff-rbac.spec.ts` - staff-management + RBAC-redirect domain video, 2 scenarios
- `e2e/tutorials/caja/caja.spec.ts` - caja open/register-entry/close + open-tabs-guard domain video, 2 scenarios
- `e2e/tutorials/reports/reports.spec.ts` - closed-session review + CSV export domain video, 2 scenarios

## Decisions Made
- staff-rbac Test 1 logs out before re-navigating to `/login` to check the forced-PIN-change screen — an already-authenticated admin session redirects `/login` away instead of rendering the staff picker (the plan's cited reference, `checkout.spec.ts`, never re-visits `/login` mid-test, so this gap wasn't visible there).
- reports.spec.ts's `beforeEach` closes the caja through the real UI (manager login → Close Caja → fill closing cash → dismiss reconciliation summary) rather than a DB helper, since a `resetTestState()`-clean DB plus a real completed checkout is what gives the narrated admin walkthrough genuine history to review.
- caja.spec.ts's open-tabs-block scenario reads the just-opened session's id via the service-role client (`getServiceClient()...eq('status','open').single()`) after opening through the UI, since driving the open flow through the UI (per the plan's explicit instruction not to call the `openCaja()` DB helper) doesn't hand back a `caja_session_id` the way the helper does.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Missing logout before re-visiting `/login` to verify forced PIN change**
- **Found during:** Task 1 (staff-rbac Test 1, first run)
- **Issue:** `page.goto('/login')` while still authenticated as admin redirects away from `/login` instead of showing the staff picker (`WHO_ARE_YOU_RE` heading never renders), because the plan's own cited reference (SM2 in `staff-management.spec.ts`) calls `logout(page)` first and the tutorial spec initially omitted it.
- **Fix:** Added `await logout(page);` immediately before `page.goto('/login')`.
- **Files modified:** `e2e/tutorials/staff-rbac/staff-rbac.spec.ts`
- **Verification:** Re-ran the test; the staff picker renders and the rest of the forced-PIN-change flow completes.
- **Committed in:** `5ff08e7` (Task 1 commit)

**2. [Rule 1 - Bug] Anchored regex never matched a label with a required-field asterisk**
- **Found during:** Task 2 (caja Test 1, first run — hung to the 180s global timeout)
- **Issue:** `RegisterCajaEntryDialog`'s Amount/Concept `<Label>` renders `{t('...amountLabel')} *` (a trailing required-field asterisk span), so an exact `^(amount|monto)$`/`^(concept|concepto)$` regex never resolves — `locator.fill()` has no default timeout override and hangs until the test's global timeout kills the browser mid-action.
- **Fix:** Changed both regexes from an exact `^...$` match to a `^...\b` prefix match (`AMOUNT_LABEL_RE`, `CONCEPT_LABEL_RE`).
- **Files modified:** `e2e/tutorials/caja/caja.spec.ts`
- **Verification:** Re-ran the test; both fields fill correctly and the expense-recorded toast appears.
- **Committed in:** `00bf45a` (Task 2 commit)

**3. [Rule 3 - Blocking] `no-dynamic-delete`/`no-unnecessary-condition` lint findings on newly-written code**
- **Found during:** Task 2/3 (running `npx eslint` on the new files, ahead of `npm run lint`)
- **Issue:** `delete obj[dynamicKey]` (mirrored from `e2e/reports/export.spec.ts`'s Tauri-mock pattern) and a `.single()` result checked with `if (error || !data)` both tripped strict lint rules that the project's actual `npm run lint` (`eslint src`) doesn't enforce on `e2e/**`, but which a plain `npx eslint <file>` does report.
- **Fix:** Replaced the dynamic `delete` with `Reflect.deleteProperty(...)`; simplified the `.single()` check to test only `error` (the discriminated response type already guarantees non-null `data` when `error` is falsy).
- **Files modified:** `e2e/tutorials/caja/caja.spec.ts`, `e2e/tutorials/reports/reports.spec.ts`
- **Verification:** `npx eslint <files>` reports zero problems; `npm run typecheck` and `npm run lint` both still pass project-wide.
- **Committed in:** `00bf45a`, `c2712ac`

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking lint cleanup)
**Impact on plan:** All three were necessary for correct, passing tests. No scope creep — no harness files were touched.

## Issues Encountered

- **Environment flakiness, not a spec defect:** repeated back-to-back full-suite runs in this same session intermittently hit (a) the local Deno edge-runtime container logging `wall clock duration warning` / `early termination has been triggered` for a `process-direct-sale` invocation (causing a real-sale checkout step to fail to reach its "Done" button within 30s), and (b) the Vite dev server itself crashing (`ERR_CONNECTION_REFUSED`) after many consecutive heavy video-recording runs. Every domain's tests passed cleanly and repeatedly when run in isolation (matching each task's own scoped `<verify>` command), and the final combined 6-test run — after restarting the `supabase_edge_runtime_supermarket-pos-selfhosted` container fresh — passed cleanly end-to-end (2.3m). Two assertions (`staff-rbac`'s post-logout `WHO_ARE_YOU_RE` heading, `caja`'s open-tabs-block toast) had their timeouts bumped from 15s to 30s as cheap insurance against this class of flake, since video-recorded runs carry materially more render/encode overhead than the lean CI suite these flows mirror.
- Per 34-01-SUMMARY.md's own note, this worktree's `.env.local` (gitignored, doesn't propagate to worktrees) had to be copied from the main checkout, and the `supabase_edge_runtime_supermarket-pos-selfhosted` Docker container needed a couple of restarts across this session's many repeated runs.

## User Setup Required

None - no external service configuration required. (Local Supabase + the local `process-direct-sale` edge function must be running for anyone re-running `npm run tutorial-videos:record`, same as 34-01 and the rest of the `e2e/` suite.)

## Next Phase Readiness

- 6 more raw `.webm` recordings exist (staff-rbac x2, caja x2, reports x2) alongside 34-01's checkout x2, all under `e2e-results-tutorials/raw/**` — ready for `scripts/tutorial-videos-convert.ts` to produce playable `.mp4`s whenever the phase's later plans (or a final conversion pass) run `npm run tutorial-videos:convert`.
- No harness files were modified — 34-04/34-05/34-06 can continue importing `fixtures.ts`/`locale.ts`/`i18n-selectors.ts`/`pacing.ts` unmodified with the same confidence 34-01 established.
- Two small, reusable lessons for the remaining domain plans: (1) always `logout()` before re-visiting `/login` mid-test to check a post-login state; (2) check a dialog field's actual rendered label (via source, not just the plain i18n key value) before anchoring a regex with `^...$` — a required-field asterisk or similar suffix breaks an exact match silently (it doesn't error, it just hangs until the global timeout).
- No blockers for 34-04 through 34-06.

---
*Phase: 34-tutorial-video-generation*
*Completed: 2026-09-16*

## Self-Check: PASSED

All 4 created files (3 specs + this SUMMARY) confirmed present on disk; all 3 task commits (`5ff08e7`, `00bf45a`, `c2712ac`) confirmed in `git log`.
