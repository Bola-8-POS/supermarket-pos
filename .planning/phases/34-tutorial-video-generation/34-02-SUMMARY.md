---
phase: 34-tutorial-video-generation
plan: 02
subsystem: testing
tags: [playwright, e2e, video-recording, i18n]

# Dependency graph
requires:
  - phase: 34-01
    provides: "e2e/tutorials/fixtures.ts, locale.ts, i18n-selectors.ts, pacing.ts, playwright.tutorial.config.ts, scripts/tutorial-videos-convert.ts, the checkout tracer pattern"
provides:
  - "e2e/tutorials/inventory/inventory.spec.ts — manager stock adjustment with reason + near-expiry alert"
  - "e2e/tutorials/suppliers/suppliers.spec.ts — supplier creation + shipment receiving with duplicate-barcode rejection"
  - "e2e/tutorials/payments/payments.spec.ts — manager-PIN-gated payment completion + refund"
  - "Three more real, playable domain tutorial video pairs (es-MX) under tutorial-videos/{inventory,suppliers,payments}/*.mp4"
affects: [34-03, 34-04, 34-05, 34-06]

# Actuals (#2632)
actuals:
  tokens: 5938
  tasks: 3
  commits: 4

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dialogs must be scoped by accessible name (page.getByRole('dialog', {name: ...})) — the always-mounted AI-assistant side panel is also role=\"dialog\" (just translated off-screen, which Playwright still counts as visible), so a bare getByRole('dialog') can resolve to 2 elements and intermittently fail toBeHidden()/toBeVisible() assertions"
    - "setInventoryExpiryDaysFromNow(productName, days) from e2e/helpers/supabase.ts is the correct seed for a near-expiry-alert tutorial scenario (default threshold is 14 days via useNearExpiryAlerts)"
    - "For payments/refund tutorial scenarios needing a viewer-scoped 'tabs awaiting payment' list or a fully-paid tab with real order_items, reproduce the local (unexported) seedOpenTab/ensureOpenShift/seedPaidTab helpers from e2e/payments/payment-pane.spec.ts and refund.spec.ts inline rather than the generic exported helpers/supabase.ts equivalents, which don't create order_items or match useTabs()'s shift_id filter"

key-files:
  created:
    - e2e/tutorials/inventory/inventory.spec.ts
    - e2e/tutorials/suppliers/suppliers.spec.ts
    - e2e/tutorials/payments/payments.spec.ts
  modified: []

key-decisions:
  - "Inventory near-expiry test seeds Haldiram's Aloo Bhujia 200g's expiry_date to 5 days out (well inside the 14-day default threshold) rather than depending on the store's configured value"
  - "Suppliers duplicate-barcode test reuses the barcode from its own just-created quick-add product as the 'already-used' barcode for the second line, avoiding a separate seed step"
  - "Payments refund test logs in as manager (not admin, per plan) — RefundSheet's requiredAction=\"process_refund\" and the RBAC table both confirm manager+ qualifies"

patterns-established:
  - "34-03..34-06 should scope any dialog assertion by accessible name from the start, not just when toBeHidden()/toBeVisible() is called on the bare role — the AI-assistant panel collision is latent in every domain, not just suppliers"

requirements-completed: [VIDEO-02, VIDEO-04, VIDEO-06]

coverage:
  - id: D1
    description: "Inventory tutorial: manager navigates the inventory hub and adjusts stock with a required reason"
    requirement: "VIDEO-02"
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/tutorials/inventory --config=playwright.tutorial.config.ts — 'manager navigates the inventory hub and adjusts stock with a reason'"
        status: pass
    human_judgment: false
  - id: D2
    description: "Inventory tutorial: a product nearing its expiry threshold is flagged in the Near Expiry tab"
    requirement: "VIDEO-02"
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/tutorials/inventory --config=playwright.tutorial.config.ts — 'a product nearing its expiry threshold is flagged'"
        status: pass
    human_judgment: false
  - id: D3
    description: "Suppliers tutorial: manager creates a supplier with a linked product"
    requirement: "VIDEO-02"
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/tutorials/suppliers --config=playwright.tutorial.config.ts — 'manager creates a supplier with a linked product'"
        status: pass
    human_judgment: false
  - id: D4
    description: "Suppliers tutorial: manager receives a shipment via quick-add, rejecting a duplicate barcode on a second line"
    requirement: "VIDEO-02"
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/tutorials/suppliers --config=playwright.tutorial.config.ts — 'manager receives a shipment, rejecting a duplicate barcode'"
        status: pass
    human_judgment: false
  - id: D5
    description: "Payments tutorial: manager unlocks and completes a cash payment from the Payments page"
    requirement: "VIDEO-06"
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/tutorials/payments --config=playwright.tutorial.config.ts — 'manager unlocks and completes a payment from the Payments page'"
        status: pass
    human_judgment: false
  - id: D6
    description: "Payments tutorial: manager processes a refund with the manager-PIN gate"
    requirement: "VIDEO-06"
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/tutorials/payments --config=playwright.tutorial.config.ts — 'manager processes a refund with the PIN gate'"
        status: pass
    human_judgment: false
  - id: D7
    description: "All 3 new domain spec files typecheck and lint cleanly; combined 6-test run passes and produces one non-empty .webm per scenario"
    verification:
      - kind: other
        ref: "npm run typecheck; npm run lint; npx playwright test e2e/tutorials/inventory e2e/tutorials/suppliers e2e/tutorials/payments --config=playwright.tutorial.config.ts — 6 passed"
        status: pass
    human_judgment: false

