---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: Receipt Designer + Inventory Management Expansion
current_phase: 34
status: completed
stopped_at: Phase 34 complete — all phases complete
last_updated: "2026-09-16T22:21:17.766Z"
last_activity: 2026-09-16
last_activity_desc: Phase 34 complete
state_head: cedf265537a6052a624fef12fa05eba2b05321fe
progress:
  total_phases: 17
  completed_phases: 12
  total_plans: 62
  completed_plans: 62
  percent: 71
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-08)

**Core value:** Fast, reliable checkout (barcode scan → cart → pay) backed by inventory that's always accurate — what's on the shelf, what's expiring, and what needs reordering — without the owner doing manual data entry for every supplier delivery.
**Current focus:** Phase 33 — Login Screen Store Branding

## Current Position

Phase: 34
Status: All phases complete
  Phase-level verification/completion is the orchestrator's next step, not yet run.
Last activity: 2026-09-16 — Phase 34 complete
  filter dropdowns added to the admin Catalog product table (`DataTable` `toolbar` prop, D-11) and to
  the POS checkout grid (secondary `<select>`s below `CategoryTabs`, AND-composed with the active
  category tab per D-12 — `CategoryTabs.tsx` itself verified untouched via `git diff --name-only` on
  every task). New `e2e/checkout/product-grid-brand-weight-filters.spec.ts` (2 tests) plus a new
  PM21 test in `product-management.spec.ts` prove both surfaces narrow correctly; full
  `product-management.spec.ts` + the new checkout spec run headless against local Supabase — 22
  passed, 1 pre-existing documented skip, 0 failed. No deviations — Plan 01 already made
  `brandId`/`weightUnit` required-but-nullable on `Product` everywhere, so this plan's read-only
  filter predicates needed no schema/mapper changes. See `32-02-SUMMARY.md` for full detail.

  Plan 32-01 executed and committed (603b7a6, 13625e0):
  `brands` table + RLS + CRUD UI (BRND-01), `products.brand_id` (ON DELETE RESTRICT, BRND-02),
  `products.weight_amount`/`weight_unit` (BRND-03) wired into the reshaped product dialog with
  both-or-neither validation at both the Zod and DB layers. `e2e/products/brands.spec.ts` (6 tests)

  + 2 new product-management.spec.ts tests (PM19/PM20) all green. Found and fixed 4 Rule 1/3
  deviations along the way — most notably `entities/inventory/model/queries.ts`'s `mapInventoryRow`
  was silently poisoning the entire `/inventory` list fetch once `ProductSchema` gained the new
  required-but-nullable brand/weight keys (same failure class as a prior Phase 27 bug at that same
  call site) — see `32-01-SUMMARY.md` for the full deviation list.
  Gap-closure plan 31-06 (inventory join fix, units-per-package validation fix) reconfirmed live via
  `/gsd-verify-work 31`: full `e2e/products/` + `e2e/checkout/peek-window.spec.ts` suite (65 specs)
  run headless against local Supabase — 62 passed, 2 pre-existing documented skips, 1 flaky
  test-timing assertion (not a regression). Found and fixed an unrelated local-dev-environment gap
  en route: migration `20260907000001_product_photos_storage.sql` had never been applied to this
  machine's local Supabase instance.

**Also complete (concurrent session):** Phase 27 — Promotions & Discount Management, 7/7 plans,
verified 16/16 must-haves (see `.planning/phases/27-promotions-discount-management/27-VERIFICATION.md`).

## Performance Metrics

**Velocity:**

- Total plans completed: 113 (all v1.0, Phases 1-4)
- Average duration: - min
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 13 | - | - |
| 02 | 9 | - | - |
| 03 | 2 | - | - |
| 04 | 6 | - | - |
| 05 | 3 | - | - |
| 08 | 6 | - | - |
| 09 | 3 | - | - |
| 10 | 7 | - | - |
| 6 | 3 | - | - |
| 14 | 4 | - | - |
| 15 | 4 | - | - |
| 16 | 4 | - | - |
| 13 | 3 | - | - |
| 18 | 3 | - | - |
| 21 | 2 | - | - |
| 23 | 5 | - | - |
| 24 | 4 | - | - |
| 27 | 10 | - | - |
| 28 | 5 | - | - |
| 31 | 6 | - | - |
| 32 | 2 | - | - |
| 33 | 3 | - | - |
| 34 | 6 | - | - |

