---
phase: 34-tutorial-video-generation
plan: 04
subsystem: testing
tags: [playwright, e2e, video-recording, i18n, promotions, receipts, purchase-orders]

# Dependency graph
requires:
  - phase: 34-01
    provides: "e2e/tutorials/{pacing,i18n-selectors,locale,fixtures}.ts, playwright.tutorial.config.ts, checkout.spec.ts reference tracer"
provides:
  - "e2e/tutorials/promotions/promotions.spec.ts — percent-off + 3x2 combo promotion tutorial (2 scenarios)"
  - "e2e/tutorials/receipts/receipts.spec.ts — header/footer live preview + reprint tutorial (2 scenarios)"
  - "e2e/tutorials/purchase-orders/purchase-orders.spec.ts — manual PO + suggest-reorder tutorial (2 scenarios)"
affects: [34-06]

# Actuals (#2632)
actuals:
  tokens: 5430
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Print-mock domains (receipts) must register the __TAURI_INTERNALS__ addInitScript before the FIRST page.goto() in beforeEach, never mid-test after a prior navigation — registering it later races the app's own caja-open check and produces a spurious 'Caja session is not open' failure"
    - "Split a domain spec into per-role describe blocks (each with its own beforeEach) when different scenarios in the same domain need different login roles/mocks, rather than seeding every role's locale/mock in one shared beforeEach"
    - "Monospace receipt-preview assertions must use footer/header strings short enough to fit the default 32-char paper width — a longer string wraps mid-word and breaks a plain toContainText() substring match"

key-files:
  created:
    - e2e/tutorials/promotions/promotions.spec.ts
    - e2e/tutorials/receipts/receipts.spec.ts
    - e2e/tutorials/purchase-orders/purchase-orders.spec.ts
  modified: []

key-decisions:
  - "Dual-locale (es-MX/en-US) selectors for promotions were hand-built from src/shared/lib/i18n/locales/*/wAdmin.json and pages.json since promotion-dialog-validation.spec.ts/combo-wizard.spec.ts's own selectors are English-only; purchase-orders selectors were reused verbatim from e2e/purchase-orders/purchase-orders.spec.ts since that spec's dialog labels are already i18n-safe"
  - "receipts.spec.ts split into two test.describe blocks (settings vs reprint) instead of one shared beforeEach, so the Tauri print mock is only active for the reprint scenario and always registered before the first navigation"

patterns-established:
  - "Non-checkout/receipts/purchase-order domain specs that need a bilingual string not already in i18n-selectors.ts should grep the component's t('namespace.key') call and look up both locale JSON values directly, rather than copying an English-only regex from a CI reference spec"

requirements-completed: [VIDEO-02, VIDEO-04, VIDEO-06]

coverage:
  - id: D1
    description: "Promotions tutorial: admin creates a percent-off promotion scoped to a category, and builds a 3x2 cheapest-free combo, both narrated"
    requirement: "VIDEO-02"
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/tutorials/promotions --config=playwright.tutorial.config.ts — 2 passed"
        status: pass
    human_judgment: false
  - id: D2
    description: "Receipts tutorial: admin edits receipt header/footer with a live preview; cashier reprints the most recently completed sale"
    requirement: "VIDEO-02"
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/tutorials/receipts --config=playwright.tutorial.config.ts — 2 passed"
        status: pass
    human_judgment: false
  - id: D3
    description: "Purchase-orders tutorial: manager creates a PO manually against a supplier, and generates a suggest-reorder draft pre-filled from low stock"
    requirement: "VIDEO-02"
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/tutorials/purchase-orders --config=playwright.tutorial.config.ts — 2 passed"
        status: pass
    human_judgment: false

duration: 55min
completed: 2026-09-16
status: complete
---

# Phase 34 Plan 04: Promotions, Receipts, Purchase-Orders Tutorial Videos Summary

**Three more domain tutorial video scripts (promotions, receipts, purchase-orders) built on the unmodified 34-01 harness, all 6 scenarios passing headless with real es-MX recordings.**

## Performance

- **Duration:** 55 min
- **Started:** 2026-09-16T13:40:00Z (approx.)
- **Completed:** 2026-09-16T14:03:23-06:00
- **Tasks:** 3
- **Files modified:** 3 (all new)

## Accomplishments
- `e2e/tutorials/promotions/promotions.spec.ts` — admin creates a percent-off promotion scoped to the Snacks category, and builds a 3x2 cheapest-free combo; both narrated, both cleaned up in `afterEach`
- `e2e/tutorials/receipts/receipts.spec.ts` — admin edits the receipt header/footer with a live preview under Settings > Hardware; cashier completes a cash sale then reprints it from `/payments`, reusing `reprint.spec.ts`'s `__TAURI_INTERNALS__` print mock
- `e2e/tutorials/purchase-orders/purchase-orders.spec.ts` — manager creates a PO manually with a line item, and generates a suggest-reorder draft pre-filled from low stock, editing the quantity before saving
- All 6 scenarios verified passing headless, producing 6 non-empty `.webm` recordings under `e2e-results-tutorials/raw/{promotions,receipts,purchase-orders}/`

