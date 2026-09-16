# Requirements: Supermarket POS

**Defined:** 2026-08-19 (v1.2)
**Core Value:** Fast, reliable checkout (barcode scan → cart → pay) backed by inventory that's always accurate — what's on the shelf, what's expiring, and what needs reordering — without the owner doing manual data entry for every supplier delivery.

## v1.2 Requirements — Verification & Hardware Hardening

Milestone goal: close the remaining verification gaps and security-hardening loose ends left after v1.1's pre-launch pass — checkout mismatch confirmation, receipt delivery coverage (including a new PDF path), and the second half of the client-secret-leak sweep started in v1.1 (SEC-01/SEC-02).

### Checkout Verification

- [x] **VER-01**: A barcode scan or manual-search product lookup that resolves ambiguously (multiple products for one barcode, or a product flagged inactive/zero-price) surfaces a non-blocking confirmation before the item is added to the cart. A clean, unambiguous match is added to the cart in a single action — no confirmation step is added to the happy path.
- [x] **VER-02**: When adding an item from manual search results, the cashier sees the resolved product's name, price, and barcode before it's added to the cart, so a wrong-row click is caught before commit.

### Receipt Delivery

- [x] **RCP-01**: A cashier can reprint the receipt for the most recently completed sale.
- [x] **RCP-02**: A receipt printer failure (offline, out of paper, disconnected) never blocks or rolls back a completed sale — the sale completes and is recorded regardless of print outcome, verified by an E2E test that simulates printer failure.
- [x] **RCP-03**: A completed sale's receipt can be delivered as a PDF — attached to the existing email-receipt path (Resend) and/or downloaded standalone — reusing the existing `receipt-format.ts` formatting logic rather than a second, divergent formatter.
- [x] **RCP-04**: A transient printer failure is automatically retried (2-3 attempts) before being surfaced to the cashier as a failure.

### Security Hardening

- [ ] **SEC-03**: The RAG-embeddings call in `src/shared/lib/agent/rag.ts` runs server-side through a Bearer-authenticated Supabase Edge Function, mirroring the `agent-proxy` pattern already shipped for the Anthropic API (v1.1 SEC-01). `VITE_OPENAI_API_KEY` and the client-side `openai` SDK dependency are removed; a build-output grep confirms no key or SDK reference remains in the shipped `dist/` bundle.
- [ ] **SEC-04**: The `agent-proxy` Edge Function enforces a `max_tokens` ceiling and a request-body-size cap in its existing `BodySchema`, calibrated against real `vision.ts`/`brain.ts` usage, closing the accepted-risk gap from Phase 6's threat model (T-06-04). An oversized or excessive request is rejected with an actionable error, not a generic failure.

## v1.3 Requirements — Receipt Designer + Inventory Management Expansion

Milestone goal: let the owner customize receipt layout/branding, and expand inventory management with purchase orders/reordering plus deeper reporting (valuation, shrinkage/waste, expiry-loss, turnover).

### Receipt Designer

