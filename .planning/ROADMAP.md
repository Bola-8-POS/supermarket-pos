# Roadmap: Supermarket POS

## Milestones

- ✅ **v1.0 Alpha** — Phases 1-4 (shipped 2026-08-16)
- ✅ **v1.1 Pre-Launch Hardening** — Phases 5-10 (shipped 2026-08-18)
- ⏸️ **v1.2 Verification & Hardware Hardening** — Phases 11-13 (paused after Phase 11 discussion; requirements/roadmap remain valid for resumption)
- 🚧 **v1.3 Receipt Designer + Inventory Management Expansion** — Phases 14-17 (in progress)
- 🔜 **v1.4 Barcode Scan Product Peek** — Phase 18 (proposed, not started — captured via `/gsd-explore`)
- ✅ **v1.5 Store-Local Durable Printing** — Phase 19 (8/8 plans complete 2026-08-27; Spike 001 validated)
- ✅ **v1.6 Store Deployment: Signed Elevated Installer** — Phase 20 (3/3 plans complete 2026-08-30, incl. gap-closure plan 20-03; DEP-01..04 satisfied)
- 🔜 **v1.11 Promotions & Discount Management** — Phase 27 (proposed, not started — captured via `/gsd-explore`)
- 🔜 **Product Catalog & Store Branding** — Phases 31-33 (proposed, not started — captured via `/gsd-explore` 2026-09-07)

## Phases

<details>
<summary>✅ v1.0 Alpha (Phases 1-4) — SHIPPED 2026-08-16</summary>

- [x] Phase 1: Strip & Rebrand (13/13 plans) — completed 2026-08-16
- [x] Phase 2: Core Direct-Sale Checkout (9/9 plans) — completed 2026-08-16
- [x] Phase 3: Supplier, Receiving & Expiry Tracking (2/2 plans) — completed 2026-08-16
- [x] Phase 4: Reports & Hardening (6/6 plans) — completed 2026-08-16

Full phase details: `.planning/milestones/v1.0-phases/`

</details>

<details>
<summary>✅ v1.1 Pre-Launch Hardening (Phases 5-10) — SHIPPED 2026-08-18</summary>

- [x] Phase 5: Delete void-order feature (3/3 plans) — completed 2026-08-17
- [x] Phase 6: Security hardening (3/3 plans) — completed 2026-08-18
- [x] Phase 7: Backend data integrity (3/3 plans) — completed 2026-08-18
- [x] Phase 8: Sale/payment workflow wiring + cleanup (6/6 plans) — completed 2026-08-18
- [x] Phase 9: Reopen-and-edit a completed sale (3/3 plans) — completed 2026-08-18
- [x] Phase 10: Quality debt & ops documentation (7/7 plans) — completed 2026-08-18

Full phase details: `.planning/milestones/v1.1-ROADMAP.md` · Phase artifacts: `.planning/milestones/v1.1-phases/`

</details>

### ⏸️ v1.2 Verification & Hardware Hardening (Paused)

**Milestone Goal:** Close the remaining verification gaps and security-hardening loose ends left after v1.1's pre-launch pass — checkout mismatch confirmation, receipt delivery coverage (including a new PDF path), and the second half of the client-secret-leak sweep started in v1.1 (SEC-01/SEC-02).

**Status:** Only Phase 11 reached the discussion stage before v1.3 took priority. Requirements and phase structure below remain valid for resumption — nothing here is deprecated, it's queued behind v1.3. Discussion checkpoint archived at `.planning/milestones/v1.2-phases/`.

- [ ] **Phase 11: Security Hardening (Server-Side Secrets & Cost Guardrails)** - Move RAG-embeddings calls server-side and cap `agent-proxy` request size/`max_tokens`
- [ ] **Phase 12: Checkout Verification (Scan & Search Confirmation)** - Non-blocking confirmation only on ambiguous barcode/search matches, happy path unchanged
- [ ] **Phase 13: Receipt Delivery & Resilience (Print, Reprint, Retry, PDF)** - Reprint, printer-failure resilience with retry, and new PDF receipt delivery

### 🚧 v1.3 Receipt Designer + Inventory Management Expansion (In Progress)

**Milestone Goal:** Let the owner customize receipt layout/branding, and expand inventory management with purchase orders/reordering plus deeper reporting (valuation, shrinkage/waste, expiry-loss, turnover).

- [x] **Phase 14: Inventory Analytics Reports (Valuation, Shrinkage/Waste, Expiry-Loss, Turnover)** - Four read-only report tabs over existing inventory/stock-movement data, zero new schema (completed 2026-08-19)
- [x] **Phase 15: Receipt Designer (Layout, Branding & Logo Printing)** - Editable header/footer/toggles with print-accurate live preview, plus thermal logo printing via new Rust `GS v 0` support (completed 2026-08-23)
- [x] **Phase 16: Purchase Orders & Reordering** - PO creation, low-stock-seeded draft generation, and full receiving delegated to `receive_shipment` (completed 2026-08-24)

### Phase 21: Idle Screen Lock

**Goal:** Any screen, any role (incl. admin) locks behind a PIN prompt after a configurable
inactivity timeout — default 60s, per-terminal (`receipt_settings`-style), no exemption for
in-progress transactions. Unlock accepts any valid staff PIN; active session identity is
unchanged (screen lock, not re-login). Lock and unlock events both write to `audit_logs`,
recording the session owner and (for unlock) the unlocking staff member. Needs: global
idle-detection hook, lock overlay component (PIN-entry, reuse `ManagerPinDialog` pattern),
per-terminal timeout migration + Settings UI (`manage_settings`-gated), audit_logs writes,
Playwright E2E coverage per this repo's no-manual-UAT policy.
**Requirements**: LCK-01, LCK-02, LCK-03, LCK-04
**Depends on:** Phase 20
**Plans:** 2/2 plans complete

Plans:
**Wave 1**

- [x] 21-01-PLAN.md — Tracer: terminal_lock_settings schema+push, audit actions, idle-detect -> overlay -> cross-staff PIN-unlock -> audit_logs end-to-end, then LockSettingsTab admin-only Settings UI (LCK-01..04)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 21-02-PLAN.md — Hardening: Pitfall 3 barcode-scanner bypass close + D-01 mid-transaction no-exemption E2E

**UI hint**: yes

### Phase 22: Admin PIN Reset (Server-Side Recovery Path)

**Goal:** A manager/admin can reset a staff member's PIN from the Staff page even when that staff
member has genuinely forgotten their current PIN and cannot log in at all — closing a real recovery
gap discovered 2026-08-30/31 (see `.planning/notes/vinty-owner-login-outage-rca.md`). Today's only
admin action, "Force PIN Change" (`force_pin_change` RPC), only flags `must_change_pin=true`; it never
touches the credential, so it requires the staff member to already know and successfully log in with
their *current* PIN before the forced-change screen ever appears. A genuinely forgotten PIN has no
in-app recovery path at all right now — the only fix today is someone with direct Supabase
project/database access resetting `auth.users.encrypted_password` (and `profiles.pin` — see Incident 2/3
in the RCA note on why both stores must be written atomically) by hand, which doesn't scale past a
single pilot store with a developer on call.

The fix must not embed the Supabase service-role key in the Tauri client (forbidden pattern, `CLAUDE.md`
"Service-role key in renderer") — the reset must go through a server-side Supabase Edge Function that
holds the service-role key, verifies the caller's role from their JWT (manager/admin only), then calls
`admin.updateUserById(target, { password: newPin })` and syncs `public.profiles.pin` in the same
operation, audit-logged (`record_audit`, action `permission.admin_pin_reset` or similar). Needs its own
threat model given it's a privileged cross-account credential write — likely a manager-PIN confirmation
gate before the reset fires, mirroring the existing `ManagerPinDialog` pattern used elsewhere in this
app for other privileged actions.