## Task Commits

Each task was committed atomically:

1. **Task 1: Promotions tutorial video** - `5e6e596` (feat)
2. **Task 2: Receipts tutorial video** - `5431fc7` (feat)
3. **Task 3: Purchase orders tutorial video** - `cdc3eda` (feat)

## Files Created/Modified
- `e2e/tutorials/promotions/promotions.spec.ts` - percent-off + 3x2 combo promotion tutorial (2 tests)
- `e2e/tutorials/receipts/receipts.spec.ts` - header/footer live preview + reprint tutorial (2 tests)
- `e2e/tutorials/purchase-orders/purchase-orders.spec.ts` - manual PO + suggest-reorder tutorial (2 tests)

## Decisions Made
- Built dual-locale (es-MX/en-US) selector regexes for promotions inline in the spec (not added to the shared `i18n-selectors.ts`, since they're domain-unique), sourced by grepping the actual component's `t('namespace.key')` calls against both locale JSON files rather than trusting the English-only regexes in `promotion-dialog-validation.spec.ts`/`combo-wizard.spec.ts`.
- Reused `e2e/purchase-orders/purchase-orders.spec.ts`'s selectors verbatim — that spec's dialog already carries dual-locale regexes (`/new purchase order|nueva orden de compra/i` etc.), so no new lookup was needed there.
- Split `receipts.spec.ts` into two `test.describe` blocks (settings vs. reprint) with separate `beforeEach`s, so the Tauri print mock is only registered for the reprint scenario and always before that block's first `page.goto()`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Print mock registered mid-test raced the app's caja-open check**
- **Found during:** Task 2 (receipts, "cashier reprints the most recently completed sale")
- **Issue:** The plan's own combined-beforeEach design called `injectPrintMock(page)` inside the test body, after the shared `beforeEach` had already called `page.goto('/')`. Enabling `window.__TAURI__` mid-test (after the first navigation) caused the checkout/payment flow to fail with a genuine app-level "Caja session is not open" error — confirmed via trace screenshot — even though `openCaja()` had already run successfully. Isolating the exact same cash-sale flow without the mock, and with the mock registered before any navigation, both worked; only "mock registered after the first goto" failed.
- **Fix:** Split the single `test.describe`/`beforeEach` into two blocks — a settings-only block (admin, no mock) and a reprint-only block (cashier + `openCaja` + `injectPrintMock` called before `page.goto('/')`, matching `reprint.spec.ts`'s own proven ordering).
- **Files modified:** `e2e/tutorials/receipts/receipts.spec.ts`
- **Verification:** Both receipts tests pass consistently (2/2, re-run twice).
- **Committed in:** `5431fc7` (Task 2 commit)

**2. [Rule 1 - Bug] Footer text wrapped mid-word in the monospace receipt preview**
- **Found during:** Task 2 (receipts, "admin edits receipt header/footer with a live preview")
- **Issue:** The plan's example footer text ("Cambios y devoluciones en 15 dias", 34 chars) exceeds the default 32-char paper width, so the `<pre>` preview wraps it mid-word ("...15 dia" + newline + "s"), breaking a plain `toContainText()` substring assertion.
- **Fix:** Shortened the footer text to "Devoluciones en 15 dias" (23 chars, the same known-good value `e2e/receipts/settings.spec.ts` already uses for this exact assertion).
- **Files modified:** `e2e/tutorials/receipts/receipts.spec.ts`
- **Verification:** Assertion passes.
- **Committed in:** `5431fc7` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes were necessary to get real, passing recordings for the receipts domain. No scope creep — no harness files (`fixtures.ts`, `locale.ts`, `i18n-selectors.ts`, `playwright.tutorial.config.ts`) were touched.

## Issues Encountered
- One transient "Vite server connection lost. Polling for restart..." full-page-reload event occurred during an isolated `--trace=on` debug re-run of the purchase-orders "suggest reorder" test, closing the open dialog mid-test and producing a one-off failure unrelated to the spec's own logic. Confirmed as environmental flakiness (not a code or app bug) by re-running the full `e2e/tutorials/purchase-orders` suite immediately after with no `--trace` flag — both tests passed cleanly. No code change was needed.

## User Setup Required

None - no external service configuration required. (Local Supabase + the local `process-direct-sale` edge function must be running, same as 34-01 — both were already up in this worktree; `.env.local` was copied from the main checkout per 34-01's documented gotcha since it doesn't propagate into a fresh worktree.)

## Next Phase Readiness

- Promotions, receipts, and purchase-orders join checkout (34-01) as proven, passing tutorial domains.
- No changes to any shared harness file (`fixtures.ts`, `locale.ts`, `i18n-selectors.ts`, `pacing.ts`, `playwright.tutorial.config.ts`) — 34-02/34-03/34-05/34-06 can continue importing them unmodified.
- No blockers for remaining Phase 34 plans.

---
*Phase: 34-tutorial-video-generation*
*Completed: 2026-09-16*

## Self-Check: PASSED

All 3 created files confirmed present on disk; all 3 task commits (`5e6e596`, `5431fc7`, `cdc3eda`) confirmed in `git log`.