**Recent Trend:**

- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
**Per-Plan Metrics (v1.0, Phases 1-4 — archived, see `.planning/milestones/v1.0-phases/`):**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 01 P01 | 35 | 2 tasks | 4 files |
| Phase 01 P02 | 6 | 2 tasks | 7 files |
| Phase 01 P03 | 50 | 3 tasks | 61 files |
| Phase 01 P04 | 0 | 3 tasks | 7 files |
| Phase 01 P05 | 55 | 2 tasks | 36 files |
| Phase 01 P06 | 65 | 2 tasks | 81 files |
| Phase 01 P07 | 25 | 2 tasks | 3 files |
| Phase 01 P08 | 20 | 2 tasks | 39 files |
| Phase 01 P09 | 50 | 2 tasks | 81 files |
| Phase 01 P10 | 55 | 2 tasks | 27 files |
| Phase 01 P11 | 70 | 2 tasks | 46 files |
| Phase 01 P12 | 35 | 2 tasks | 12 files |
| Phase 01 P13 | 540 | 3 tasks + 19 spec fixes | ~40 files |
| Phase 02-core-direct-sale-checkout P01 | 28m | 2 tasks | 18 files |
| Phase 02 P02 | 8 | 2 tasks | 8 files |
| Phase 02 P03 | 35 | 3 tasks | 33 files |
| Phase 02-core-direct-sale-checkout P04 | 10m | 3 tasks | 4 files |
| Phase 02-core-direct-sale-checkout P05 | 12m | 3 tasks | 16 files |
| Phase 02 P06 | 145m | 3 tasks | 3 files |
| Phase 02 P08 | 45m | 2 tasks | 7 files |
| Phase 02 P07 | 30m | 2 tasks | 8 files |
| Phase 02 P09 | 35m | 2 tasks | 3 files |
| Phase 03 P01 | 39m | 3 tasks | 32 files |
| Phase 03 P02 | 28m | 2 tasks | 18 files |
| Phase 04-reports-hardening P01 | 9min | 2 tasks | 27 files |
| Phase 04-reports-hardening P02 | 14min | 2 tasks | 20 files |
| Phase 04 P05 | 25min | 3 tasks | 5 files |
| Phase 04 P06 | 25min | 2 tasks | 1 files |
| Phase 17 P01 | 3 | 2 tasks | 3 files |
| Phase 17-e2e-suite-overhaul P02 | 6min | 2 tasks | 2 files |
| Phase 17-e2e-suite-overhaul P03 | 12min | 3 tasks | 4 files |
| Phase 17 P04 | 28m | 2 tasks | 5 files |
| Phase 24 P01 | 55min | 2 tasks | 15 files |
| Phase 24 P02 | 20min | 2 tasks | 4 files |
| Phase 24 P03 | 30min+25min | 2 tasks | 6 files |
| Phase 26 P01 | 15m | 2 tasks | 2 files |
| Phase 27 P01 | 20min | 3 tasks | 20 files |
| Phase 27 P02 | 25min | 3 tasks | 21 files |
| Phase 27 P03 | 27min | 3 tasks | 12 files |
| Phase 27 P04 | 40min | 3 tasks | 12 files |
| Phase 27 P05 | 15min | 2 tasks | 8 files |
| Phase 27 P06 | 30min | 2 tasks | 8 files |
| Phase 27 P07 | 165min | 2 tasks | 13 files |
| Phase 32 P01 | 95min | 2 tasks | 47 files |
| Phase 32 P02 | 25min | 2 tasks | 8 files |

## Accumulated Context

### Roadmap Evolution

- Phase 33 added: Login Screen Store Branding — dedicated `storeName`/`storeLogoUrl` fields
  (Supabase Storage upload), large store name + logo on the login screen's left side. Deliberately
  not a reuse of the existing receipt-only `logoDataUrl`/`headerLine2` fields. Captured via
  `/gsd-explore` 2026-09-07.