duration: 65min
completed: 2026-09-16
status: complete
---

# Phase 34 Plan 02: Inventory, Suppliers, and Payments Tutorial Videos Summary

**Three more domain tutorial-video scripts (inventory stock adjustment + near-expiry alert, supplier creation + shipment receiving with duplicate-barcode rejection, manager-PIN-gated payment + refund) built on 34-01's unmodified harness, all passing headless in es-MX.**

## Performance

- **Duration:** 65 min
- **Started:** 2026-09-16T13:40:00Z (approx.)
- **Completed:** 2026-09-16T14:45:00Z (approx.)
- **Tasks:** 3
- **Files modified:** 3 created

## Accomplishments
- `e2e/tutorials/inventory/inventory.spec.ts` — manager adjusts stock with a required "delivery" reason via the Batch Adjustment dialog, then a product seeded 5 days from expiry is confirmed flagged in the Near Expiry tab (14-day default threshold)
- `e2e/tutorials/suppliers/suppliers.spec.ts` — manager creates a supplier with contact details and a linked product; separately, a manager receives a shipment via quick-add for a genuinely new product, then a second line attempting the same barcode is rejected with the "already in your catalog" message
- `e2e/tutorials/payments/payments.spec.ts` — manager selects an open tab on `/payments`, unlocks the payment form with a manager PIN, and completes a cash payment through to the receipt; separately, a manager opens a refund on a paid sale, selects an item, and completes the manager-PIN-gated approval
- All dual-locale (es-MX/en-US) selectors built inline per plan guidance, either reused verbatim from already dual-locale reference specs (`e2e/suppliers/*.spec.ts`) or newly derived from the actual i18n JSON keys (never an English-only regex copied from a CI spec)
- Found and fixed a real cross-domain harness gotcha (see Deviations) that will save 34-03..34-06 the same debugging cycle

## Task Commits

Each task was committed atomically:

1. **Task 1: Inventory tutorial video** - `b9c05c7` (test)
2. **Task 2: Suppliers tutorial video** - `6d59e75` (test), fix follow-up `050aaf8` (fix)
3. **Task 3: Payments tutorial video** - `9742b62` (test)

## Files Created/Modified
- `e2e/tutorials/inventory/inventory.spec.ts` - stock adjustment + near-expiry alert scenarios
- `e2e/tutorials/suppliers/suppliers.spec.ts` - supplier creation + shipment receiving scenarios
- `e2e/tutorials/payments/payments.spec.ts` - payment completion + refund scenarios