**Requirements**: PINRST-01, PINRST-02, PINRST-03, PINRST-04, PINRST-05, PINRST-06, PINRST-07, PINRST-08
**Depends on:** Nothing (independent auth/security surface; does not depend on Phase 21's idle-lock UI)
**Plans:** 1/1 plans executed

Plans:
**Wave 1**

- [x] 22-01-PLAN.md — Tracer: admin-reset-pin edge function (D-01/02/04/06/08 + Pitfall-1 dual-write handling) + client contracts + AdminResetPinDialog (D-03/D-07) + StaffDashboard wiring, full happy-path E2E; then D-01 negative/D-06 inactive-target hardening; then D-08 self-target E2E

**UI hint**: yes

### Phase 23: Bank Transfer Payment Tracking

**Goal:** Cashier marks a completed sale as awaiting bank transfer with a system-generated reference code; admin/manager manually confirms or disputes it against their own banking app on the `/payments` page. Replaces the paper name+phone reconciliation slip with a fully audited state machine — no auto-confirm path anywhere.
**Requirements**: BTP-01, BTP-02, BTP-03, BTP-04, BTP-05, BTP-06, BTP-07, BTP-08, BTP-09, BTP-10
**Depends on:** Nothing (independent payments/RBAC surface — does not depend on Phase 22's admin-PIN-reset work)
**Plans:** 5/5 plans complete

Validated via spikes 002–005 (`.planning/spikes/`, idea key `bank-transfer-payment-tracking`):

- Reference code: 6-digit payload + Luhn check digit (7 digits total), targets SPEI's Banxico-standard `referencia numerica` field.
- State machine: cashier marks `pending` → manager+/admin `confirmed`/`disputed`, mirrors the existing `process_refund` RBAC-gate + audit-log pattern. Always a manual tap — no auto-confirm, even for unambiguous matches.
- UI: "Bank Transfers" tab on the existing `/payments` page, listing pending/confirmed/disputed sales with a CSV export for end-of-day reconciliation.
- Explicitly out of scope for this phase: bank statement import (never happens), and PSP auto-reconciliation (Conekta/Clip) — flagged in Spike 002 as a viable future phase, not this one.

Plans:
**Wave 1**

- [x] 23-01-PLAN.md — Tracer (backend): payment_method enum + bank_transfers schema/RLS, Luhn PL/pgSQL port, process_payment_atomic/process_direct_sale_atomic extension, confirm_transfer_payment/dispute_transfer_payment RPCs, RBAC + audit registration, Zod types — proven via a real RPC integration test (BTP-01, BTP-02, BTP-03, BTP-04, BTP-05, BTP-06, BTP-09, BTP-10)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 23-02-PLAN.md — Checkout wiring: PaymentForm "Bank Transfer" method, useCheckoutSale processor, edge-function contract extension, E2E proof of mark-pending (BTP-02)

**Wave 3** *(blocked on Wave 2 completion — shares featOrders.json)*

- [x] 23-03-PLAN.md — Confirm/dispute business logic: client Luhn util, useConfirmTransfer/useDisputeTransfer hooks, entity query hooks, ConfirmTransferDialog/DisputeTransferDialog (BTP-01, BTP-03, BTP-04)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 23-04-PLAN.md — BankTransfersList widget + Bank Transfers tab on /payments + the phase's core tracer E2E (checkout mark-pending → manager confirm, plus dispute/Luhn-mismatch/RBAC-denial coverage) (BTP-03, BTP-04, BTP-05, BTP-07, BTP-09)

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 23-05-PLAN.md — CSV export (Tauri-native, rowsToCsv) + get_caja_report bank-transfer revenue breakout (BTP-08, BTP-10)

**UI hint**: yes

### Phase 24: Tax Configuration (Inclusive/Exclusive Toggle)

**Goal:** Checkout and every server-side/receipt tax calculation are mode-aware — when `taxInclusive`
is on (the new default), tax is decomposed backward from already-inclusive catalog prices instead of
added on top, fixing the live overcharge bug; when off, today's additive math is unchanged. Both
`process_direct_sale_atomic` and all three payment-completing edge functions apply the same formula as
the client, and every receipt (thermal/PDF/email) shows a real decomposed subtotal+tax+total.
**Requirements**: TAX-01, TAX-02, TAX-03, TAX-04, TAX-05
**Depends on:** Phase 23
**Plans:** 4/4 plans complete

Plans:
**Wave 1**

- [x] 24-01-PLAN.md — Tracer: taxInclusive schema field, mode-aware process_direct_sale_atomic
  migration (17-arg signature preserved), mode-aware PaymentForm.tsx calc, _shared/tax.ts +
  process-direct-sale receipt fix, ReceiptDataSchema/receipt-format.ts tax line, proven via a real
  E2E checkout (TAX-01..05)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 24-02-PLAN.md — BillingSettingsTab admin toggle for taxInclusive, persistence-tested (TAX-01)
- [x] 24-03-PLAN.md — process-payment/process-split-payment edge functions wired to the shared
  decomposeTax helper, closing the reopen-tab/split-payment receipt-consistency gap (TAX-03, TAX-04,
  TAX-05)

**Wave 3** *(blocked on Wave 1/2 completion)*

- [x] 24-04-PLAN.md — e2e/helpers/tax.ts extraction + re-point 8 hardcoded-additive-formula specs
  (2 more than RESEARCH.md's original list), unit-test fixture hardening, full-suite phase-gate proof
  (TAX-02, TAX-03, TAX-04, TAX-05)

**UI hint**: yes

### Phase 25: E2E Receipt Print-Mock Consolidation

**Goal:** Extract the duplicated `__TAURI_INTERNALS__` print mock in `e2e/receipts/reprint.spec.ts`,
`pdf-delivery.spec.ts`, and `print-retry-resilience.spec.ts` into one shared
`e2e/helpers/tauriPrintMock.ts`, mirroring `e2e/helpers/tauriPeekMock.ts`'s existing precedent — and
add the `__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener` shim that `tauriPeekMock.ts` already
carries but these three hand-rolled copies don't. That gap causes an uncaught `Cannot read
properties of undefined (reading 'unregisterListener')` page error that currently fails 4 tests:
reprint's split-payment-receipt test, pdf-delivery's Download PDF test, and print-retry-resilience's
RCP-02/RCP-04 tests. Root cause and fix are already confirmed, not open questions — see Phase 24's
`deferred-items.md` and the identical shim already applied once before to fix a broker-submission E2E
mock. This phase is mechanical extraction plus a proven 5-line addition, not new investigation.
**Requirements**: none (test-infra debt, not a product requirement)
**Depends on:** Nothing (isolated to `e2e/receipts/` and `e2e/helpers/`)
**Plans:** 0 plans

Plans:

- [ ] TBD (run /gsd-plan-phase 25 to break down)

### Phase 26: Multi-Customer Deployment

**Goal:** Ship this same supermarket-pos codebase to multiple customers, each with a fully isolated
Supabase project and their own genuine `/releases/latest` update channel (a multi-**instance**
deployment model, not a shared-DB tenant_id retrofit). Core repo stays the single source of truth;
each customer gets a full-mirror repo (Actions + Releases only), synced from core on every release
and gated by an active/suspended manifest; per-customer Tauri identity (`identifier`/`publisher`/
`updater.endpoints`/icon) is merged at build time via a second `tauri-action --config` argument, with
a fail-loud gate on any missing/malformed override; a scripted + documented onboarding path exists for
customer N+1; and Taj House of Spices (the one real existing customer) is retrofitted into this model
via a parallel-run cutover with zero window where their live till has no working update path.
**Requirements**: D-01 .. D-18 (see `.planning/phases/26-multi-customer-deployment/26-CONTEXT.md`) —
no formal `REQUIREMENTS.md` REQ-IDs for this phase; this is a CI/CD-only phase (no application
frontend surface, confirmed by the deterministic `ui.plan-gate` check) traced entirely via
CONTEXT.md's locked decision IDs, matching the D-number-traceable precedent used when a phase has no
SPEC.md (Phase 22/23).
**Depends on:** Phase 25 (also depends on two pre-existing filed todos landing first per D-18:
`fix-ci-tauri-build-broker-order.md`, `migrate-env-production-to-github-environment.md` — sequenced
as Plan 26-01)
**Plans:** 6/6 plans executed

Plans:
**Wave 1**

- [x] 26-01-PLAN.md — Prerequisites (D-18): fix ci.yml's broker build order, migrate Taj's
  `.env.production` into a GitHub Environment

**Wave 2** *(blocked on Wave 1 — shares release.yml)*

- [x] 26-02-PLAN.md — Tracer: customers.json manifest + active-customer gating + mirror-push +
  dual `--config` merge + D-08 fail-loud gate, proven end-to-end against one disposable test
  customer (D-01..D-08)

**Wave 3** *(blocked on Wave 2)*

- [x] 26-03-PLAN.md — scripts/onboard-customer.ps1 (idempotent repo/Environment/PAT/override/manifest
  setup) + docs/onboarding-new-customer.md runbook (D-09..D-14)

**Wave 4** *(blocked on Wave 3)*

- [x] 26-04-PLAN.md — Taj retrofit: byte-identical tauri.override.json + icons, registered active in
  customers.json, real signed installer built through the new path — old path left untouched (D-15,
  D-16, D-17)

**Wave 5** *(blocked on Wave 4)*

- [x] 26-05-PLAN.md — Real two-hop update-cycle proof: transition release (endpoint-only bump) through
  the old path, then a follow-up release through the new path — a controlled test client migrates
  channels with zero manual reinstall (D-16, D-17)

**Wave 6** *(blocked on Wave 5 — cutover completion)*

- [x] 26-06-PLAN.md — Retirement: strip tauri.conf.json to a generic placeholder, remove the old
  publish-tauri job, re-verify the D-08 gate against the final placeholder config (D-16, D-17)

**UI hint**: no

### Phase 27: Promotions & Discount Management

**Goal:** Promotions/discounts can be scoped to a product, a category, or a subcategory (a category
row with `parentId` set — no new hierarchy needed), multiple can qualify on one line item resolved
best-price-wins, and one condition type auto-triggers off proximity to a product's expiry date
(reusing the existing configurable near-expiry threshold, default 14 days). A qualifying item shows
its discounted price live the moment it's scanned/added to the cart (client display only — the
existing `process_direct_sale_atomic` RPC remains the sole price authority at checkout, extended to
recompute promotions server-side rather than trust the client). At the payment screen, a cashier can
apply an existing active promotion to a sale; an ad-hoc/custom discount requires a manager PIN,
mirroring the existing refund-PIN pattern. Every applied promotion/discount is snapshotted per line
item (promotion id, rate, computed amount) at sale time, so a later refund/reopen restores the exact
historical discount even if the promotion itself has since changed or been deleted, and the existing
cost-snapshot margin report stays accurate against the discounted price, not list price. A floor guard
prevents any combination of discounts from dropping the sale price below recorded cost.

Batch/lot-level expiry precision (the literal "this specific shipment's batch expires in 2 weeks") is
explicitly out of scope — `inventory.expiry_date` is a single column overwritten on each new
receiving, with no per-lot tracking anywhere in the schema today. This phase's expiry-proximity
trigger keys off that single per-product expiry date instead; see
`.planning/seeds/batch-lot-expiry-tracking.md` for the deferred batch-tracking capability. See also
`.planning/notes/promotions-prior-art-and-dead-fields.md` for why the bar-pos-era promotions engine
(dropped in Phase 1) should not be reused, and for a stale-dead-field trap in `domain.ts`
(`happyHourStart`/`happyHourEnd`/`happyHourPrice`, `isCombo`/`comboEligible`/`comboPriceOverride`) that
planning should not anchor on.

**Requirements**: PROMO-01, PROMO-02, PROMO-03, PROMO-04, PROMO-05, PROMO-06, PROMO-07, PROMO-08, PROMO-09
**Depends on:** Nothing (new domain entity; touches checkout/payment RPCs and `order_items` but no other phase blocks it)
**Plans:** 10/10 plans complete

Plans:
**Wave 1**

- [x] 27-01-PLAN.md — Tracer: `promotions` schema+RLS+RBAC+order_items snapshot cols+audit trigger,
  `process_direct_sale_atomic` extension (best-price-wins recompute, expiry-proximity trigger, floor
  guard, ad-hoc discount unlock), `entities/promotion` model layer, proven via a real RPC integration
  test (PROMO-01, PROMO-02, PROMO-03, PROMO-04, PROMO-07)

**Wave 2** *(blocked on Wave 1 completion — no file overlap between 02/03/04, parallel)*

- [x] 27-02-PLAN.md — Admin `/promotions` CRUD page, route guard, Home dashboard tile, expiry-discount
  rate settings field (PROMO-01, PROMO-02)

- [x] 27-03-PLAN.md — Live scan-time discount display across every add-to-cart path + cart-line
  discount badge (PROMO-03)

- [x] 27-04-PLAN.md — Payment screen: PIN-gated ad-hoc discount (retiring `pool_only`/
  `consumptions_only`), "Apply Promotion" selector, below-cost override retry (PROMO-05, PROMO-07)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 27-05-PLAN.md — Snapshot survives refund/reopen/promotion-deletion; margin report proven
  correct against discounted price with zero report-code changes (PROMO-06)

- [x] 27-06-PLAN.md — Offline promotion-conflict flag: cart-line snapshot + reconnect re-evaluation,
  never silently re-priced (PROMO-08)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 27-07-PLAN.md — Full `e2e/promotions/` scenario matrix (scope overlap, timezone boundary,
  promotion-deleted-mid-cart, loose-weight/open-unit) + phase-gate full suite run (PROMO-09)

**UI hint**: yes

### Phase 28: Promotion Management Redesign

**Goal:** Replace the basic single-step promotion dialog shipped in Phase 27 with a properly
scoped creation/edit flow. A promotion can target multiple products from multiple categories
in one row (not exactly one product OR one category), can be blank/store-wide (a generic
flat-discount promotion with no target restriction, e.g. "Friends & Family 20% off"), can
recur on a day-of-week and/or time-of-day schedule (e.g. every day 4-6PM) in addition to a
plain date range, and presents forward-looking validity options (the current reused Reports
`DateRangePicker` only offers backward-looking presets — Today/Yesterday/Last 7 Days/This
Month — which is nonsensical for a promotion that starts in the future). The creation flow is
a dedicated screen (not a modal dialog), likely a multi-step wizard, that validates
completeness on exit rather than only at a single final Save click.

This is a genuine feature/design expansion, not a bug fix — it was deliberately deferred out
of Phase 27's UAT gap-closure (`.planning/phases/27-promotions-discount-management/27-UAT.md`
gap `G-27-8`) specifically so it gets a real `/gsd-discuss-phase` + `/gsd-ui-phase` +
research pass instead of being retrofitted as a same-phase gap plan. Two source documents
already exist and should be read before discussion starts — they characterize the current
code precisely (exact file:line citations) and should save re-investigation, but do not
substitute for design decisions still to be made (wizard step boundaries, exact recurrence
UX/copy, exactly how multi-select should look):

- `.planning/debug/promotion-dialog-ux-and-scope-gaps.md` — root-cause investigation of the
  current dialog's gaps (schema XOR constraint blocking multi-target/blank promotions, reused
  Reports `DateRangePicker` with no forward-looking presets, no recurrence columns anywhere,
  single-step modal with only final-click validation).

- `.planning/phases/27-promotions-discount-management/27-UAT.md` (gap `G-27-8`) — the verbatim
  user feedback that triggered this phase, plus a `missing:` list of concrete capabilities.

Note the stuck-at-0 percent-field bug reported alongside this feedback was a separate, narrow
bug (number-typed state + per-keystroke coercion) and was fixed directly as a Phase 27 gap
plan (`27-10-PLAN.md`) — it is NOT part of this phase's scope.

Recurrence changes what "active" means for a promotion and will touch the pricing engine
built in Phase 27 (`evaluateBestPromotion`, `process_direct_sale_atomic`'s
`now() BETWEEN starts_at AND ends_at` check) — treat this as a real design/research question
(timezone handling, interaction with the existing best-price-wins pool), not just a UI
addition.

**Requirements**: D-01 .. D-12 (see `.planning/phases/28-promotion-management-redesign/28-CONTEXT.md`)
plus the folded todo `audit-manager-pin-identity-in-remaining-rpcs.md` — no formal `REQUIREMENTS.md`
REQ-IDs for this phase; traced entirely via CONTEXT.md's locked decision IDs, matching the
D-number-traceable precedent used when a phase has no SPEC.md (Phase 22/23/26).
**Depends on:** Phase 27
**Plans:** 5/5 plans complete

Plans:
**Wave 1** (parallel — no file overlap)

- [x] 28-01-PLAN.md — Tracer: `promotion_targets` junction table + recurrence columns +
  `needs_review` backfill migration, `process_direct_sale_atomic` scope+recurrence extension,
  `evaluateBestPromotion` multi-target/recurrence mirror (TDD), minimal single-step wizard entry
  replacing `PromotionFormDialog` end-to-end (D-01, D-02, D-03, D-04, D-05, D-06, D-11, D-12)

- [x] 28-02-PLAN.md — Manager-PIN identity audit (folded todo): re-key
  `process_refund`/`reopen_tab`/`edit_paid_tab` to `profiles.pin = p_manager_pin` (mirrors the
  proven G-27-13 fix), harden `close_tab`'s zero-check gap, thread `staff.pin` through all three
  dialogs, E2E proof

**Wave 2** *(blocked on Wave 1 — shares the wizard page/state hook)*

- [x] 28-03-PLAN.md — Scope step: new `MultiSelectPicker` shared/ui primitive
  (cmdk-based, product+category multi-select) + `StepScope.tsx` wiring (D-01 UI surface, D-08
  partial)

**Wave 3** *(blocked on Wave 2)*

- [x] 28-04-PLAN.md — Validity & Recurrence + Review steps: forward-looking `DateRangePicker`
  presets, day-of-week/time-of-day recurrence UI, full 4-step `isStepValid` gate (TDD), Review
  step's live computed-price preview, edit-mode free step navigation (D-04, D-05, D-06, D-07,
  D-08, D-09, D-10)

**Wave 4** *(blocked on Wave 1-3 — phase gate)*

- [x] 28-05-PLAN.md — Full-suite regression fix (10 pre-existing promotion-fixture E2E specs
  updated for the new schema/wizard) + `npm run test:e2e` phase-gate close-out

**UI hint**: yes

### Phase 29: Local POS Virtual Assistant

**Goal:** An optional, separately installed, loopback-only local assistant lets authenticated cashiers, managers, and admins complete POS operations through English or Spanish chat. Every proposed operation is re-authorized by the existing RBAC rules, previewed, and approved at the proper level; checkout-critical work remains responsive; the assistant supports both remote Supabase and local Docker Supabase without cloud AI APIs, remains under a 1 GB installed budget, and fails closed against abuse.
**Requirements**: TBD
**Depends on:** Phase 28
**Plans:** 0 plans

Plans:

- [ ] TBD (run /gsd-plan-phase 29 to break down)

### Phase 30: Checkout Continuity, Settings Exit Guard & Cash Keypad

**Goal:** An unfinished terminal sale survives application restarts and returns any authenticated
cashier to the same active cart and, when applicable, the same pre-submission Checkout state. A
payment interrupted after submission is reconciled under its original idempotency identity before
the cashier can retry. Every editable Settings tab protects dirty values with Save/Discard/Stay on
in-app navigation and Tauri close, and cash Checkout gains an accessible amount-tendered keypad by
reusing the existing keypad interaction pattern.
**Requirements**: CART-01, CART-02, CART-03, CART-04, SET-01, SET-02, KEYPAD-01
**Depends on:** Nothing (independent client-state and POS usability work; it can proceed while Phase
29 remains unplanned)
**Plans:** 0 plans

Plans:

- [ ] TBD (run /gsd-plan-phase 30 to break down)

**UI hint**: yes

### Phase 31: Product Catalog Detail & Photo Upload

**Goal:** Clicking a product in Inventory/Catalog opens the existing add/edit dialog reshaped into a larger view+edit+photo layout (tabbed/sectioned) instead of the current small add/edit-only form, and a product can carry one photo stored in Supabase Storage (not client-local/base64). Distinct from Phase 18's separate barcode-scan-at-checkout peek window — different trigger, different flow, unaffected by this phase.
**Requirements**: PCAT-01, PCAT-02, PCAT-03, PCAT-04
**Depends on:** Nothing (Inventory/Catalog admin-side work, independent of Phase 29/30's POS/checkout scope)
**Plans:** 6/6 plans complete

Plans:
**Wave 1**

- [x] 31-01-PLAN.md — Storage tracer: private `product-photos` bucket, RLS write policies, `photo_path` column, resolver, upload hook, and one end-to-end upload (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 31-02-PLAN.md — Dialog reshape: one `ProductDetailDialog` with a Details/Photo/Links vertical rail, stock strip, create-then-stay, error-tab navigation, dirty-close guard (wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 31-03-PLAN.md — Catalog integration: batch signed-URL thumbnails, row-click open, propagation stops on every inline editor (wave 3)
- [x] 31-04-PLAN.md — Photo capture UX: drag-and-drop, clipboard paste, replace, confirmed remove, full loading/error/offline state matrix (wave 3)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 31-05-PLAN.md — PCAT-04 completion: Storage RLS denial proof, Phase 18 peek-window-unaffected proof, visual-regression backstops (wave 4)

**Wave 5** *(blocked on Wave 4 completion — gap closure)*

- [x] 31-06-PLAN.md — Gap closure: join `inventory(quantity_on_hand, low_stock_threshold)` into `useProductsForManagement`/create-mutation refetch (31-VERIFICATION.md CR-01), reject non-integer `unitsPerPackage` entry (31-REVIEW.md WR-01), proven by new PM16-PM18 E2E assertions (wave 5)

### Phase 32: Brand Entity & Pack-Weight Catalog Attributes

**Goal:** Products can be assigned a brand (new `brands` table with its own CRUD, same pattern as Categories) and a catalog pack-size attribute (`weight_amount` + `weight_unit`: g/kg/lb/oz) — independent of the existing loose-weight-at-checkout/open-unit system. Both are filterable in product search/catalog browsing.
**Requirements**: BRND-01, BRND-02, BRND-03, BRND-04, BRND-05
**Depends on:** Phase 31 (extends the same product edit dialog with brand-select and weight fields)
**Plans:** 2/2 plans complete

Plans:
**Wave 1**

- [x] 32-01-PLAN.md — Tracer: brands table+RLS+CRUD UI, ProductSchema brand/weight fields + both-or-neither refine, brand+weight fields wired into the product dialog (BRND-01, BRND-02, BRND-03, BRND-05)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 32-02-PLAN.md — Brand/weight-unit filter dropdowns on both the admin Catalog table and the POS checkout grid (BRND-04, BRND-05)

**UI hint**: yes

### Phase 33: Login Screen Store Branding

**Goal:** The login screen shows the store's name and a large logo on the left side of the screen, sourced from new dedicated `storeName`/`storeLogoUrl` settings fields (Supabase Storage upload, same pattern as Phase 31's product photo) rather than the small receipt-only logo/header fields.
**Requirements**: STORE-01, STORE-02, STORE-03
**Depends on:** Nothing (settings + login-page work; shares the Phase 31 upload pattern but not its code)
**Plans:** 3/3 plans complete

Plans:
**Wave 1**

- [x] 33-01-PLAN.md — Tracer: rename `barName`→`storeName` repo-wide, add the anon settings read, render the real store name on the login screen

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 33-02-PLAN.md — `store-branding` Storage bucket + RLS, and the validate/downscale/upload/link pipeline

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 33-03-PLAN.md — Settings logo upload control, login hero logo, and STORE-03 functional/RLS/visual coverage

### Phase 34: Tutorial Video Generation

**Goal:** Playwright/Chromium-driven HD video walkthroughs exist under `tutorial-videos/` — one video per `e2e/` domain folder plus one long full end-to-end walkthrough — in es-MX and en-US, each action paced with a 2-4s hold so the recording is watchable as a customer-facing training runbook, converted to MP4 via ffmpeg, ready to embed on the product website and hand to customers for staff training.
**Requirements**: VIDEO-01, VIDEO-02, VIDEO-03, VIDEO-04, VIDEO-05, VIDEO-06
**Depends on:** Nothing (independent tooling/documentation phase; does not touch app code)
**Plans:** 5/6 plans executed

Plans:
**Wave 1**

- [x] 34-01-PLAN.md — Tracer: pacing/i18n-selector/locale-seeding harness helpers, `playwright.tutorial.config.ts`, `scripts/tutorial-videos-convert.ts`, proven end-to-end on the checkout domain in es-MX (VIDEO-01, VIDEO-02, VIDEO-04, VIDEO-05, VIDEO-06)

**Wave 2** *(blocked on Wave 1 — parallel, no file overlap)*

- [x] 34-02-PLAN.md — Domain videos: inventory, suppliers, payments (VIDEO-02, VIDEO-04, VIDEO-06)
- [x] 34-03-PLAN.md — Domain videos: staff/rbac, caja, reports (VIDEO-02, VIDEO-04, VIDEO-06)
- [x] 34-04-PLAN.md — Domain videos: promotions, receipts, purchase-orders (VIDEO-02, VIDEO-04, VIDEO-06)
- [x] 34-05-PLAN.md — Domain videos: settings (real locale-switch UI), audit (VIDEO-02, VIDEO-04, VIDEO-06)

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 34-06-PLAN.md — Full end-to-end business-day walkthrough + full bilingual double-run + final ffmpeg conversion + phase-gate file-count proof (VIDEO-03, VIDEO-04, VIDEO-05, VIDEO-06)

**UI hint**: no

### 🔜 v1.4 Barcode Scan Product Peek (Proposed)

**Milestone Goal:** Scanning a barcode on `/pos` opens a separate detached Tauri window showing full product detail (name, size/unit, photo, price, inventory, SKU, barcode) with a qty/weight input, so a cashier can inspect an item before committing it to the cart.

**Status:** Requirements captured via `/gsd-explore` 2026-08-26. Not yet discussed/planned — run `/gsd-discuss-phase 18` when ready to pick this up.

- [ ] **Phase 18: Barcode Scan Product Peek Window** - Separate Tauri window triggered by `/pos` barcode scan, qty/weight entry, existing stock/expiry guards, replace-on-rescan behavior

### 🔜 v1.5 Store-Local Durable Printing (Proposed)

**Milestone Goal:** Route every print command from mobile, desktop, and POS clients through one
authenticated LAN/VPN-only broker that durably accepts, audits, retries, and delivers work to named
Windows printers after the originating application closes.

**Status:** Requirements and architecture captured via `/gsd-explore` 2026-08-26. Spike 001
(`.planning/spikes/001-windows-print-broker/`) VALIDATED the Windows Service + SQLite ledger + WinSpool
architecture against real hardware 2026-08-26. Phase 19 planned 2026-08-27 (8 plans across 6 waves) and
completed 2026-08-27 (8/8 plans; goal-backward verification passed with one gap closed post-verification
— firewall rule remoteip scoping, see 19-VERIFICATION.md). Cross-machine LAN/VPN reachability remains an
explicit backstop: `scripts/verify-lan-broker-reachability.ps1` exists but has not been run against real
second-machine hardware (no such hardware available in the planning/execution environment).

- [x] **Phase 19: Store-Local Durable Printing Service** (8/8 plans) - Harden every existing caller and
  add a durable, auditable Windows print broker with fail-fast acceptance and named-printer routing —
  completed 2026-08-27

### 🔜 v1.6 Store Deployment: Signed Elevated Installer (Proposed)

**Milestone Goal:** Ship a seamless, elevated, self-signed installer for the store machine, wired to
the remote Supabase project.

**Status:** Remote DB bootstrapped (180 migrations applied), real admin account seeded, NSIS
`installMode: perMachine` and updater endpoint already fixed via `/gsd-explore` 2026-08-27 — see
`.planning/notes/store-deployment-installer-decisions.md`. Remapped 2026-08-28 (local code/DB/edge
functions vs. remote): DB schema is current (180/180 migrations match, nothing new since the
2026-08-27 push), but **zero of the app's 12 edge functions are deployed to the remote project and
zero secrets are set** — this is now the phase's biggest gap, bigger than the installer packaging
work it was originally scoped for. Not yet planned — run `/gsd-plan-phase 20` when ready.

- [x] **Phase 20: Store Deployment: Signed Elevated Installer** (DEP-01..04) — completed 2026-08-30 (3/3
  plans: 20-01, 20-02, 20-03 gap-closure). All 12 Supabase Edge Functions deployed and reachable on the
  remote project, all 5 required secrets set (`ANTHROPIC_API_KEY` is a store-owner-approved placeholder,
  pending real key before launch); self-signed cert generation + Authenticode signing + Trusted-Root
  import wired into the NSIS build pipeline and CI release workflow; `scripts/verify-installer-integrity.ps1`
  proves broker.exe/cert/baked-URL/printer-hooks are all present; a real `npm run tauri build` produced a
  signed installer with a matching Authenticode thumbprint. Gap-closure plan 20-03 added an automated
  remote-backend E2E smoke spec (login → shipment receiving → checkout+print → staff creation → teardown)
  per this repo's mandatory-automated-testing policy, which also surfaced and fixed two live production
  bugs: a `payments.tip_amount` NOT NULL migration-sync gap, and missing CORS headers on 6 edge functions.
  Full detail: `.planning/phases/20-store-deployment-installer/20-VERIFICATION.md`.

## Phase Details

### Phase 11: Security Hardening (Server-Side Secrets & Cost Guardrails)

**Goal**: Outbound AI API calls (Anthropic vision/chat and OpenAI RAG embeddings) run entirely server-side with enforced cost/size limits, closing the client-secret-exposure and unbounded-cost gaps left open after v1.1's SEC-01 migration.
**Depends on**: Nothing (independent of Phase 12/13; backend-only)
**Requirements**: SEC-03, SEC-04
**Success Criteria** (what must be TRUE):

  1. A production build's `dist/` bundle contains no `VITE_OPENAI_API_KEY` value and no `openai` client SDK reference — verified by an automated build-output grep, mirroring the acceptance check already used for SEC-01.
  2. RAG-embedding requests are issued through a new Bearer-authenticated Supabase Edge Function rather than directly from the client to OpenAI — verified by an automated test asserting no client-side network request reaches `api.openai.com`.
  3. An `agent-proxy` (and the new embeddings function) request exceeding the configured `max_tokens` ceiling or request-body-size cap is rejected with an actionable, non-generic error — verified by an automated test that posts an oversized payload and asserts the specific error.
  4. A normally-sized `vision.ts`/`brain.ts` request still succeeds end-to-end under the new caps — verified by an automated regression test, proving the guardrail doesn't break legitimate usage.

**Plans**: TBD

### Phase 12: Checkout Verification (Scan & Search Confirmation)

**Goal**: Cashiers get an automatic, non-blocking confirmation only when a barcode scan or manual-search lookup resolves ambiguously, catching mismatches without slowing down the fast-checkout happy path.
**Depends on**: Nothing (independent frontend work; no backend dependency)
**Requirements**: VER-01, VER-02
**Success Criteria** (what must be TRUE):

  1. Scanning or looking up a barcode that resolves to a single active, correctly-priced product adds it to the cart in one action with no confirmation step — verified by a Playwright assertion on cart state and absence of any confirmation UI.
  2. A barcode that resolves to multiple products, or a product flagged inactive/zero-price, surfaces a non-blocking confirmation UI before the item is added to the cart — verified by a Playwright test asserting the item is absent from the cart until confirmed.
  3. Selecting a manual-search result shows the resolved product's name, price, and barcode before it is committed to the cart — verified by a Playwright test asserting those fields render in the pre-commit UI.
  4. Confirming or dismissing the ambiguous-match confirmation correctly adds or rejects the item from the cart — verified end-to-end by Playwright for both outcomes.

**Plans**: 2/2 plans executed

Plans:
**Wave 1**

- [x] 12-01-PLAN.md — Tracer: zero-price scan-confirm end-to-end (TDD predicate + shared useConfirmRiskyAdd hook + scan-path wiring), then low-stock flag via new inventory join

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 12-02-PLAN.md — ProductCard barcode line (VER-02) + search-path risk-gate wiring (ProductGrid, shared hook reused)

**UI hint**: yes

### Phase 13: Receipt Delivery & Resilience (Print, Reprint, Retry, PDF)

**Goal**: Receipt delivery — print, reprint, retry, PDF, email — is resilient to printer failure and every delivery path has reproducible automated evidence, including the new PDF path.
**Depends on**: Nothing (sequenced last to reuse the print/email E2E mocking harness this phase builds, per research ordering rationale)
**Requirements**: RCP-01, RCP-02, RCP-03, RCP-04
**Success Criteria** (what must be TRUE):

  1. A cashier can reprint the receipt for the most recently completed sale — verified by an automated test that triggers reprint and asserts the correct receipt content is reissued.
  2. A simulated printer failure (offline/out-of-paper/disconnected) never blocks or rolls back a completed sale — the sale is recorded and the UI reflects success regardless of print outcome — verified by an automated test mocking the print IPC/invoke failure.
  3. A transient printer failure is automatically retried 2-3 times before being surfaced to the cashier as a failure — verified by an automated test asserting retry count and eventual failure state.
  4. A completed sale's receipt can be delivered as a PDF (email attachment and/or standalone download), built from the same `receipt-format.ts` content used for print/email text rather than a second, divergent formatter — verified by an automated test asserting the PDF-attachment/email payload and/or download trigger.

**Plans**: 3/3 plans executed

Plans:
**Wave 1**

- [x] 13-01-PLAN.md — Tracer: bounded print retry (2-3 attempts) + stable-id toast inside printReceipt, proven end-to-end on one checkout (RCP-02, RCP-04)
- [x] 13-02-PLAN.md — Reprint: read-only ReceiptData reconstruction (fetchReceiptDataForPayment) + ReprintButton on PaymentPane (RCP-01)

**Wave 2** *(blocked on Wave 1 completion — 13-03 shares `i18n/locales/{en-US,es-MX}/featOrders.json` edits with 13-01; sequenced to avoid a concurrent-edit collision)*

- [x] 13-03-PLAN.md — PDF delivery: receiptToPdfBytes wraps buildThermalReceiptText verbatim, download button + Resend email attachment (RCP-03)

**UI hint**: yes

### Phase 14: Inventory Analytics Reports (Valuation, Shrinkage/Waste, Expiry-Loss, Turnover)

**Goal**: The owner can see where inventory value sits, what's being lost to shrinkage/waste and expiry, and how fast stock turns — all from read-only reports layered on existing inventory/stock-movement data, with zero new schema beyond the reports themselves.
**Depends on**: Nothing (independent read-only aggregation over `inventory`/`stock_movements`/`inventory_log`; sequenced first per research as lowest-risk)
**Requirements**: INVR-01, INVR-02, INVR-03, INVR-04
**Success Criteria** (what must be TRUE):

  1. Owner can view an inventory valuation report showing on-hand quantity × current weighted-average cost, broken down by product and category, plus a store-wide total.
  2. Owner can view a shrinkage/waste report showing the dollar value of non-sale stock loss, rolled up from existing `inventory_log` adjustment reason codes.
  3. Owner can view an expiry-loss report showing the dollar value of stock written off specifically due to expiry, filtered separately from other shrinkage reasons within the same underlying adjustment data.
  4. Owner can view a turnover/sell-through report at product or category level, combining units-sold data from the existing Product Sales report with average inventory value from the valuation report.
  5. Each report states its cost-basis formula directly in the UI so the numbers are auditable and reconcile with the existing Inventory page and Product Sales report — verified by automated tests pinning each formula's output against known fixture data.

**Plans**: 4/4 plans executed
**Wave 1**

- [x] 14-01-PLAN.md

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 14-02-PLAN.md

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 14-03-PLAN.md

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 14-04-PLAN.md

**UI hint**: yes

### Phase 15: Receipt Designer (Layout, Branding & Logo Printing)

**Goal**: The owner can customize what prints on every receipt — header/footer text, optional fields, and their store logo — and trust that what they see in preview is exactly what prints on the physical thermal printer.
**Depends on**: Nothing (purely additive extension of the existing `receipt_settings` singleton; independent of Phase 14/16)
**Requirements**: RCPD-01, RCPD-02
**Success Criteria** (what must be TRUE):

  1. Owner can edit receipt header lines, footer text, and toggle optional line items (cashier name, customer name, receipt #, tax breakdown) from Settings.
  2. A live preview reflects the current unsaved edits before saving, rendered through the existing `ReceiptPreview.tsx` renderer rather than a second, divergent one.
  3. Saved `receipt_settings` changes (text, toggles, logo) take effect on the next printed, in-app, and PDF receipt.
  4. The store's uploaded logo (`receipt_settings.logoDataUrl`) prints on the physical 80mm ESC/POS thermal receipt as a monochrome raster image — verified end-to-end by a Playwright test asserting the `GS v 0` raster bytes are sent to the printer command.

**Plans:** 4/4 plans complete

Plans:

- [x] 15-01-PLAN.md — buildThermalReceiptText becomes settings-aware (paper width, show* toggles, headerLine2, footerText wrap)
- [x] 15-02-PLAN.md — Rust `encode_logo_raster`/GS v0 raster encoding + `print_receipt` logo wiring (TDD)
- [x] 15-03-PLAN.md — Thread ReceiptSettings/logoDataUrl through every print/preview/email call site
- [x] 15-04-PLAN.md — HardwareSettingsTab headerLine2/footerText inputs + live preview panel + e2e

**UI hint**: yes

### Phase 16: Purchase Orders & Reordering

**Goal**: A manager can create, auto-draft, and receive purchase orders against a supplier without duplicating the existing goods-receiving logic.
**Depends on**: Nothing (sequenced last per research risk-ordering — highest schema-design risk, and `receive_shipment` must stay unchanged and stable through Phases 14-15 for `receive_po_shipment` to build on)
**Requirements**: PO-01, PO-02, PO-03
**Success Criteria** (what must be TRUE):

  1. A manager+ can create a purchase order against a supplier with line items (product, quantity, cost), selecting products/default costs from the existing `suppliers`/`supplier_products` entities.
  2. A manager+ can generate a draft purchase order in one action, pre-filled from the current low-stock/reorder-point list for a chosen supplier, then edit line items before saving.
  3. A manager+ can receive a purchase order in full, which updates stock/cost/expiry via the existing `receive_shipment` RPC (extended with an optional PO reference) rather than a duplicate receiving code path.
  4. Receiving a purchase order marks it received/closed, and a cashier without manager+ role cannot create or receive purchase orders — verified by an automated RBAC/RLS test.

**Plans**: 4 plans

Plans:
**Wave 1**

- [x] 16-01-PLAN.md — Tracer: purchase_orders/purchase_order_items schema+RLS, receive_shipment extended (p_po_id, PO_ALREADY_RECEIVED/PO_SUPPLIER_MISMATCH guards, atomic close)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 16-02-PLAN.md — Domain schemas, entities/purchase-order CRUD hooks, computeReorderQuantity (D-07/D-08, TDD), suggest-reorder query

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 16-03-PLAN.md — PurchaseOrderForm (create/edit/suggest-reorder), List/Detail widgets, /purchase-orders route + nav

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 16-04-PLAN.md — Receive Shipment wiring (poId pre-fill), e2e/56-purchase-orders.spec.ts (ROADMAP success criteria 1-4)

**UI hint**: yes

### Phase 18: Barcode Scan Product Peek Window

**Goal**: Scanning a barcode on `/pos` opens a separate Tauri OS window showing full product detail with a qty/weight input, letting the cashier inspect and choose to add-or-skip before it touches the cart.
**Depends on**: Nothing identified yet (needs `/gsd-discuss-phase` — likely touches Tauri multi-window setup, an inter-window event channel, and the existing loose-weight/qty-input component)
**Requirements**: PEEK-01, PEEK-02, PEEK-03, PEEK-04
**Success Criteria** (what must be TRUE) — draft, to be firmed up in discussion:

  1. Scanning a barcode on `/pos` opens a separate Tauri window (verified via window-count/label assertion) showing name, size/unit, photo, price, inventory, SKU, barcode.
  2. The window has a qty/weight input matching the product's unit type, and reuses the existing out-of-stock/near-expiry guard components rather than new ones.
  3. "Add to Cart" adds the entered amount to the active `/pos` cart and closes the window; "Close" dismisses without any cart change.
  4. Scanning a second barcode while the window is open replaces its content with the new product, and the main `/pos` window's own scan-to-search listener still fires on that same scan.

**Plans**: 3/3 plans executed

Plans:
**Wave 1**

- [x] 18-01-PLAN.md — Tracer: WeightEntryDialog onConfirm override (TDD) + ensurePeekWindowShown race-free open/reuse (TDD) + capability grant + CheckoutPanel scan/relay/add-to-cart wiring

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 18-02-PLAN.md — Peek window's own React tree: main.tsx ?window=peek branch, PeekApp.tsx shell, ProductPeekWindow.tsx widget (full UI-SPEC layout, guard reuse, piece/weight commit paths)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 18-03-PLAN.md — E2E proof: BroadcastChannel-backed multi-window Tauri IPC mock + peek-window.spec.ts covering PEEK-01..04 and cross-window session restore

**UI hint**: yes

### Phase 19: Store-Local Durable Printing Service

**Goal:** Every print command from a LAN/VPN client is either durably accepted by one store-local
broker with a stable job ID or fails immediately and loudly; accepted work survives application and
service restarts, routes to its named Windows printer, and remains auditable end to end.
**Depends on:** Nothing (independent hardware/service hardening; Spike 001 VALIDATED the service
installation and real printer/spooler boundary on real Windows Service infrastructure and real thermal-
printer hardware — see `.planning/spikes/001-windows-print-broker/README.md`)
**Requirements:** PRN-01, PRN-02, PRN-03, PRN-04, PRN-05, PRN-06, PRN-07
**Success Criteria:**

  1. An authenticated mobile or desktop client on LAN/VPN receives success only after the broker
     durably commits the command; unavailable or rejected submissions return a structured correlated
     error and produce an actionable toast in UI callers.

  2. An accepted command survives client exit and broker restart, then reaches the configured named
     Windows printer queue without requiring the Tauri POS process to remain open.

  3. Receipt, reprint, caja summary, test-print, and cash-drawer callers all use one submission
     contract; automated tests prove no failed `Result` is silently discarded.

  4. Audit queries return command counts and append-only attempts/transitions/errors by time range,
     origin, printer, and job ID while applying payload retention and access controls.

  5. Automated fault tests cover broker unavailable, authentication failure, invalid payload,
     persistence failure, stopped spooler, offline printer, retry exhaustion, duplicate idempotency
     key, ambiguous handoff, and restart recovery.

**Plans:** 8 plans

Plans:
**Wave 1**

- [ ] 19-01-PLAN.md — Tracer: durable test_print end-to-end (broker crate skeleton — ledger/http/delivery — through the real WinSpool call sequence), fault-hardened (restart recovery, ambiguous handoff, connect-timeout)

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 19-02-PLAN.md — Windows Service SCM registration, NSIS post-install hook, LAN firewall rule, per-store secret generation (D-01..D-04)
- [ ] 19-03-PLAN.md — Expand the broker contract to print_receipt/print_raw_text (new)/open_cash_drawer, remove the silent-fallback-success anti-pattern (D-09)

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 19-04-PLAN.md — Harden all five print-call-site files onto one shared error-copy-key contract; close the one confirmed silent-Result-discard violation (D-11)
- [ ] 19-05-PLAN.md — Per-failure-class retry/backoff config + payload retention purge, gated by a checkpoint:decision confirming the retention window (D-10, D-14 one-way)

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 19-06-PLAN.md — entities/print-job + broker GET /jobs list endpoint + PrintJobStatusBadge + "Did this print?" confirm on ReprintButton + stuck-queue alert (D-05..D-08, D-15)

**Wave 5** *(blocked on Wave 4 completion)*

- [ ] 19-07-PLAN.md — PrintJobsTable/PrintJobFilterBar/PrintJobDetailSheet + /audit Tabs wrapper (D-13, D-16)

**Wave 6** *(blocked on Wave 5 completion)*

- [ ] 19-08-PLAN.md — Full E2E fault-test matrix, correlation-ID/unknown-confirm/audit-tab specs, broker fault-matrix gap audit, cross-machine LAN reachability script

**UI hint**: yes

### Phase 20: Store Deployment: Signed Elevated Installer

**Goal:** A `npm run tauri build` on this repo produces a single NSIS installer that a store owner
can run with one UAC prompt to get a fully working, code-signed POS pointed at a fully deployed
remote Supabase backend — no manual `supabase functions deploy`, no manual secret-setting, no
SmartScreen warning, no localhost-baked build.
**Depends on:** Phase 19 (broker sidecar + `windows/hooks.nsh` post-install hook infrastructure)
**Requirements:** DEP-01, DEP-02, DEP-03, DEP-04
**Success Criteria:**

  1. All 12 Supabase Edge Functions the app depends on (`process-payment`, `process-split-payment`,
     `create-staff`, `process-direct-sale`, `receive-shipment`, `send-receipt-email`,
     `settings-backup`, `settings-restore`, `settings-email-status`, `settings-test-email`,
     `get-server-time`, `agent-proxy`) are deployed to the remote project and reachable — verified by
     invoking each from a real build.

  2. Every edge-function secret (`ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `RECEIPT_FROM_EMAIL`,
     `BAR_NAME`/`BAR_ADDRESS`) is set on the remote project via `supabase secrets set` — verified by
     `supabase secrets list` showing all required keys with non-empty digests.

  3. `npm run tauri build` produces an NSIS installer that runs fully elevated (single UAC prompt)
     and, in that one elevation, registers the print-broker Windows Service, adds the LAN firewall
     rule, and imports the build-time self-signed cert into the machine's Trusted Root store —
     verified by a real install with no follow-up permission prompts or manual steps.

  4. An installer integrity-check script confirms the built artifact contains `broker/broker.exe`,
     the signing certificate, the correct baked `VITE_SUPABASE_URL` (the remote project, never
     `127.0.0.1`), and the NSIS printer-broker hooks — verified by running the script against the
     built artifact before it ships.

  5. The installer keeps shipping via the existing public GitHub Release download; a one-time
     SmartScreen "More info → Run anyway" click-through on first launch (unavoidable for a
     browser-downloaded, self-signed-cert file per Mark-of-the-Web) is accepted, and no SmartScreen
     warning appears on any subsequent run or auto-update. A real end-to-end smoke pass (login →
     checkout → print → shipment receiving → staff creation) succeeds against the remote backend
     with zero manual configuration steps beyond running the installer and clicking through that
     one SmartScreen prompt.

**Plans:** 3 plans (20-03 added post-verification — gap closure for Success Criterion 5, see
`.planning/phases/20-store-deployment-installer/20-VERIFICATION.md`)

Plans:
**Wave 1**

- [x] 20-01-PLAN.md — Tracer: deploy all 12 edge functions + reachability smoke-check (DEP-03), then
  collect real secret values (checkpoint:human-action) and set them on the remote project (DEP-04)

**Wave 2** *(blocked on Wave 1 completion — shares `.gitignore`/`.env.production` protection with Plan 01)*

- [x] 20-02-PLAN.md — Self-signed cert generation + NSIS Trusted-Root import + signed real build (DEP-01),
  pre-ship installer integrity-check script (DEP-02), and CI release-pipeline signing wire-up

**Wave 3** *(blocked on Wave 1/2 completion — gap closure)*

- [ ] 20-03-PLAN.md — Remote-backend E2E smoke spec (dedicated fixture admin, remote-pointed Playwright
  config, shipment receiving + checkout/print + staff creation with full teardown) closing Success
  Criterion 5

**UI hint**: no

## Progress

**Execution Order:**
v1.2 (paused) resumes at Phase 11 → 12 → 13 if picked back up; v1.3 (active) executes 14 → 15 → 16.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|-----------------|--------|-----------|
| 1. Strip & Rebrand | v1.0 | 13/13 | Complete | 2026-08-16 |
| 2. Core Direct-Sale Checkout | v1.0 | 9/9 | Complete | 2026-08-16 |
| 3. Supplier, Receiving & Expiry Tracking | v1.0 | 2/2 | Complete | 2026-08-16 |
| 4. Reports & Hardening | v1.0 | 6/6 | Complete | 2026-08-16 |
| 5. Delete void-order feature | v1.1 | 3/3 | Complete | 2026-08-17 |
| 6. Security hardening | v1.1 | 3/3 | Complete | 2026-08-18 |
| 7. Backend data integrity | v1.1 | 3/3 | Complete | 2026-08-18 |
| 8. Sale/payment workflow wiring + cleanup | v1.1 | 6/6 | Complete | 2026-08-18 |
| 9. Reopen-and-edit a completed sale | v1.1 | 3/3 | Complete | 2026-08-18 |
| 10. Quality debt & ops documentation | v1.1 | 7/7 | Complete | 2026-08-18 |
| 11. Security Hardening (Server-Side Secrets & Cost Guardrails) | v1.2 (paused) | 0/TBD | Not started | - |
| 12. Checkout Verification (Scan & Search Confirmation) | v1.2 (paused) | 2/2 | In Progress|  |
| 13. Receipt Delivery & Resilience (Print, Reprint, Retry, PDF) | v1.2 (paused) | 3/3 | Complete    | 2026-08-24 |
| 14. Inventory Analytics Reports | v1.3 | 4/4 | Complete    | 2026-08-19 |
| 15. Receipt Designer (Layout, Branding & Logo Printing) | v1.3 | 4/4 | Complete    | 2026-08-23 |
| 16. Purchase Orders & Reordering | v1.3 | 4/4 | Complete    | 2026-08-24 |
| 17. E2E Suite Overhaul | v1.3 | 17/17 | In Progress|  |
| 18. Barcode Scan Product Peek Window | v1.4 | 3/3 | In Progress|  |
| 19. Store-Local Durable Printing Service | v1.5 | 0/8 | Planned | - |
| 20. Store Deployment: Signed Elevated Installer | v1.6 | 0/2 | Planned | - |

### Phase 17: E2E Suite Overhaul

**Goal:** The Playwright E2E suite (`e2e/*.spec.ts`) contains zero references to stripped bar-pos domain concepts (pool tables, Rappi, KDS, waitlist, combos, recipes/ingredients, promotions, tip distribution — all removed from the app in Phase 1) and instead gives comprehensive, current, automated coverage of every real supermarket-pos feature, component, user flow, cross-feature integration, and DB transaction, seeded with Indian grocery products, runnable headless by default (fast) against agent-browser's bundled Chrome-for-Testing binary instead of the unstable system Chrome, with an optional live-monitoring mode (Playwright UI mode) for watching a run in progress.
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04

  - TEST-01: Audit all 50 existing `e2e/*.spec.ts` files; delete/rewrite every test asserting against dropped bar-pos schema/routes/domain (confirmed present in `07-reports`, `09-rbac`, `15-home-navigation`, `17-payment-pane`, `18-modifier-notes-kds`, `20-error-scenarios`, `20-sprint2-revenue`, `23-payment-edge-cases`, `31-categories` (comment-only, no live remnant), `44-focus-tab-order`, `e2e/helpers/supabase.ts`, `e2e/visual/45-visual-baseline.spec.ts`)
  - TEST-02: Comprehensive coverage — every current feature/component/user workflow/integration/DB transaction in the live schema, using realistic Indian grocery product fixtures (masalas, atta/rice/dals, ghee/oil, tea/coffee, snacks, pickles/papads, frozen, ready-to-eat, sweets) with scenario + edge-case coverage
  - TEST-03: `playwright.config.ts` launches against agent-browser's bundled Chrome-for-Testing binary (`~/.agent-browser/browsers/chrome-<version>/chrome` via `launchOptions.executablePath`) instead of `channel: 'chrome'` — keeps `@playwright/test` as the runner (fixtures, parallelism, assertions, network mocking, reporting all preserved); agent-browser itself is not a Playwright-compatible runner and is not used to drive tests
  - TEST-04: Default `npm run test:e2e` stays headless and fast (matches existing `FAST_E2E` posture); add an opt-in script (e.g. `test:e2e:ui`) that launches Playwright UI mode for live pass/fail/timeline monitoring of a run

**Depends on:** Nothing (test-infrastructure work; independent of Phase 11's backend security hardening)
**Plans:** 17/17 plans executed

Plans:
**Wave 1** (foundation — no file conflicts)

- [x] 17-01-PLAN.md — Playwright config (agent-browser Chrome-for-Testing, D-15/D-16 artifact policy) + `test:e2e:ui` script (D-17) + `e2e/helpers/db-assertions.ts` (D-12)
- [x] 17-02-PLAN.md — Indian grocery seed data rewrite (D-01/D-02) — `supabase/seed.sql` + `scripts/seed-dev-data.ts`
- [x] 17-03-PLAN.md — `e2e/helpers/supabase.ts` dead-code strip (resetTestState + 7 dead functions) + `e2e/helpers/rls-clients.ts` (D-13) + `global-teardown.ts` folder-path classification (Pitfall 1)

**Wave 2** *(tracer — blocked on Wave 1)*

- [x] 17-04-PLAN.md — Tracer: `e2e/checkout/` fully rewritten end-to-end (happy-path, atomic-rpc-guards, barcode-scan-search), proving Wave 1's foundation on the app's core flow

**Wave 3** *(expansion — blocked on Wave 2, parallel across domains)*

- [x] 17-05-PLAN.md — `e2e/payments/` (core-payments/payment-pane/edge-cases/refund/split-payment — un-skips 05-payments + 41-split-payment policy violations)
- [x] 17-06-PLAN.md — `e2e/caja/` (session-management un-skip + entries, dedup vs. 19-caja-entries)
- [x] 17-07-PLAN.md — `e2e/inventory/` (management/intelligence/near-expiry/open-units/loose-weight, D-05 fixtures kept for the last two)
- [x] 17-08-PLAN.md — `e2e/suppliers/` + `e2e/purchase-orders/`
- [x] 17-09-PLAN.md — `e2e/reports/` (1557-line `07-reports` surgical fixes + product-sales/export/discount-and-revenue)
- [x] 17-10-PLAN.md — `e2e/receipts/` (settings/category-grouping split + print-retry/reprint/pdf-delivery)
- [x] 17-11-PLAN.md — `e2e/rbac/` (rbac + staff-management + new rls-boundary.spec.ts, D-13 deliverable)
- [x] 17-12-PLAN.md — `e2e/products/` + modifier-sheet hybrid split into `e2e/checkout/modifier-notes.spec.ts`
- [x] 17-13-PLAN.md — `e2e/audit/` + `e2e/tabs/` (concurrent-edits retargeted off deleted TabDrawer/TabCard)
- [x] 17-14-PLAN.md — `e2e/home/` + `e2e/a11y/` + `e2e/errors/` (Bucket-B skip resolution)
- [x] 17-15-PLAN.md — `e2e/settings/` + `e2e/infra/` + `e2e/soak/` (deletes `14-manual-stubs.spec.ts` policy violation, rewrites offline queue)
- [x] 17-16-PLAN.md — `e2e/visual/45-visual-baseline.spec.ts` content audit (heaviest bar-pos file, config untouched)

**Wave 4** *(wrap-up — blocked on all Wave 3 plans)*

- [x] 17-17-PLAN.md — TEST-02 gap audit (closes `agent-chat` coverage gap) + final TEST-01 grep gate + CLAUDE.md E2E section rewrite (D-09) + full suite green run

---
*Next: `/gsd-execute-phase 17` to execute.*