- Phase 32 added: Brand Entity & Pack-Weight Catalog Attributes — new `brands` table + CRUD,
  `products.brand_id`, and `weight_amount`/`weight_unit` (g/kg/lb/oz) as a catalog/display
  attribute independent of the existing loose-weight-checkout/open-unit system; both filterable in
  product search. Captured via `/gsd-explore` 2026-09-07.

- Phase 31 added: Product Catalog Detail & Photo Upload — reshapes the existing product add/edit
  dialog into a larger view+edit+photo layout, one photo per product in a new Supabase Storage
  bucket. Distinct from Phase 18's barcode-scan-at-checkout peek window (different flow/window).
  Captured via `/gsd-explore` 2026-09-07.

- Phase 30 added: Checkout Continuity, Settings Exit Guard & Cash Keypad — terminal-owned active
  cart and Checkout draft restoration across restarts, idempotent recovery of interrupted payment
  submissions, Save/Discard/Stay protection for dirty Settings forms, and an amount-tendered cash
  keypad. Captured via `/gsd-explore` 2026-09-07.

- Phase 29 added: Local POS Virtual Assistant — optional separate local inference service with
  English/Spanish chat; existing RBAC, approval, and audit gates remain authoritative; supports both
  remote and local-Docker Supabase without cloud AI APIs, has a hard 1 GB install budget, preserves
  checkout responsiveness, and fails closed against abusive requests.

- Phase 28 added: Promotion Management Redesign — scoped out of Phase 27's UAT gap-closure
  (gap `G-27-8`) because it's a genuine feature/design expansion (multi-select scope,
  blank/store-wide promotions, day-of-week/time-of-day recurrence, wizard flow), not a bug
  fix. Five gap-closure plans (27-11..27-15) were drafted and withdrawn (never executed) after
  user feedback that this scope skipped discuss-phase/ui-phase/research. See
  `.planning/debug/promotion-dialog-ux-and-scope-gaps.md` for the existing root-cause
  characterization to start from.

- Phase 26 added: Multi-Customer Deployment — ship this codebase to multiple customers, each with
  an isolated Supabase project and their own release/updater channel. Scoped from spikes 007–010
  (`.planning/spikes/MANIFEST.md`, idea key `multi-customer-deployment`), triggered by CI run
  33587195680 failing with leftover `bar-pos v1.2.0` branding and the discovery that
  `tauri.conf.json`/`.env.production` hardcode one customer (Taj House of Spices) today. Branching
  decision (user-confirmed): core repo stays the single source of truth; each customer gets a thin
  repo for Actions+Releases only, synced from core — a shared repo's `/releases/latest` is proven
  repo-wide, not per-customer (Spike 007), which breaks Tauri's updater across customers. Depends on
  two filed todos: `fix-ci-tauri-build-broker-order.md` (unrelated CI bug blocking `tauri-build`
  today) and `migrate-env-production-to-github-environment.md` (interim Environment-secret migration
  for the existing customer, ahead of the full N-customer machinery). Captured via `/gsd-explore`
  2026-09-01.

- Phase 21 added: Idle Screen Lock — configurable per-terminal inactivity timeout (default 60s)
  locks every screen for every role incl. admin, no transaction exemption; unlocks on any valid
  staff PIN with session identity unchanged; lock+unlock both audit-logged. Requirements LCK-01..04
  captured via `/gsd-explore` 2026-08-30.

- Phase 22 added: Admin PIN Reset (Server-Side Recovery Path) — Edge Function-backed admin PIN
  reset for a staff member who has genuinely forgotten their PIN (no in-app recovery exists today;
  `force_pin_change` requires knowing the current PIN to log in first). Independent of Phase 21.

- Phase 24 added: Tax Configuration (Inclusive/Exclusive Toggle) — global `taxInclusive` toggle in
  Billing settings, fixing a live bug where checkout and the server-side
  `process_direct_sale_atomic` RPC always apply tax additively even though store prices already
  include tax (every sale currently overcharged by the tax amount). Requirements TAX-01..05