## Decisions Made
- Near-expiry test seeds `Haldiram's Aloo Bhujia 200g` to 5 days from expiry via `setInventoryExpiryDaysFromNow` (existing helper) rather than depending on the store's configured threshold value.
- Suppliers duplicate-barcode test reuses the barcode from its own just-quick-added product as the "already-used" barcode for the second line — no separate pre-seeded duplicate product needed.
- Payments refund test logs in and approves as `manager` (the plan's specified role), confirmed against `RefundSheet`'s `requiredAction="process_refund"` and this repo's RBAC table (manager+ holds `process_refund`).
- Both supplier dialogs (New/Edit Supplier, Confirm Receipt) and any future dialog assertions should scope `getByRole('dialog', { name: ... })` by accessible name — documented as a `patterns-established` note for 34-03..34-06.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Bare `page.getByRole('dialog')` collided with the always-mounted AI-assistant panel**
- **Found during:** Task 2 follow-up, while running the plan's combined 3-domain `<verification>` step (not the per-task scoped verify, which happened not to trigger it)
- **Issue:** `src/widgets/AppShell` always mounts the AI-assistant side panel as `<div role="dialog" aria-label="Asistente IA">`, translated off-screen via CSS `transform` rather than unmounted or `display:none`. Playwright's visibility check does not treat an off-screen transform as hidden, so a bare `page.getByRole('dialog')` in `suppliers.spec.ts` resolved to 2 elements (the intended New/Edit Supplier or Confirm Receipt dialog, plus the assistant panel). `expect(dialog).toBeHidden()` after saving a supplier intermittently failed because Playwright evaluated the always-visible assistant panel instead of (or in addition to) the real dialog.
- **Fix:** Scoped both dialogs by accessible name — `SUPPLIER_DIALOG_RE` (`/new supplier|nuevo proveedor|edit supplier|editar proveedor/i`) and `RECEIVE_SHIPMENT_DIALOG_RE` (`/confirm receipt|confirmar recepción/i`) — mirroring `e2e/suppliers/supplier-crud.spec.ts`'s own `supplierDialog()` helper pattern, which already does this correctly.
- **Files modified:** `e2e/tutorials/suppliers/suppliers.spec.ts`
- **Verification:** Combined 3-domain run (6 tests) passed cleanly twice after the fix; `payments.spec.ts`'s dialogs were already name-scoped (`PROCESS_REFUND_TITLE_RE`) and unaffected.
- **Committed in:** `050aaf8`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary for correctness — an unscoped dialog locator is a latent flakiness source in any domain that renders a dialog while the AI-assistant panel is mounted (i.e., every authenticated page in this app). Documented as a pattern for 34-03..34-06 to apply from the start rather than rediscover.

## Issues Encountered

- The plan's combined 3-domain `<verification>` command (`npx playwright test e2e/tutorials/inventory e2e/tutorials/suppliers e2e/tutorials/payments`) was intermittently flaky across repeated runs in this sandboxed environment — sometimes a `net::ERR_CONNECTION_REFUSED` on `localhost:1520` (the shared Vite dev server observed dying and restarting under concurrent multi-agent load — up to 10 `node.exe` processes observed from sibling worktree agents in this wave) and, once, a `Receipt` heading timeout. Every individual domain's own task-scoped `<verify>` command (the actual per-task acceptance gate) passed reliably and repeatedly in isolation and in combination with itself (payments.spec.ts run twice back-to-back, 2/2 both times). After the dialog-scoping fix above, a final combined 6-test run passed cleanly with 0 failures, confirmed twice. This class of flake matches 34-01's own documented environment gotchas (Docker edge-runtime container exiting silently, `.env.local` not propagating to a fresh worktree) — it is dev-server/resource contention from concurrent sibling agents sharing this machine, not a defect in these three new spec files.
- `.env.local` did not exist in this worktree (gitignored, doesn't propagate) — copied from the main checkout (`D:\Projects\Code\supermarket-pos\.env.local`) before running any Playwright command, same as 34-01's documented fix. Not committed (stays gitignored).
- The local `supabase_edge_runtime_supermarket-pos-selfhosted` and `supabase_kong_supermarket-pos-selfhosted` Docker containers were already running at the start of this session (confirmed via `docker ps`) — no restart needed this time.

## User Setup Required

None - no external service configuration required. Local Supabase + the local `process-direct-sale`/edge-runtime containers must be running for anyone re-running `npm run tutorial-videos:record`, same as 34-01 and the rest of the `e2e/` suite.

## Next Phase Readiness

- `e2e/tutorials/{inventory,suppliers,payments}/*.spec.ts` are stable, proven additions — all 6 scenarios pass reliably in isolation and in combination after the dialog-scoping fix.
- 34-03 through 34-06 can safely reuse `fixtures.ts`/`locale.ts`/`i18n-selectors.ts`/`playwright.tutorial.config.ts` unmodified, exactly as 34-01 intended.
- **New guidance for 34-03..34-06:** scope any `page.getByRole('dialog', ...)` locator by accessible name from the start (see Deviations #1) — the AI-assistant panel collision is latent in every domain, not specific to suppliers.
- No blockers. The combined-run dev-server flakiness noted above is an environment/resource-contention condition from concurrent sibling worktree agents in this wave, not a code defect — future plans in this same wave may see the same transient `ERR_CONNECTION_REFUSED` symptom on their own combined runs and should retry rather than treat it as a spec bug, consistent with how it resolved here.

---
*Phase: 34-tutorial-video-generation*
*Completed: 2026-09-16*

## Self-Check: PASSED

All 3 created files confirmed present on disk; all 4 commits (`b9c05c7`, `6d59e75`, `9742b62`, `050aaf8`) confirmed in `git log`.
