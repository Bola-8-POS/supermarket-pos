# Supermarket POS

## What This Is

A single-store point-of-sale system for a supermarket selling goods imported from India (packaged spices/masalas, atta/rice/dals, snacks, pickles/papads, ghee/oil, tea/coffee, frozen items, ready-to-eat, sweets — mostly barcoded packaged goods, some sold loose by weight). Pivoted from a bar/pool-parlour POS codebase (Tauri 2 + React 19 + Supabase), reusing its generic retail infrastructure and stripping everything bar/pool-specific. Inventory management — including supplier receiving, expiry tracking, and AI-assisted invoice intake — is the core strength of the product.

## Core Value

Fast, reliable checkout (barcode scan → cart → pay) backed by inventory that's always accurate — what's on the shelf, what's expiring, and what needs reordering — without the owner doing manual data entry for every supplier delivery.

## Business Context

- **Customer**: A friend who owns a single supermarket, 1-2 terminals
- **Revenue model**: N/A — internal tool built for one operator, not sold
- **Success metric**: Store can run daily sales through the POS with accurate stock levels; AI invoice intake meaningfully reduces manual product/stock entry after supplier deliveries
- **Strategy notes**: `.planning/specs/2026-08-10-supermarket-pos-pivot-design.md`

## Current Milestone: v1.3 Receipt Designer + Inventory Management Expansion

**Goal:** Let the owner customize receipt layout/branding, and expand inventory management with purchase orders/reordering plus deeper reporting (valuation, shrinkage/waste, expiry-loss, turnover).

**Target features:**
- Receipt designer — customizable layout/branding for the 80mm ESC/POS thermal receipt
- Purchase orders — formal PO creation against suppliers, low-stock reorder suggestions, order tracking
- Deeper inventory reporting/analytics — inventory valuation, shrinkage/waste tracking, expiry-loss reports, turnover analysis

## Current State

**v1.1 Pre-Launch Hardening shipped 2026-08-18** (Phases 5-10, 25/25 plans, 17/17 requirements). Every gap the independent go-live audit surfaced is closed: the Anthropic API call now runs server-side through an authenticated `agent-proxy` edge function (no client-exposed key), `receipt_settings` has migration-tracked RLS and a DB-enforced singleton constraint, the orphaned void-order feature is fully deleted, staff creation/reopen-a-sale/offline-checkout are wired and working, `receive_shipment`'s cost/expiry overwrite bug is fixed, `supabase.types.ts` is regenerated, the real Tauri app identifier is set, and a DB backup/DR plan is documented. See `.planning/milestones/v1.1-ROADMAP.md` for full phase history.

**Deliberately deferred, not a gap:** the real `ANTHROPIC_API_KEY` production secret — the user provisions this themselves immediately before shipping to the customer's store (Phase 6, Task 4).

**Next milestone not yet scoped.** Two placeholder candidates were identified during v1.1 planning (see Active below) but neither has requirements or phases defined yet — run `/gsd-new-milestone` to scope one.

**Phase 24 (Tax Configuration — Inclusive/Exclusive Toggle) shipped 2026-09-01**, inserted ahead of v1.3's originally-scoped work to fix a live checkout overcharge bug (tax was being added on top of already-tax-inclusive catalog prices). Phase 25 (E2E Receipt Print-Mock Consolidation — a pre-existing, unrelated Tauri test-mock teardown flake found during Phase 24) is stubbed in ROADMAP.md, not yet planned.

## Requirements

### Validated