- Phase 26 added: Multi-Customer Deployment — ship this codebase to multiple customers, each with
  an isolated Supabase project and their own release/updater channel. Scoped from spikes 007–010
  (`.planning/spikes/MANIFEST.md`, idea key `multi-customer-deployment`), triggered by CI run
  33587195680 failing with leftover `bar-pos v1.2.0` branding and the discovery that
  `tauri.conf.json`/`.env.production` hardcode one customer (Taj House of Spices) today. Branching
  decision (user-confirmed): core repo stays the single source of truth; each customer gets a thin
  repo for Actions+Releases only, synced from core — a shared repo's `/releases/latest` is proven
  repo-wide, not per-customer (Spike 007), which breaks Tauri's updater across customers. Depends on
  two filed todos: `fix-ci-tauri-build-broker-order.md` (unrelated CI bug blocking `tauri-build`
  today) and `migrate-env-production-to-github-environment.md` (interim Environment-secret migration
  for the existing customer, ahead of the full N-customer machinery). Captured via `/gsd-explore`
  2026-09-01.
  captured via `/gsd-explore` 2026-08-31. Grey areas deferred to discuss-phase.

- Phase 23 added: Bank Transfer Payment Tracking — cashier marks a sale awaiting bank transfer
  with a system-generated reference code, admin/manager manually confirms/disputes on `/payments`,
  no auto-confirm path. Independent of Phase 22. Design validated via spikes 002-005
  (`.planning/spikes/`, idea key `bank-transfer-payment-tracking`) 2026-08-31.
  Captured via `/gsd-explore` 2026-08-31 after live-debugging two real PIN-sync production
  incidents on the Vinty Owner account — see `.planning/notes/vinty-owner-login-outage-rca.md`.

- Phase 19 added: Store-Local Durable Printing Service — LAN/VPN-only Windows broker, durable
  acceptance before workflow success, restart-surviving queue, named-printer routing, correlated
  error propagation, and auditable command/event history.

- Phase 20 added: Store Deployment: Signed Elevated Installer — self-signed cert generation +
  Trusted-Root import wired into the NSIS pipeline, installer integrity-check script, real
  `tauri build` + install verification. Remote Supabase bootstrap (180 migrations, real admin
  seed) and the `installMode`/updater-endpoint config fixes were done directly via `/gsd-explore`
  2026-08-27, ahead of this phase's planning.