- [x] **RCPD-01**: The owner can edit receipt header lines, footer text, and toggle optional line items (cashier name, customer name, receipt #, tax breakdown) from Settings, with a live preview reflecting the current `receipt_settings` before saving — reusing/extending the existing `ReceiptPreview.tsx` renderer rather than building a second one.
- [x] **RCPD-02**: The store's uploaded logo (`receipt_settings.logoDataUrl`) prints on the physical 80mm ESC/POS thermal receipt, not just in-app/PDF — new Rust support in `printer.rs` converts the logo to a monochrome raster image and encodes it via the ESC/POS `GS v 0` command, verified end-to-end by a Playwright test asserting the raster bytes are sent to the printer command.

### Purchase Orders

- [x] **PO-01**: A manager+ can create a purchase order against a supplier with line items (product, quantity, cost), reusing the existing `suppliers`/`supplier_products` entities for selection and default cost.
- [x] **PO-02**: A manager+ can generate a draft purchase order pre-filled from the current low-stock/reorder-point list for a chosen supplier, in one action, then edit line items before saving.
- [x] **PO-03**: A manager+ can receive a purchase order in full, updating stock/cost/expiry via the existing `receive_shipment` RPC (extended with an optional PO reference) rather than a duplicate receiving code path, and marking the PO received/closed.

### Inventory Reporting

- [x] **INVR-01**: The owner can view an inventory valuation report (on-hand quantity × current weighted-average cost, by product/category, and store total).
- [x] **INVR-02**: The owner can view a shrinkage/waste report showing the value of non-sale stock loss, rolled up from existing `inventory_log` adjustment reason codes.
- [x] **INVR-03**: The owner can view an expiry-loss report showing the value of stock written off due to expiry, filtered from the same adjustment data as INVR-02.
- [x] **INVR-04**: The owner can view a turnover/sell-through report (product or category level) combining units-sold (existing Product Sales report data) with average inventory value (INVR-01).

### E2E Suite Overhaul

- [x] **TEST-01**: Every `e2e/*.spec.ts` file is audited; every test asserting against dropped bar-pos schema/routes/domain (pool tables, Rappi, KDS, waitlist, combos, recipes/ingredients, promotions, tip distribution) is deleted or rewritten, verified by a zero-match grep gate across `e2e/**/*.spec.ts` and `e2e/helpers/*.ts`.
- [x] **TEST-02**: The rewritten suite gives comprehensive, automated coverage of every current supermarket-pos feature/component/user workflow/integration/DB transaction, seeded with realistic Indian grocery product fixtures, cross-referenced against the current `src/features`/`src/widgets`/`src/entities` inventory.
- [x] **TEST-03**: `playwright.config.ts` launches against agent-browser's bundled Chrome-for-Testing binary via `launchOptions.executablePath`, auto-detected at config load time (not hardcoded), keeping `@playwright/test` as the runner.
- [x] **TEST-04**: Default `npm run test:e2e` stays headless and fast (unchanged); an opt-in `test:e2e:ui` script launches Playwright UI mode for live pass/fail/timeline monitoring of a run.

## v1.4 Requirements — Barcode Scan Product Peek (proposed, not yet roadmapped)

Milestone goal: scanning a barcode on `/pos` opens a separate detached Tauri window showing full product detail, so a cashier can verify/inspect an item before committing it to the cart.

### Product Peek Window

- [x] **PEEK-01**: Scanning a barcode on `/pos` opens a separate Tauri OS window (not a modal/overlay in the main window) showing the matched product's name, size/unit (kg/g/L/piece), photo, price, current inventory, SKU, and barcode.
- [x] **PEEK-02**: The peek window includes a quantity/weight input (matching the product's unit type — piece count or loose-weight amount) that the cashier sets before adding to cart, and reuses the existing out-of-stock and near-expiry checkout guards rather than a duplicate guard implementation.
- [x] **PEEK-03**: The peek window offers "Add to Cart" (adds the entered qty/weight to the active `/pos` cart and closes the window) and "Close" (dismisses without adding anything).
- [x] **PEEK-04**: While the peek window is open, scanning a different barcode replaces its content with the newly scanned product (no manual close needed first); the main `/pos` window's existing scan-to-search behavior continues to fire on the same scan independently.

Scope note: v1 is `/pos`-only. Rollout to other screens (global scan trigger) is deferred — see seed `barcode-peek-global-rollout`.

## v1.5 Requirements — Store-Local Durable Printing (proposed)

Milestone goal: make every print command fail fast at acceptance, survive application restarts after
acceptance, route through one store-local broker, and remain auditable without any internet service.

### Printing Broker

- [x] **PRN-01**: Mobile, desktop, and POS clients on the store LAN/VPN submit all receipt, reprint,
  report, test-print, and cash-drawer print commands to one authenticated store-local broker; the
  broker is not exposed to the public internet and has no cloud dependency.

- [x] **PRN-02**: A print-dependent workflow succeeds only after the broker durably records the job
  and returns its stable job/correlation ID. Unreachable broker, rejected payload, authentication,
  persistence, or routing failures fail immediately with a structured error and never report
  success.

- [x] **PRN-03**: An accepted job survives client, Tauri application, and broker process restart and
  is delivered asynchronously to its configured named Windows printer queue.

- [x] **PRN-04**: Every printing boundary propagates and logs normalized structured errors with the
  same job/correlation ID. UI-originated terminal failures show an actionable toast; background and
  non-UI callers explicitly handle and log failed results rather than discarding them.

- [x] **PRN-05**: The broker retains an auditable command and event history containing origin/actor,
  printer endpoint, payload hash/reference, timestamps, attempts, state transitions, Windows job ID,
  and normalized errors, with queryable command counts and retention controls.

- [x] **PRN-06**: Delivery uses finite retries only for classified transient failures and reconciles
  ambiguous Windows-spooler handoffs before resubmission. Stable idempotency keys prevent accidental
  duplicate jobs.

- [x] **PRN-07**: UI and audit states distinguish durable acceptance, submission to Windows,
  OS-reported completion, failure, cancellation, and unknown status; Windows status is never
  presented as proof of physical paper output.

## v1.6 Requirements — Store Deployment: Signed Elevated Installer (proposed)

Milestone goal: ship a seamless, elevated, self-signed installer for the store machine that boots
into a fully working app against the remote Supabase project — schema, edge functions, and secrets
included, not just the desktop binary. Remote DB schema (180 migrations) and one real admin account
were bootstrapped ahead of planning via `/gsd-explore` 2026-08-27; remapped 2026-08-28 and found the
remote project has **zero edge functions deployed** — this is now the largest gap, ahead of the
installer packaging work the phase was originally scoped for.

### Installer Packaging

- [x] **DEP-01**: The NSIS installer runs fully elevated (single UAC prompt covers Windows Service
  registration, firewall rule, and cert Trusted-Root import) and is code-signed with a self-signed
  certificate generated at build time and auto-trusted during install. The installer is distributed
  via the existing public GitHub Release download, which applies Mark-of-the-Web and means SmartScreen
  will still show once on first launch regardless of signing (a self-signed cert cannot suppress this
  for a browser-downloaded file) — a one-time "More info → Run anyway" click-through on first launch
  is accepted; no SmartScreen warning is expected on any subsequent run or update.

- [x] **DEP-02**: An installer integrity-check script verifies the built artifact actually contains
  the broker sidecar (`broker/broker.exe`), the signing certificate, the correct baked
  `VITE_SUPABASE_URL` (the remote project, never `127.0.0.1`), and the NSIS printer-broker hooks —
  before the installer ships to the store machine.

### Remote Backend Completeness

- [x] **DEP-03**: All 12 Supabase Edge Functions the app depends on
  (`process-payment`, `process-split-payment`, `create-staff`, `process-direct-sale`,
  `receive-shipment`, `send-receipt-email`, `settings-backup`, `settings-restore`,
  `settings-email-status`, `settings-test-email`, `get-server-time`, `agent-proxy`) are deployed to
  the remote project — checkout, staff creation, and shipment receiving are unusable without them.

- [x] **DEP-04**: Every edge-function secret the deployed functions read (`ANTHROPIC_API_KEY`,
  `RESEND_API_KEY`, `RECEIPT_FROM_EMAIL`, and the store-identity vars currently named `BAR_NAME`/
  `BAR_ADDRESS` — a bar-pos naming leftover, rename or just set correctly) is set on the remote
  project via `supabase secrets set`, not left at Supabase's empty default.

## v1.7 Requirements — Idle Screen Lock (proposed, not yet roadmapped)

Milestone goal: any screen, any role (including admin), locks behind a PIN prompt after a period of
inactivity — a physically unattended till should never sit open. Captured via `/gsd-explore`
2026-08-30.

### Idle Lock

- [x] **LCK-01**: An idle-lock overlay engages after a configurable inactivity timeout (default 60s)
  on every screen, for every role including admin, with no exemption for in-progress transactions
  (open cart, payment modal, etc.) — the overlay blocks all interaction until unlocked.

- [x] **LCK-02**: The inactivity timeout is configurable per-terminal (same storage pattern as
  `receipt_settings` — one row per terminal, not a single global value), editable only by
  `manage_settings`-gated roles.

- [x] **LCK-03**: The overlay unlocks on any valid staff PIN — not necessarily the PIN of the staff
  member who was active before idling. The active session's identity does not change on unlock; this
  is a screen lock, not a re-login or role switch.

- [x] **LCK-04**: Both the lock event and the unlock event are written to `audit_logs`, each recording
  which staff member was the active session owner and, for unlock, which staff member's PIN unlocked
  it (may differ from the session owner).

## v1.8 Requirements — Admin PIN Reset (Server-Side Recovery Path)

Milestone goal: a manager/admin can reset a staff member's PIN from the Staff page even when that
staff member has genuinely forgotten it and cannot log in at all — closing a real recovery gap with
no in-app path today (`force_pin_change` requires the staff member to already know their current
PIN to log in first). Captured via `/gsd-explore` 2026-08-31 after two real PIN-sync production
incidents on the Vinty Owner account (see `.planning/notes/vinty-owner-login-outage-rca.md`).
Requirement IDs formalized from `.planning/phases/22-admin-pin-reset-server-side-recovery-path/22-CONTEXT.md`'s
locked decisions D-01..D-08 during `/gsd-plan-phase 22` — no formal SPEC.md exists for this phase.

### Admin PIN Reset

- [ ] **PINRST-01**: Only a staff member with role `admin` can call the PIN-reset edge function; the admin can target any staff member, including other admins. A non-admin caller (or an unauthenticated request) is rejected server-side before any credential write happens.
- [ ] **PINRST-02**: The admin enters a specific new 6-digit PIN for the target staff member in the reset dialog — the system never generates the PIN itself, matching the existing Add Staff flow's PIN-entry UX.
- [ ] **PINRST-03**: The acting admin must re-enter their own PIN (via the reused `ManagerPinDialog`) immediately before the reset fires, in addition to their existing admin session — a confirm-before-fire gate on this privileged cross-account write.
- [ ] **PINRST-04**: A successful reset always sets `profiles.must_change_pin = true`; the staff member logs in once with the admin-set PIN, then is forced through the existing forced-change screen to pick their own PIN, matching `create-staff`/`force-pin-change` precedent.
- [ ] **PINRST-05**: "Force PIN Change" stays an unmodified, separate action; "Reset PIN" is a new, additional action on the Staff page for the case where the staff member cannot log in at all.
- [ ] **PINRST-06**: Reset is rejected server-side for a target whose `profiles.is_active` is `false`, independent of whether the current UI can produce that row.
- [ ] **PINRST-07**: The reset dialog shows a non-blocking warning when the entered PIN matches another active staff member's current PIN — advisory only, never blocking submit.
- [ ] **PINRST-08**: An admin can use Reset PIN on their own staff row with no special-case block — the same code path applies whether the target is the caller or any other staff member.

## v1.9 Requirements — Bank Transfer Payment Tracking

Milestone goal: cashier marks a completed sale as awaiting bank transfer with a system-generated
reference code; admin/manager manually confirms or disputes it against their own banking app on
the `/payments` page — replacing the current hand-written two-copy paper name+phone slip with a
fully audited state machine. Explored via `/gsd-spike` sessions 002-005 (idea key
`bank-transfer-payment-tracking`, `.planning/spikes/`) 2026-08-31. Requirement IDs formalized from
`.planning/phases/23-bank-transfer-payment-tracking/23-CONTEXT.md`'s locked decisions D-01..D-17
during `/gsd-plan-phase 23` — no formal SPEC.md exists for this phase.

### Bank Transfer Payment Tracking

- [ ] **BTP-01**: The POS generates a 7-digit reference code (6-digit payload + Luhn mod-10 check digit) per pending-transfer sale, unique among the store's currently-open pending codes. Targets SPEI's Banxico-standard `referencia numerica` field.
- [ ] **BTP-02**: Cashier can select "bank transfer" as the payment method at checkout only; the sale finalizes normally (receipt prints, inventory decrements, tab reaches `paid`) with the generated code shown/printed for the customer to use as their transfer reference. No retroactive conversion of an already-completed cash/card sale.
- [ ] **BTP-03**: Manager or admin can confirm a pending transfer by entering the reference code; the code is Luhn-validated before being compared to the sale's real code, and a mismatch is rejected without silently matching the wrong sale.
- [ ] **BTP-04**: Manager or admin can dispute a pending transfer, with a required, audit-logged reason — no dispute with an empty reason.
- [ ] **BTP-05**: No auto-confirm path exists anywhere in the system — every confirm/dispute is an explicit manager+/admin action, even when a match looks unambiguous (e.g. only one pending sale at that amount).
- [ ] **BTP-06**: Every state transition (mark pending / confirm / dispute) is written to `audit_logs` via `record_audit()`, with the new action strings registered in `AuditActionSchema` before use.
- [ ] **BTP-07**: A "Bank Transfers" tab is added to the existing `/payments` page (not a new route), listing every pending/confirmed/disputed sale oldest-first with reference code, customer name/phone, elapsed time, and status badge; a pending sale past ~8h (hardcoded) is visually flagged as stale.
- [ ] **BTP-08**: Admin can export the pending+confirmed list to CSV for end-of-day reconciliation, reusing the existing `rowsToCsv`/CWE-1236-safe exporter and Tauri-native save dialog (not a browser Blob download).
- [ ] **BTP-09**: A cashier-role account is denied `confirm_transfer_payment`/`dispute_transfer_payment` server-side (RPC role re-check), independent of any client-side gating.
- [ ] **BTP-10**: Bank statement data is never imported into or synced with the POS in this phase — no CSV import, no bank API pull, no PSP webhook. A pending/disputed bank-transfer sale still counts toward `get_caja_report`/`get_payment_methods_report` revenue totals immediately at checkout (same treatment as cash/card), with an additional "pending bank transfer" breakout so admin can see how much of today's revenue is still unconfirmed.

## v1.10 Requirements — Tax Configuration (Inclusive/Exclusive Toggle)

Milestone goal: fix a live overcharge bug and add the missing control for it. Store's product
prices already include tax (IVA), but checkout (`PaymentForm.tsx`) and the server-side
`process_direct_sale_atomic` RPC (both variants) always apply tax additively on top of the cart
total — every sale is currently overcharged by the tax amount. Explored via `/gsd-explore`
2026-08-31 (topic: how tax percentage is configured). Grey areas (default toggle value for
existing installs, exact receipt copy, whether report/margin math needs updating, whether
exclusive mode is still needed) are deferred to discuss-phase for Phase 24, not resolved here.

### Tax Configuration

- [x] **TAX-01**: Billing settings gains a `taxInclusive` boolean toggle (admin-only, `manage_settings`), alongside the existing `taxRatePercent`.
- [x] **TAX-02**: When `taxInclusive` is on, checkout total equals the sum of item prices unchanged; tax is decomposed backward for display (`subtotal = total / (1 + rate/100)`, `tax = total - subtotal`) rather than added on top.
- [x] **TAX-03**: When `taxInclusive` is off, checkout keeps today's additive math (`tax = subtotal * rate/100`, `total = subtotal + tax`) for stores whose shelf prices exclude tax.
- [x] **TAX-04**: The server-side `process_direct_sale_atomic` RPC (and its cost-snapshot variant) recomputes tax using the same mode-aware formula as the client and validates the client-submitted total against it — the anti-tamper total-match guard must not reject valid inclusive-mode sales.
- [x] **TAX-05**: Printed/PDF/email receipts show the decomposed subtotal + tax line matching whichever mode is active, not just a flat tax-on-top line.

## v1.11 Requirements — Promotions & Discount Management

Milestone goal: promotions/discounts scoped to product, category, or subcategory, auto-applied at
scan time and manually applicable at payment, with best-price-wins resolution when multiple qualify
and one condition-based trigger (expiry proximity) to start. Explored via `/gsd-explore` 2026-09-01.
Codebase research confirmed no existing discount/promotion engine (the bar-pos-era one was dropped in
Phase 1 and was combo/pool-coupled — not reusable) and no batch/lot-level expiry tracking (single
`expiry_date` per product, overwritten on each receiving) — batch tracking explicitly deferred, see
`.planning/seeds/batch-lot-expiry-tracking.md`.

### Promotions & Discounts

- [x] **PROMO-01**: A promotion/discount rule can be scoped to a specific product, a category, or a subcategory (a category row with `parentId` set), with `percent` or `fixed` discount type and an active date range in store-local time. Managing promotions requires a new `manage_promotions` RBAC action, granted **admin-only**.
- [x] **PROMO-02**: A promotion can auto-trigger off a product's proximity to its `expiry_date`, using a configurable `days_threshold → discount_%` tier table, reusing the existing near-expiry-alert threshold setting rather than introducing a second one.
- [x] **PROMO-03**: A qualifying product shows its discounted price live in the cart the moment it's scanned or added (client display). `process_direct_sale_atomic` is extended to recompute qualifying promotions server-side and remains the sole price authority — the client-displayed discount is never trusted as-is at checkout.
- [x] **PROMO-04**: When more than one promotion qualifies for the same line item, the single largest-discount promotion applies (best-price-wins); others are ignored for that line.
- [x] **PROMO-05**: At the payment screen, a cashier can apply an existing active promotion to the sale. Applying an ad-hoc/custom discount not tied to an existing promotion requires a manager PIN, mirroring the existing refund manager-PIN gate. The bar-pos-only `discountScope` values (`pool_only`, `consumptions_only`) on `PaymentSchema` are retired.
- [x] **PROMO-06**: Every applied promotion/discount is snapshotted per line item at sale time (promotion id, rate, computed discount amount) on `order_items`, mirroring the existing cost-price snapshot pattern — a later refund or reopened sale restores the exact historical discount even if the promotion has since changed or been deleted, and the existing margin report computes against the discounted price, not list price.
- [x] **PROMO-07**: No combination of discounts can drop a line item's final price below its recorded cost — an explicit floor guard rejects or caps the discount rather than allowing a below-cost sale.
- [x] **PROMO-08**: A discount computed while offline is snapshotted at add-to-cart time; if the underlying promotion changed before reconnect/sync, the conflict is flagged for review rather than silently re-priced.
- [x] **PROMO-09**: Automated Playwright E2E coverage (per this repo's mandatory-automated-testing policy) proves: product/category scope overlap resolution, store-local timezone date-range boundaries, a promotion deleted mid-cart, refund/reopen restoring the exact historical discount, the below-cost floor guard, interaction with loose-weight and case→piece (open-unit) items, and the offline-then-changed-promotion conflict flag.

## Phase 30 Requirements — POS Session Continuity & Safe Editing

Milestone goal: preserve an unfinished terminal sale across application restarts, prevent settings
edits from being discarded accidentally, and give cashiers a touch-first keypad for entering cash
tendered at Checkout. Explored via `/gsd-explore` 2026-09-07.

### Cart and Checkout Recovery

- [ ] **CART-01**: The active cart is stored in versioned, schema-validated terminal-local persistence after every cart change, alongside the already-persisted held-cart slot. After an application restart, the exact active cart is restored for any authenticated cashier on that terminal; malformed or obsolete persisted data fails closed to an empty cart instead of partially restoring untrusted lines.
- [ ] **CART-02**: If Checkout was open when the application exited, it reopens after authentication with the same pre-submission payment state, including payment method, amount tendered, split-payment allocation, promotion/custom-discount selection, and applicable reference/customer fields. Staff or manager PINs, credentials, and raw card data are never persisted.
- [ ] **CART-03**: Completing a sale or explicitly clearing the cart removes its persisted cart and Checkout draft. Cancelling Checkout returns to the selling screen and clears only the Checkout-open marker/draft while retaining the active cart.
- [ ] **CART-04**: If the application exits after payment submission begins but before the result is shown, restart recovery reconciles that same attempt against the backend using its original idempotency identity before enabling another payment action. A completed attempt shows its existing receipt; an incomplete attempt resumes safely; recovery never silently creates a new payment identity that could duplicate the sale.

### Unsaved Settings Protection

- [ ] **SET-01**: Every editable Settings tab reports whether it has unsaved changes. Switching Settings tabs, navigating to another route/page, or closing the Tauri application while changes are dirty presents **Save**, **Discard**, and **Stay** actions; browser reload/window-close surfaces the platform-native unsaved-changes warning where a custom asynchronous dialog is unavailable.
- [ ] **SET-02**: **Save** waits for the relevant settings mutation to succeed before continuing the pending navigation or close. A failed save keeps the user on the current form with its values intact and an actionable error; **Discard** continues without saving; **Stay** cancels the pending exit.

### Checkout Cash Keypad

- [ ] **KEYPAD-01**: Cash Checkout displays a touch-friendly keypad for the amount-tendered field only, with digits 0–9, decimal, clear, and backspace. Existing Exact and quick-tender buttons remain available; keypad controls are keyboard-accessible, have translated accessible labels, are disabled while payment is processing, and participate in CART-02 restart restoration.

Automated Vitest and Playwright coverage must prove active-cart and Checkout restoration, safe
in-flight payment reconciliation without duplicate sales, all settings-exit decisions (including a
failed save), and cash-keypad entry/accessibility.

## Phase 31 Requirements — Product Catalog Detail & Photo Upload

Milestone goal: reshape the existing product add/edit dialog into a larger view+edit+photo layout,
with one photo per product stored in Supabase Storage. Explored via `/gsd-explore` 2026-09-07.
Codebase check confirmed no existing Storage bucket usage anywhere in `src/` — this is a new
integration, not an extension of one. Distinct from Phase 18 (`PEEK-01..04`), which is a separate
Tauri window triggered by a barcode scan at checkout — different trigger, different window, unaffected
by this phase.

### Product Detail Dialog & Photo

- [x] **PCAT-01**: Clicking a product in Inventory → Catalog opens the existing product dialog, reshaped (larger, tabbed/sectioned) to show and edit full product detail plus its photo in one place — not a new read-only layer in front of the existing dialog.
- [x] **PCAT-02**: Every existing editable product field remains editable inline in the reshaped dialog, gated by the existing `manage_products` RBAC action (unchanged gate, no new permission).
- [x] **PCAT-03**: A product can have one photo, uploaded to a new Supabase Storage bucket and referenced by a `photo_url` column on `products` (not a base64/client-local data URL). Re-uploading replaces the existing photo; storage writes are restricted by RLS to staff holding `manage_products`.
- [x] **PCAT-04**: Automated Playwright E2E coverage proves the reshaped dialog's open/edit/save round-trip, photo upload and replace, RBAC denial for a role without `manage_products`, and that Phase 18's separate peek window is unaffected.

## Phase 32 Requirements — Brand Entity & Pack-Weight Catalog Attributes

Milestone goal: products can be grouped under a brand and describe their pack size, both filterable
in product search. Explored via `/gsd-explore` 2026-09-07. Codebase check confirmed the domain model
has no brand or weight/unit concept today — new schema, not an extension of the existing loose-weight
checkout/open-unit (case→piece) system, which stays untouched.

### Brand & Weight Attributes

- [x] **BRND-01**: A new `brands` table supports create/edit/delete through its own management UI, following the same CRUD pattern as existing Categories management, gated by `manage_products`.
- [x] **BRND-02**: `products` gains a nullable `brand_id` FK; the Phase 31 product dialog lets a product be assigned a brand via a select populated from `brands`.
- [x] **BRND-03**: `products` gains `weight_amount` (numeric) and `weight_unit` (enum: g, kg, lb, oz) as a catalog/display attribute describing pack size — independent of and not replacing the existing loose-weight-at-checkout / open-unit (case→piece) system.
- [x] **BRND-04**: Product search / catalog browsing can filter by brand and by weight unit, in addition to the existing category filter.
- [x] **BRND-05**: Automated Playwright E2E coverage proves brand CRUD, RBAC denial for a role without `manage_products`, weight field validation, and filter-by-brand/weight in the product search UI. (Plan 01: brand CRUD/RBAC/weight-validation coverage shipped in `e2e/products/brands.spec.ts` + `product-management.spec.ts` PM19/PM20; Plan 02: filter-by-brand/weight coverage shipped in `product-management.spec.ts` PM21 + `e2e/checkout/product-grid-brand-weight-filters.spec.ts`.)

## Phase 33 Requirements — Login Screen Store Branding

Milestone goal: the login screen shows the store's name and a large logo on its left side. Explored
via `/gsd-explore` 2026-09-07. Codebase check confirmed no store-name concept exists anywhere (app
title is the generic "Supermarket POS"); the only existing logo (`ReceiptSettingsSchema.logoDataUrl`)
is a small base64 data URL sized for receipt printing, not fit to display large on a login screen —
new dedicated fields, not a reuse of the receipt ones.

### Store Branding

- [x] **STORE-01**: New dedicated `storeName` (text) and `storeLogoUrl` settings fields, populated via Supabase Storage upload using the same upload pattern as Phase 31's product photo — distinct from the existing receipt-only `headerLine2`/`logoDataUrl` fields, which are unchanged.
- [x] **STORE-02**: The login screen displays the configured store name and a large logo on the left side of the screen, with a sane default (e.g. generic app name, no logo) when unconfigured.
- [x] **STORE-03**: Automated Playwright E2E/visual-regression coverage proves the login screen renders a configured store name/logo and the unconfigured fallback.

## Phase 34 Requirements — Tutorial Video Generation

Requested directly (not `/gsd-explore`'d) 2026-09-16: HD Playwright-driven video walkthroughs of every
POS feature/scenario/edge case, for customer staff-training runbooks and website embedding. User
constraints: Playwright + Chromium (already installed, no new deps), every recorded action holds 2-4s
before the next step so a human can follow along, videos live under a dedicated directory per domain,
and no open-ended e2e-spec-debugging loop — stop and ask rather than iterating unattended. Scope,
output location, bilingual coverage, and MP4-via-ffmpeg conversion confirmed with the user during
`/gsd-plan-phase` clarifying questions (2026-09-16): per-`e2e/`-domain videos + one long end-to-end
video, `tutorial-videos/` at repo root, es-MX + en-US, ffmpeg-converted MP4 output.

### Tutorial Videos

- [x] **VIDEO-01**: A reusable Playwright video-recording harness drives the real running app (HD viewport, native `.webm` video capture via Playwright's built-in `recordVideo`) with a scripted pause of 2-4 seconds after every meaningful UI action, so a human watching can see what happened before the next step begins.
- [x] **VIDEO-02**: One narrated-by-action video per `e2e/` domain folder (checkout, inventory, suppliers, payments, staff/rbac, caja, reports, promotions, receipts, purchase-orders, settings, audit) covering that domain's real workflow(s) plus its key edge cases/error states.
- [x] **VIDEO-03**: One long end-to-end video walking a full sale-to-close business day across roles (cashier checkout → manager approval/refund → admin reporting).
- [x] **VIDEO-04**: Every recorded scenario is produced in both es-MX and en-US via the app's existing per-staff locale switch (not two separate apps/builds).
- [x] **VIDEO-05**: Raw `.webm` captures are converted to HD `.mp4` via ffmpeg as a build step, written under `tutorial-videos/<domain>/` (or the long e2e video's own subfolder); `tutorial-videos/` is gitignored as build output, not committed source.
- [x] **VIDEO-06**: Recording scripts are planned and built directly (harness + per-domain scripts + generated videos) without an open-ended e2e-spec-debugging loop — if a recording script gets stuck matching an existing e2e spec's flow, the executor stops and asks rather than iterating unattended.

## v2 Requirements

Deferred to future release. Tracked but not in the v1.2 roadmap.

### Receipt Delivery

- **RCP-05**: Full outbound transactional email service beyond the existing Resend integration (templates, delivery-status tracking, bounce handling) — only if the store owner explicitly asks for more than PDF/print/existing-email coverage.

### AI Invoice Intake (v2/Beta, carried over from v1.1)

- **AI-01..05**: Extend the existing vision pipeline from name+price extraction to full invoice line items (qty/cost/supplier/expiry). Still v2/Beta scope, unchanged from Alpha.

### Receipt Designer + Inventory Expansion (deferred pieces from v1.3)

- Partial PO receiving / backorder remainder tracking — add once the full-receive PO flow (PO-03) is proven in daily use and short-shipments are observed often enough to justify it.
- Category-level shrinkage/turnover breakdown — cheap add once the store-level reports (INVR-02..04) exist and the owner asks for it.
- Locale-aware custom receipt field labels beyond the existing `receipt` i18n namespace — defer until a genuine bilingual-printing need surfaces.
- Trend view (week-over-week/month-over-month) for valuation/shrinkage/turnover — defer until the point-in-time reports have been used for at least a month.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Confirmation dialog on every scanned item | Directly regresses the stated "fast checkout" core value — doubles clicks per item on a multi-item basket; scope is mismatch-only (VER-01) |
| Barcode-scanner checksum re-validation in software | HID scanners already validate checksums (EAN-13/UPC-A) in firmware — re-implementing in the app solves an already-solved problem |
| Per-user rate limiting / cost dashboard for `agent-proxy` | Enterprise/multi-tenant scope; a static `max_tokens`/body-size cap (SEC-04) is sufficient for a 1-2 terminal single store |
| New outbound transactional email service beyond existing Resend integration | Would be a new external dependency/API surface; the existing `send-receipt-email` (Resend) path already covers email, PDF (RCP-03) extends it rather than replacing it |
| Counter/hanging scale hardware integration | Explicitly deferred to a future milestone if loose-weight items prove significant after Alpha usage (unchanged from v1.0/v1.1) |
| Multi-location/multi-warehouse support | Single store only — unchanged from prior milestones |
| Freeform drag-and-drop/pixel-canvas receipt builder | An 80mm thermal receipt is a fixed-width linear text/bitmap surface — a 2D canvas engine solves a problem that doesn't exist here; field toggles + live preview (RCPD-01) gets 95% of the value at a fraction of the maintenance cost |
| Custom fonts / rich typography on receipts | ESC/POS thermal printers only support built-in bitmap fonts + bold/double-height/width toggles; true custom fonts require rendering every line as an image |
| Multiple receipt templates per terminal/register | v1.1 (D-04) already made `receipt_settings` a deliberate store-wide singleton for this 1-2 terminal store; reopening that is scope creep with no real user behind it |
| Auto-PO generation / demand forecasting | Explicitly out of scope per PROJECT.md — forecasting accuracy on one store's noisy sales data is unreliable; PO-02's low-stock-seeded, manually-triggered draft gives the automation feeling without unattended ordering |
| Multi-level PO approval workflow | No organizational hierarchy to approve against (one owner/admin, maybe one manager) — an approval gate with no approver is dead UI |
| Multi-supplier price comparison / auto-routing | Requires maintaining live cross-supplier pricing and a comparison engine — real complexity the project's own scope discipline (no supplier scorecards) already rules out |
| EDI / API integration to auto-send POs to suppliers | This store's suppliers (small Indian grocery importers) don't run EDI-capable systems — building integration plumbing for a non-existent recipient is pure waste |
| FIFO/weighted-average COGS valuation engine | PROJECT.md explicitly excludes FIFO/FEFO costing engines; INVR-01 uses the product's existing weighted-average cost, which is sufficient for a single-store valuation report |
| AI/ML-driven shrinkage root-cause classification | Speculative machinery with no training data for this store; INVR-02's manual-reason-code rollup already gives 90% of the diagnostic value |
| Live/real-time-subscribed valuation & shrinkage dashboards | These are backward-looking, load-on-open reports (same pattern as the existing Reports page), not operational screens — Realtime subscriptions add complexity for no behavioral benefit |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SEC-03 | Phase 11 (v1.2, paused) | Pending |
| SEC-04 | Phase 11 (v1.2, paused) | Pending |
| VER-01 | Phase 12 (v1.2, paused) | Complete |
| VER-02 | Phase 12 (v1.2, paused) | Complete |
| RCP-01 | Phase 13 (v1.2, paused) | Complete |
| RCP-02 | Phase 13 (v1.2, paused) | Complete |
| RCP-03 | Phase 13 (v1.2, paused) | Complete |
| RCP-04 | Phase 13 (v1.2, paused) | Complete |
| RCPD-01 | Phase 15 (v1.3) | Complete |
| RCPD-02 | Phase 15 (v1.3) | Complete |
| PO-01 | Phase 16 (v1.3) | Complete |
| PO-02 | Phase 16 (v1.3) | Complete |
| PO-03 | Phase 16 (v1.3) | Complete |
| INVR-01 | Phase 14 (v1.3) | Complete |
| INVR-02 | Phase 14 (v1.3) | Complete |
| INVR-03 | Phase 14 (v1.3) | Complete |
| INVR-04 | Phase 14 (v1.3) | Complete |
| TEST-01 | Phase 17 (v1.3) | Complete |
| TEST-02 | Phase 17 (v1.3) | Complete |
| TEST-03 | Phase 17 (v1.3) | Complete |
| TEST-04 | Phase 17 (v1.3) | Complete |
| PEEK-01 | Phase 18 (v1.4) | Complete |
| PEEK-02 | Phase 18 (v1.4) | Complete |
| PEEK-03 | Phase 18 (v1.4) | Complete |
| PEEK-04 | Phase 18 (v1.4) | Complete |
| PRN-01 | Phase 19 (v1.5, proposed) | Complete |
| PRN-02 | Phase 19 (v1.5, proposed) | Complete |
| PRN-03 | Phase 19 (v1.5, proposed) | Complete |
| PRN-04 | Phase 19 (v1.5, proposed) | Complete |
| PRN-05 | Phase 19 (v1.5, proposed) | Complete |
| PRN-06 | Phase 19 (v1.5, proposed) | Complete |
| PRN-07 | Phase 19 (v1.5, proposed) | Complete |
| DEP-01 | Phase 20 (v1.6) | Complete |
| DEP-02 | Phase 20 (v1.6) | Complete |
| DEP-03 | Phase 20 (v1.6) | Complete |
| DEP-04 | Phase 20 (v1.6) | Complete |
| LCK-01 | Not yet roadmapped (v1.7) | Complete |
| LCK-02 | Not yet roadmapped (v1.7) | Complete |
| LCK-03 | Not yet roadmapped (v1.7) | Complete |
| LCK-04 | Not yet roadmapped (v1.7) | Complete |
| PINRST-01 | Phase 22 (v1.8) | Gaps Found |
| PINRST-02 | Phase 22 (v1.8) | Gaps Found |
| PINRST-03 | Phase 22 (v1.8) | Gaps Found |
| PINRST-04 | Phase 22 (v1.8) | Gaps Found |
| PINRST-05 | Phase 22 (v1.8) | Gaps Found |
| PINRST-06 | Phase 22 (v1.8) | Gaps Found |
| PINRST-07 | Phase 22 (v1.8) | Gaps Found |
| PINRST-08 | Phase 22 (v1.8) | Gaps Found |
| BTP-01 | Phase 23 (v1.9) | Not Started |
| BTP-02 | Phase 23 (v1.9) | Not Started |
| BTP-03 | Phase 23 (v1.9) | Not Started |
| BTP-04 | Phase 23 (v1.9) | Not Started |
| BTP-05 | Phase 23 (v1.9) | Not Started |
| BTP-06 | Phase 23 (v1.9) | Not Started |
| BTP-07 | Phase 23 (v1.9) | Not Started |
| BTP-08 | Phase 23 (v1.9) | Not Started |
| BTP-09 | Phase 23 (v1.9) | Not Started |
| BTP-10 | Phase 23 (v1.9) | Not Started |
| TAX-01 | Phase 24 (v1.10) | Complete |
| TAX-02 | Phase 24 (v1.10) | Complete |
| TAX-03 | Phase 24 (v1.10) | Complete |
| TAX-04 | Phase 24 (v1.10) | Complete |
| TAX-05 | Phase 24 (v1.10) | Complete |
| PROMO-01 | Phase 27 (v1.11) | Complete |
| PROMO-02 | Phase 27 (v1.11) | Complete |
| PROMO-03 | Phase 27 (v1.11) | Complete |
| PROMO-04 | Phase 27 (v1.11) | Complete |
| PROMO-05 | Phase 27 (v1.11) | Complete |
| PROMO-06 | Phase 27 (v1.11) | Complete |
| PROMO-07 | Phase 27 (v1.11) | Complete |
| PROMO-08 | Phase 27 (v1.11) | Complete |
| PROMO-09 | Phase 27 (v1.11) | Complete |
| PCAT-01 | Phase 31 | Complete |
| PCAT-02 | Phase 31 | Complete |
| PCAT-03 | Phase 31 | Complete |
| PCAT-04 | Phase 31 | Complete |
| BRND-01 | Phase 32 | Complete |
| BRND-02 | Phase 32 | Complete |
| BRND-03 | Phase 32 | Complete |
| BRND-04 | Phase 32 | Complete |
| BRND-05 | Phase 32 | Complete |
| STORE-01 | Phase 33 | Complete |
| STORE-02 | Phase 33 | Complete |
| STORE-03 | Phase 33 | Complete |
| VIDEO-01 | Phase 34 | Complete |
| VIDEO-02 | Phase 34 | Complete |
| VIDEO-03 | Phase 34 | Complete |
| VIDEO-04 | Phase 34 | Complete |
| VIDEO-05 | Phase 34 | Complete |
| VIDEO-06 | Phase 34 | Complete |

**Coverage:**

- v1.2 requirements (paused, Phase 11 discussion-only): 8 total, 8/8 mapped
- v1.3 requirements: 13 total, 13/13 mapped (Phase 14: INVR-01..04, Phase 15: RCPD-01/02, Phase 16: PO-01..03, Phase 17: TEST-01..04)
- v1.4 requirements: 4 total, 4/4 mapped (Phase 18: PEEK-01..04)
- v1.5 proposed requirements: 7 total, 7/7 mapped to Phase 19
- v1.6 proposed requirements: 4 total, 4/4 mapped to Phase 20
- v1.7 proposed requirements: 4 total, 0/4 mapped (not yet roadmapped)
- v1.8 requirements: 8 total, 8/8 mapped to Phase 22 (PINRST-01..08)
- v1.9 requirements: 10 total, 10/10 mapped to Phase 23 (BTP-01..10)
- v1.10 requirements: 5 total, 5/5 mapped to Phase 24 (TAX-01..05, not yet planned)
- v1.11 requirements: 9 total, 9/9 mapped to Phase 27 (PROMO-01..09, not yet planned)
- Phase 31 requirements: 4 total, 4/4 mapped (PCAT-01..04, not yet planned)
- Phase 32 requirements: 5 total, 5/5 mapped to Phase 32 (BRND-01..05, not yet planned)
- Phase 33 requirements: 3 total, 3/3 mapped to Phase 33 (STORE-01..03, not yet planned)
- Phase 34 requirements: 6 total, 6/6 mapped to Phase 34 (VIDEO-01..06, not yet planned)

---
*Requirements defined: 2026-08-19 (v1.2), 2026-08-19 (v1.3)*
*Last updated: 2026-08-31 — Phase 23 (Bank Transfer Payment Tracking) requirements formalized during `/gsd-plan-phase 23` from CONTEXT.md D-01..D-17 (no formal SPEC.md for this phase; decisions sourced from `/gsd-spike` sessions 002-005, not a live discuss-phase); BTP-01..10 added, traceability mapped 10/10*

*2026-08-31 — Phase 24 (Tax Configuration) added via `/gsd-explore`; TAX-01..05 captured, traceability mapped 5/5; grey areas (default toggle value, receipt copy, report/margin impact, exclusive-mode necessity) left open for discuss-phase, not decided here.*

*2026-09-01 — Phase 27 (Promotions & Discount Management) added via `/gsd-explore`; PROMO-01..09 captured, traceability mapped 9/9. Batch/lot-level expiry tracking explicitly deferred (see `.planning/seeds/batch-lot-expiry-tracking.md`); implementation-level open questions (exact tier table defaults, exact `manage_promotions` UI) left for discuss-phase/plan-phase.*

*2026-09-07 — Phases 31-33 (Product Catalog Detail & Photo Upload, Brand Entity & Pack-Weight Catalog Attributes, Login Screen Store Branding) added via `/gsd-explore`; PCAT-01..04, BRND-01..05, STORE-01..03 captured, traceability mapped 12/12. Confirmed Phase 31 is unrelated to Phase 18's barcode-scan peek window (different flow/window) and Phase 33's branding fields are new, not a reuse of the existing receipt-only logo/header settings. Implementation-level open questions (exact dialog tab layout, storage bucket naming, image size/format limits) left for discuss-phase/plan-phase.*

*2026-09-08 — Phase 31 (Product Catalog Detail & Photo Upload) shipped and verified complete (7/7 must-haves, `31-VERIFICATION.md`); PCAT-01..04 all Complete.*