- ✓ Staff accounts, RBAC (cashier/manager/admin/kitchen roles, renamed from bartender in Phase 1), PIN login — existing, reusable as-is
- ✓ Caja (register) session open/close, cash reconciliation — existing, reusable as-is
- ✓ Payment processing (cash/card/split methods) — existing, reusable as-is
- ✓ Product/category catalog, barcode lookup, low-stock threshold/reorder point — existing, reusable as-is
- ✓ Manual stock adjustment, physical count/stocktake reconciliation, stock movement audit trail — existing, reusable as-is
- ✓ Multi-unit stock (case→pieces via `open-unit`, kg/g/ml/L via `UomSchema`) — existing, reusable as-is
- ✓ USB-HID barcode scanner integration (`useBarcodeScanner.ts`), ESC/POS receipt printing — existing, reusable as-is
- ✓ AI vision pipeline (`agent-chat` feature: image/PDF/CSV → Anthropic vision extraction → confirm → bulk import) — existing, needs extending from name+price to full invoice line items (v2/Beta) and its API call moved server-side (v1.1, this milestone)
- ✓ Audit log, Settings, Reports infrastructure — existing, reusable as-is
- ✓ Direct-sale checkout screen (scan → cart → pay, no "tab" concept) — v1.0 Alpha, Phase 2, complete
- ✓ Supplier entity, goods receiving flow, expiry tracking, near-expiry alerts — v1.0 Alpha, Phase 3, complete (receiving's cost/expiry-overwrite bug is v1.1 scope, see Active)
- ✓ Trimmed reports set + caja close/reconcile — v1.0 Alpha, Phase 4, complete
- ✓ Reopen a completed/paid sale and add/remove its line items (SALE-03) — v1.1, Phase 9, complete. Adds a manager-gated `EditReopenedItemsPanel` (thin `add-item-to-tab` wrapper over `create_order_with_items`, reused `RemoveTabItemDialog`/`useRemoveTabItem` for removal); `edit_paid_tab`'s status guard is unchanged. Known deferred risk: neither RPC has a server-side role check on reopened-sale edits (pre-existing, not introduced by this phase) — see STATE.md Deferred Items.
- ✓ Quality debt & ops documentation (QA-01..04, OPS-02) — v1.1, Phase 10, complete. Suppliers page loading/error states (reused `TableRowSkeleton`/`InventoryPagePanel`'s `role="alert"` pattern), Storybook backfilled from scratch (`.storybook/` never existed in this repo — Wave 0 gap) with 6 stories, new `EntityIdCell` shared primitive cross-links Audit Log/Edit History/Reports entity IDs to `/payments?id=`/`/staff?id=` (copy-to-clipboard for all other entity types), `useCheckoutSale.test.ts` added, and `docs/database-backup-and-disaster-recovery.md` + `scripts/backup-db.sh` document/cover both self-hosted and Supabase Cloud hosting scenarios (production hosting decision remains genuinely open, doc states this explicitly). Code review found and fixed 1 critical (gitignore gap risking DB dumps in git history) + 5 warnings (touch target, clipboard-absence guard, URL encoding, stale-filter reactivity, `.storybook/` gitignore gap).
- ✓ Anthropic API server-side migration + `receipt_settings` RLS (SEC-01, SEC-02) — v1.1, Phase 6, complete. Bearer-authenticated `agent-proxy` edge function fronts every Anthropic call (`brain.ts`/`vision.ts` fully off `@anthropic-ai/sdk`, zero key material in the shipped `dist/` bundle); `receipt_settings` has a genuine migration-tracked `CREATE TABLE` + RLS (cashier read-only, manager+admin full CRUD) replacing the old unaudited generic `settings` row. Post-verification gap closure: the singleton invariant is now DB-enforced (id column default + INSERT policy pinned to a sentinel UUID), not just a client-side convention — a manager could otherwise insert a second row and break every read (`.maybeSingle()`) app-wide. Real `ANTHROPIC_API_KEY` production secret remains the user's deliberately-deferred step, done immediately before shipping.
- ✓ Void-order deletion, backend data integrity, sale/payment wiring (SALE-01, DATA-01..03, SALE-02/04/05/06, OPS-01) — v1.1, Phases 5/7/8, complete. Orphaned void-order feature removed end-to-end (refund is the sole reversal path); `receive_shipment` no longer overwrites cost/expiry on restock (weighted-average-cost + earliest-expiry-wins); `settings-backup`/`settings-restore` no longer query the dropped `pool_tables`; `supabase.types.ts` regenerated; offline checkout fails fast instead of hanging; refund/checkout errors show translated staff-facing messages; real Tauri app identifier set.
- ✓ Product catalog detail dialog & photo upload (PCAT-01..04) — Phase 31, complete. The product add/edit dialog was reshaped from a small flat form into a larger Details/Photo/Links tabbed dialog opened by clicking a catalog row; a product can carry one photo in a private Supabase Storage bucket (`product-photos`, referenced by `products.photo_path`, RLS-restricted to `manage_products` holders), with drag/drop/paste/replace/remove all converging on one upload pipeline. Gap-closure (31-06) fixed a real bug the phase's own tests missed: the dialog's stock-strip (on-hand qty/low-stock threshold) was wired but read from a query that never joined `inventory`, always showing "0 on hand" for real stock — fixed by adding the join, confirmed live.
- ✓ Tax configuration — inclusive/exclusive toggle (TAX-01..05) — Phase 24, complete. Fixed a live overcharge bug: `taxInclusive` now defaults true and `decomposeTax()` (shared across `process_direct_sale_atomic`, `process-payment`, `process-split-payment`, and the reprint path) decomposes tax backward from already-inclusive catalog prices instead of adding it on top; exclusive mode keeps today's additive math unchanged. Squeezed in ahead of v1.3's originally-scoped features via `/gsd-explore` because it was a production billing-correctness bug, not a planned feature. Code review during phase-close found and fixed a real gap the phase's own plans missed: the `/payments` reprint path (`fetchReceiptDataForPayment`) never got the tax-decompose treatment, so a reprinted receipt would silently show a different (tax-less) total than the one printed at sale time — fixed same phase, plus a Rappi-tax and a taxInclusive-toggle-confirmation fix. One item (split-payment per-leg receipts still show the full basket item list against a per-leg tax split, D-09) deliberately deferred — pre-existing to Phase 24, requires a receipt-contract design decision, documented in `deferred-items.md`.

### Active

- [ ] **Receipt Designer + Inventory Management Expansion (v1.3, in progress)** — receipt layout/branding customization, purchase orders/reordering, deeper inventory reporting (valuation, shrinkage/waste, expiry-loss, turnover) — see REQUIREMENTS.md for v1.3 requirements
- [ ] **Verification & Hardware Hardening (v1.2, paused)** — barcode-scan/manual-search re-confirmation, receipt print/email path coverage, a fuller sweep for client-side secrets beyond SEC-01 (the browser-side OpenAI RAG-embeddings key this covered was removed entirely in Wave 3b), and an `agent-proxy` request-size/`max_tokens` cap (currently no server-side cost guardrail against a JWT used outside its intended flow — accepted risk per Phase 6's own threat model, T-06-04, but worth revisiting). Only Phase 11 (Security Hardening) reached the discussion stage before v1.3 took priority — checkpoint archived under `.planning/milestones/v1.2-phases/`, requirements/roadmap remain valid for resumption via `/gsd-new-milestone` or a dedicated resume flow.
- [ ] **AI Invoice Intake (AI-01..05)** — extend the existing vision pipeline from name+price extraction to full invoice line items (qty/cost/supplier/expiry); still v2/Beta scope, unchanged from Alpha

### Out of Scope

- Bar/pool-parlour features (tabs, pool tables/timers, KDS, kitchen prep, waitlist, Rappi delivery, recipes/combos/ingredient costing, promotions engine, modifier-inventory rules) — not relevant to a grocery store, stripped from the codebase
- Multi-location/multi-warehouse support — single store only, revisit only if the business expands
- FIFO/weighted-average costing engines, demand forecasting, automatic PO generation — overkill for one store's inventory
- Batch-level FEFO auto-allocation at sale time — one active expiry per product is sufficient; full lot-level tracking deferred until proven necessary
- Supplier performance analytics/scorecards, accounting-system integration — no current need
- Counter/hanging scale hardware integration — deferred to a future milestone if loose-weight items prove significant after Alpha usage

## Context

- This repo started as `bar-pos`, a bar/pool-parlour POS. It is now diverging into its own product (the supermarket POS) rather than staying a shared codebase — bar-pos itself is maintained separately elsewhere.
- Feature-Sliced Design architecture (`app → pages → widgets → features → entities → shared`) and the full generic retail stack (auth, RBAC, caja, payments, offline queue, printing, barcode scanning, AI vision) carry over unchanged; only the bar/pool-domain layers are being replaced.
- A fresh `.planning/codebase/` map (STACK, ARCHITECTURE, STRUCTURE, CONVENTIONS, TESTING, INTEGRATIONS, CONCERNS) was generated 2026-08-10 and should be treated as current-state ground truth for planning.
- Prior bar-pos `.planning/` history (phases, roadmap, decisions) was cleared 2026-08-10 since it no longer applies to this product's direction.

## Constraints

- **Timeline**: Alpha (usable for real sales) targeted in 4-6 weeks — aggressive, solo-maintained project
- **Hardware**: USB/wireless HID barcode scanner (plug-and-play, no driver work), 80mm ESC/POS thermal receipt printer, RJ11 cash drawer off the printer. Counter scale explicitly deferred.
- **Deployment**: Single store, 1-2 terminals — no multi-location design needed
- **Testing**: Per repo CLAUDE.md, all verification must be automated Playwright E2E — no manual UAT checkpoints
- **Scope discipline**: Inventory management is the most important subsystem but must stay lean — see Out of Scope; do not add speculative inventory machinery beyond the documented Active requirements

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Pivot in-place rather than fork a new repo | This repo is already a standalone clone; bar-pos is maintained separately elsewhere | ✓ Good |
| Reuse generic retail infra (auth/RBAC/caja/payments/barcode/AI vision), strip bar/pool domain layers | Codebase audit confirmed these are business-type-agnostic and already working | ✓ Good |
| Fold supplier/PO/expiry tracking into Alpha (not deferred to Beta) | Inventory management is the product's core strength; manual-entry version is low-risk and belongs with the rest of inventory core | — Pending |
| AI invoice intake (extending existing vision pipeline to line items) deferred to Beta | Extraction accuracy on real, messy supplier sheets is unproven — highest schedule risk, shouldn't block Alpha's usable checkout | — Pending |
| Inventory scope deliberately excludes FIFO/FEFO, multi-warehouse, forecasting, auto-PO | Single-store, 1-2 terminal deployment doesn't need enterprise inventory machinery | ✓ Good |
| `agent-proxy` is a thin pass-through, not a server-side agent loop (v1.1 D-01) | Tool-loop/RAG orchestration staying client-side kept the migration low-risk and preserved brain.ts's existing control flow byte-for-byte | ✓ Good |
| `receipt_settings` is a store-wide singleton, not per-terminal (v1.1 D-04) | No terminal/device-identity concept exists anywhere in this schema; inventing one wasn't worth it for a 1-2 terminal store | ✓ Good — later found under-enforced (DB constraint gap), fixed same milestone |
| Every phase's verification is automated Playwright/Vitest — no manual UAT checkpoints (repo CLAUDE.md, applied throughout v1.1) | Prior sessions surfaced real cost from human-verification checkpoints stalling phases indefinitely | ✓ Good — held for all 6 phases including a security-hardening one |
| `decomposeTax()` centralized in `supabase/functions/_shared/tax.ts` and imported by every tax-touching path (client, 3 edge functions, e2e helper, reprint query) rather than re-derived per call site (Phase 24) | A live overcharge bug came from tax math being duplicated/drifted across paths; a single shared function makes drift structurally impossible instead of policy-enforced | ✓ Good |
| Code-review-found critical gap (reprint path missing tax decompose) fixed in-phase rather than deferred, before marking Phase 24 complete | Directly contradicted the phase's own TAX-05 requirement and shipped untested — deferring would mean shipping a known correctness bug under a "complete" phase | ✓ Good |
| Product photo stored as a private-bucket object path (`products.photo_path`), not a base64/data URL or public URL (Phase 31, D-14/D-15) | Base64 bloats the `products` row and the client bundle payload; a public bucket would leak product photos to anyone with the URL, and this project's RBAC model already gates writes on `manage_products` | ✓ Good |
| `/gsd-verify-work 31` was executed as a live automated Playwright re-run (not source-only inspection, not manual UAT) per this repo's CLAUDE.md testing policy | Surfaced a real environment-drift bug (missing local Supabase migration) that a source-read-only verification pass would have missed entirely, and independently reconfirmed the 31-06 gap-closure fix was actually working, not just merged | ✓ Good |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-09-08 after Phase 31 (Product Catalog Detail & Photo Upload)*