- Phase 17 added: E2E Suite Overhaul — audit and rewrite `e2e/*.spec.ts` to remove residual bar-pos-domain assertions (pool_tables, rappi, KDS, waitlist, combos, ingredients/recipes, promotions — confirmed still present in 10 files including `e2e/helpers/supabase.ts`), add comprehensive coverage of every current supermarket-pos feature/flow/integration/DB transaction with Indian grocery product fixtures, and switch the browser target from `channel: 'chrome'` to agent-browser's bundled Chrome-for-Testing binary (keeping `@playwright/test` as the runner) with an opt-in Playwright UI-mode dashboard.

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap, 2026-08-19]: v1.3 phase structure set to 3 phases (14-16), following research SUMMARY.md's suggested order (Inventory Analytics Reports → Receipt Designer → Purchase Orders) and matching `granularity: coarse` config (2-4 phases). Phase 14 (INVR-01..04) is zero-new-schema read aggregation, sequenced first as lowest risk. Phase 15 (RCPD-01/02) is a purely additive `receipt_settings` extension carrying the milestone's one genuinely new Rust engineering surface (`GS v 0` thermal logo raster). Phase 16 (PO-01..03) carries the highest schema-design risk (new `purchase_orders`/`purchase_order_items` tables, new RBAC decision) and is sequenced last so `receive_shipment` — which `receive_po_shipment` must delegate to, not duplicate — stays stable and unchanged through the other two phases.
- [Roadmap, 2026-08-19]: v1.2 (Phases 11-13) is paused, not abandoned — only Phase 11 reached the discussion stage before v1.3 took priority. Its ROADMAP.md phase details and REQUIREMENTS.md entries (SEC-03/04, VER-01/02, RCP-01..04) are left intact and resumable; phase numbering for v1.3 continues from 14 rather than reusing 11-13.
- [Roadmap, 2026-08-19]: All v1.3 success criteria are phrased as automatable (Playwright/Vitest assertions, RBAC/RLS tests, fixture-pinned formula tests) per this repo's CLAUDE.md mandatory-automated-testing policy — no `human_needed` terminal states planned for any v1.3 phase.
- [Roadmap, 2026-08-19]: v1.2 phase structure set to 3 phases (11-13), compressed from research SUMMARY.md's 5-phase suggestion per `granularity: coarse` config — Phase 11 merges the guardrail (SEC-04) and RAG-embeddings migration (SEC-03) research phases into one Security Hardening phase (they share `supabase/functions/` and the guardrail-sizing discipline should be applied fresh to the new function), Phase 12 keeps checkout re-confirmation (VER-01/VER-02) as its own frontend-only phase, Phase 13 merges receipt print/email E2E coverage and PDF delivery (RCP-01..04) into one Receipt Delivery & Resilience phase since they share the same files (`receipt-format.ts`, `pos-printer.ts`, `send-receipt-email`) and E2E mocking harness.
- [Roadmap, 2026-08-19]: All 8 v1.2 success criteria are phrased as automatable (Playwright/Vitest assertions, network interception, build-output grep) per this repo's CLAUDE.md mandatory-automated-testing policy — no `human_needed` terminal states planned for any v1.2 phase.
- [Roadmap, 2026-08-16]: v1.1 phase structure set to 6 phases (5-10), following the exact breakdown proposed by research (SUMMARY.md) plus the 8 requirements added after research (SEC-02, DATA-02, SALE-05, QA-01..04, OPS-02): Phase 5 void-order deletion (shrinks shared-file diff surface first), Phase 6 security hardening, Phase 7 backend data integrity, Phase 8 sale/payment wiring + cleanup bundle, Phase 9 reopen-and-edit (sequenced last of the functional work — open wiring question on `RemoveTabItemDialog`/`useRemoveTabItem` may change its own scope), Phase 10 quality debt + ops docs (nothing depends on it).
- [Roadmap, 2026-08-16]: OPS-01 (Tauri identifier) and OPS-02 (backup/DR doc) are the only v1.1 success criteria not verified via Playwright/Vitest — both are inherently config-value/document facts, confirmed by direct inspection, consistent with this project's automated-verification-only policy for actual app behavior.
- [Init]: Pivot in-place (this repo, no fork) — bar-pos maintained separately elsewhere
- [Init]: Reuse generic retail infra (auth/RBAC/caja/payments/barcode/AI vision), strip bar/pool domain layers only
- [Init]: Fold supplier/PO/expiry tracking into Alpha, not deferred to Beta — inventory is the product's core strength
- [Init]: AI invoice intake deferred to Beta — extraction accuracy on real supplier sheets is unproven, shouldn't block Alpha's checkout
- [v1.0 archive]: Full v1.0 decision log (Phases 1-4, D-01 through tip-distribution/margin fixes) preserved in `.planning/milestones/v1.0-phases/` — see those phase directories for the complete record, summarized here only where it affects v1.1 work.
- [v1.0 archive]: tauri.conf.json identifier (`com.yourcompany.barpos`) was explicitly left untouched during Phase 1's rebrand pass (OS-level, out of scope at the time) — now OPS-01 in v1.1, real value decided by the user: `com.tajhouseofspices.supermarketpos`.
- [Phase ?]: E2E tests prefer agent-browser Chrome-for-Testing with Playwright fallback.
- [Phase ?]: Service-role DB helpers are ground-truth reads, not RLS-denial clients.
- [Phase ?]: Phase 17 seed data uses 27 packaged Indian grocery SKUs mirrored between remote and local Supabase seeds.
- [Phase ?]: RLS-denial clients always use an anon-key sign-in and isolated storage key.
- [Phase ?]: Playwright report grouping is derived from spec folders, not filename prefixes.
- [Phase ?]: Checkout E2E uses the Indian catalog and keeps category filtering keyboard-safe.
- [Phase 24]: Fixed a zero-row COALESCE gap in process_direct_sale_atomic's v_tax_inclusive read (Rule 1) so a missing settings row defaults to taxInclusive=true per D-01, matching the pre-existing v_tax_rate fallback pattern
- [Phase 24]: PaymentForm.test.tsx's static useSettings mock converted to a vi.hoisted mutable object for per-test tax-mode overrides; reusable pattern for Plan 02/03
- [Phase 24]: Billing Settings taxInclusive toggle placed inside the same grid cell as the tax-rate input, stacked below it
- [Phase 24]: [Phase 24] process-payment/process-split-payment receipts now decompose tax via shared decomposeTax(), closing the receipt-consistency gap for reopened/split-payment sales
- [Phase 24]: PaymentSchema.method now reuses domain.ts's PaymentMethodSchema instead of a hand-rolled enum, fixing a bank_transfer-triggered /payments page blank-out bug
- [Phase 24]: Phase-close code review (24-REVIEW.md) found a real gap the phase's own plans missed — the `/payments` reprint path (`fetchReceiptDataForPayment`) never got the tax-decompose treatment, contradicting TAX-05 and shipping untested. Fixed in-phase (929406c) rather than deferred, plus a Rappi-tax fix (WR-01, shared `decomposeTaxForMethod` helper) and a taxInclusive-toggle confirmation dialog (WR-03). One item (split-payment per-leg receipts vs. full item list, WR-02) deliberately deferred — pre-existing to Phase 24, needs a receipt-contract design decision.
- [Phase 26]: Phase 26 Plan 01: fixed ci.yml tauri-build broker-build ordering and migrated Taj's .env.production into the taj-house-of-spices GitHub Environment (release.yml now materializes it at build time, deletes at job end); local .env.production deleted after operator confirmed Environment secrets set
- [Phase 27]: Promotions/floor-guard manager-override role re-check fires whenever p_manager_override=true is claimed, not only alongside ad-hoc discount params — closes the below-cost bypass path for T-27-02.
- [Phase 27]: Best-price-wins promotion candidate selection uses one SQL query across all matching active product/category promotions (not a fixed 2-candidate assumption) — handles multiple overlapping promotions on the same target correctly.
- [Phase 27]: DiscountScopeSchema narrowed to 'all' (PROMO-05); PaymentForm.tsx/domain-helpers.ts kept minimally compiling (single fixed button) — full retirement/PIN-gating stays with Plan 27-04 as planned.
- [Phase 27]: Plan 27-02: pages/promotions/index.tsx built as a minimal Task-1 shell then fully replaced by Task-2's wired DataTable+dialog (both real, independently-verifying diffs).
- [Phase 27]: Plan 27-02: added useMutationDeletePromotion + wPanels.json/common.json i18n keys not in the plan's files_modified list — required by the task's own action text and by the actual namespaces HomeDashboard.tsx/StatusBadge.tsx read from.
- [Phase 27]: 27-03: Fixed useCheckoutSale RPC unit_price submission to use raw catalog price instead of discounted display price (Rule 1 bug caused by Task 1's own promotion-pricing wiring).
- [Phase 27]: Fixed process_payment_atomic/process_split_payment_atomic's tab-closing coverage check to account for ad-hoc discounts (Rule 1 bug, pre-existing gap first exposed by Plan 04's PIN-gated ad-hoc discount)
- [Phase 27]: Apply Promotion selector is a client-side UX preview only — process_direct_sale_atomic always independently recomputes the authoritative best-price-wins promotion server-side
- [Phase 27]: PROMO-06: historical discount badge sourced from mapOrderItemRow/groupOrderItems, not a cost_price_snapshot-adjacent mapper (that column is unmapped anywhere in the codebase).
- [Phase 27]: E2E PROMO-06 proof split into 3 independent tests (not one chained scenario) since reopening a sale voids its original payment, making a subsequent refund on the same sale inexpressible in the UI.
- [Phase 27]: PROMO-08: cart-line promotion snapshot stamped only on real price override; reconnect re-evaluation flags changed/vanished promotion-sourced lines via priceConflict, blocking checkout until cashier review
- [Phase 27]: Phase 27 Plan 07: e2e/promotions/ scenario matrix closes PROMO-09 (scope-overlap, timezone-boundary, deleted-mid-cart, loose-weight/open-unit); fixed a real ProductGrid promotion-pricing gap flagged in 27-03, plus 4 genuine Phase-27-caused test regressions and one silently-failing E2E cleanup bug (Plan 27-05) surfaced by the full-suite phase-gate run
- [Phase 31]: `/gsd-verify-work 31` re-verification found this machine's local Supabase instance was missing migration `20260907000001_product_photos_storage.sql` (last applied was `20260904000002`) — an environment-drift gap, not a code defect. Fixed via `npx supabase migration up --local`. Worth checking `npx supabase migration list --local` after any git pull that adds migrations, since a stale local DB produces misleading E2E failures that look like application bugs.
- [Phase 32]: Phase 32 Plan 01: brands table + RLS + CRUD UI, products.brand_id/weight_amount/weight_unit wired into product dialog with both-or-neither validation (D-01..D-09)
- [Phase 32]: Phase 32 Plan 02: brand/weight-unit filter dropdowns added to admin Catalog table (toolbar prop, D-11) and POS checkout grid (secondary selects below CategoryTabs, AND-composed via D-12); CategoryTabs.tsx untouched

### Pending Todos

- `rename-cargo-package-bar-pos.md` — Cargo package still named `bar-pos` internally (cosmetic,
  filed as a low-priority interim todo during Phase 26 discovery, not blocking).

### Blockers/Concerns

- Phase 26 Plan 02 (Multi-Customer Deployment tracer) is incomplete: Task 3 (hardening — add
  `fail-fast: false` to `sync-customers`'s strategy block, an allow-list regex input-validation
  step before any `git`/`gh` command, a real D-08 negative-path proof with the override file
  temporarily removed, and confirming the `test-customer` fixture is excluded once suspended) was
  never executed. `customers/customers.json`'s `test-customer` entry has been manually flipped to
  `suspended` as a safety measure before this push (so it doesn't fire a disposable mirror-push on
  every real release), but the hardening itself is still outstanding — resume Plan 26-02 to finish
  Task 3 before Plan 26-03 (onboarding script) or 26-04 (Taj retrofit) proceed.

- Per project CLAUDE.md: all verification must be automated Playwright E2E/Vitest — no `human_needed` terminal states, no manual UAT checkpoints, for any v1.3 phase.
- Phase 14 planning must pin one documented cost-basis formula per report (valuation vs. historical-cost-snapshot margin in the existing Product Sales report) before implementation — research PITFALLS.md flags inconsistent cost bases as the top risk for these reports not reconciling with existing pages.
- Phase 14 planning must resolve the turnover-averaging-method gap (research Gaps to Address): no periodic-snapshot infrastructure exists yet for accurate period-average inventory value; compute from the movement log going forward and document the limitation for pre-feature periods.
- Phase 15 planning must confirm the `GS v 0` bit-image/raster ESC/POS command implementation approach (dithering, dot-width chunking) — genuinely new Rust code with no existing pattern in this codebase (research flagged for deeper research during planning).
- Phase 15 planning must keep preview and print on one shared formatter (`receipt-format.ts`) — research Pitfall 1 warns a CSS-rendered preview can silently diverge from the fixed-width monospace thermal output.
- Phase 16 planning must resolve two open decisions before implementation: PO write-access RBAC action (reuse `manage_products` vs. new `manage_purchase_orders`) and whether `create-purchase-order` needs its own Edge Function or a plain RLS-gated insert suffices (research Gaps to Address).
- Phase 16 planning must ensure the reorder-suggestion query rounds to `supplier_products` pack/case size (not base units) and flags products with missing pack-size data — research Pitfall 4.
- v1.2 (Phases 11-13) is paused after Phase 11 reached discussion stage — requirements/roadmap remain valid for resumption via a dedicated resume flow; see PROJECT.md Active section for full context.
- v1.0/v1.1 blockers/concerns log (Docker Compose stack switch, pool_tables strip fragility, idempotency gap, Phase 9 wiring question, etc.) archived — all resolved prior to their respective ships.
- Phase 25 (E2E Receipt Print-Mock Consolidation) not yet planned — 4 e2e/receipts/ specs each independently hand-roll a `__TAURI_INTERNALS__` mock missing `__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener`, causing a page-level uncaught-exception flake unrelated to tax/receipt content. Root-caused during Phase 24, fix scoped (extract shared `e2e/helpers/tauriPrintMock.ts` mirroring the Phase 18 `tauriPeekMock.ts` precedent) but not applied.
- `e2e/checkout/barcode-scan-search.spec.ts`'s "category tabs compose with search" test times out waiting for a category-filter button — confirmed pre-existing (untouched since Phase 18, zero Phase 24 file ownership), root cause not yet diagnosed, no phase assigned.

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| v2/Beta requirement | AI-01..04 (AI invoice/sheet intake: PDF/Excel/photo → line items → receiving) | Deferred to a follow-up Beta roadmap/milestone | v1.0 roadmap creation, 2026-08-10 |
| v2 requirement | RCP-05 (full outbound transactional email service beyond existing Resend integration — templates, delivery-status tracking, bounce handling) | Deferred — only if store owner explicitly asks for more than PDF/print/existing-email coverage | v1.2 requirements definition, 2026-08-19 |
| v2 requirement (v1.3 deferred pieces) | Partial PO receiving/backorder tracking; category-level shrinkage/turnover breakdown; locale-aware custom receipt field labels; trend views (week/month-over-month) for valuation/shrinkage/turnover | Deferred until the corresponding v1.3 phase ships and daily use justifies the add — see REQUIREMENTS.md v2 Requirements | v1.3 requirements definition, 2026-08-19 |
| Milestone (paused) | v1.2 Verification & Hardware Hardening (Phases 11-13: SEC-03/04, VER-01/02, RCP-01..04) | Paused after Phase 11 discussion, requirements/roadmap valid for resumption | v1.3 milestone start, 2026-08-19 |
| Out of scope | Counter/hanging scale hardware integration | Revisit after Alpha usage data confirms loose-weight volume | v1.0 init, 2026-08-10 |
| Security hardening (future phase) | `create_order_with_items` and `remove_tab_item` have no server-side role check gating reopened-sale (`tabs.reopened_at IS NOT NULL`) edits — Phase 9's `ManagerPinDialog` gates are client-side UX only. Pre-existing condition (both RPCs predate Phase 9 unguarded), not a Phase 9 regression; accepted per `.planning/verification-overrides.md`. Fix shape: add a conditional `AUTH_FORBIDDEN` role check to both RPCs when the target tab was reopened. | Deferred — not yet scoped to a milestone | Phase 09 verification, 2026-08-18 |
| Out of scope | Batch-level FEFO auto-allocation at sale time | One active expiry/product sufficient for single store | v1.0 init, 2026-08-10 |
| Documentation gap | CLAUDE.md describes stripped bar/pool routes (stale post-pivot) | Route to `/gsd-docs-update` separately — not roadmap scope | v1.1 research, 2026-08-16 |
| Phase 06 checkpoint | 06-01 Task 4: set real `ANTHROPIC_API_KEY` server-only secret + deploy/restart `agent-proxy` | User will do this personally at the end of the project, immediately before shipping to the customer. Code-side SEC-01 work is complete (no client-exposed key/SDK reference); `agent-proxy` will 500 on real calls until this is done. Resume via `06-01-PLAN.md` Task 4. | Phase 06 execution, 2026-08-17 |

## Session Continuity

Last session: 2026-09-11T15:38:42.644Z
Stopped at: Phase 34 complete — all phases complete
Resume file: D:/Projects/Code/supermarket-pos/.planning/phases/33-login-screen-store-branding/33-UI-SPEC.md

## Operator Next Steps

- Resume Plan 26-02 to finish Task 3 (hardening: fail-fast:false, input-validation, D-08 negative-path proof) before continuing to Plan 26-03.
- Run `/gsd-plan-phase 25` to plan E2E Receipt Print-Mock Consolidation (extract the shared `__TAURI_INTERNALS__` mock helper — see Blockers/Concerns above).
- Phase 27 (Promotions & Discount Management) is complete — see `.planning/phases/27-promotions-discount-management/27-VERIFICATION.md`.
