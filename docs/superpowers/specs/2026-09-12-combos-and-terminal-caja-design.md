# Combos in Promotions + Per-Terminal Caja — Design

Date: 2026-09-12 · Branch: `feat/combos-and-terminal-caja` · Target release: v1.5.0

Two independent features, one release. Decisions were made autonomously per the owner's
instruction ("do the research and make the required decision best for a feature-full POS");
every judgment call is tagged `R-nn` so it can be reversed individually.

---

## Part A — Combos as a promotion kind

### A.1 Product decision

A **combo is a promotion** (`promotions.kind = 'combo'`), created and listed on `/promotions`,
gated by the existing admin-only `manage_promotions` action. It reuses the promotion's name,
active flag, date range, day-of-week/time recurrence, audit trigger, RLS and list page. What a
combo adds is a **composition** (ordered slots, each "N units from this set of products/categories")
and a **combo pricing mode**.

Composition model (R-01) — slot-based, covers the three supermarket combo shapes without
special-casing any of them:

| Shape | Slots |
|---|---|
| Fixed bundle "Atta + Ghee + Tea for $199" | 3 slots, qty 1 each, one product per slot, `bundle_price` |
| Mix & match "Any 3 snacks for $50" | 1 slot, qty 3, category Snacks, `bundle_price` |
| Mexican 3x2 "buy 3 pay 2" | 1 slot, qty 3, category/product set, `cheapest_free` value 1 |
| "10% off when you buy rice + dal together" | 2 slots, qty 1, `percent` 10 |

Pricing modes for `kind='combo'` (R-02) reuse the existing `discount_type` column:

| `discount_type` | `discount_value` meaning | savings for one application |
|---|---|---|
| `bundle_price` | total price of one application | `max(0, Σunit − value)`; application skipped if `≤ 0` |
| `percent` | % off the bundle sum | `round2(Σunit × value/100)` |
| `fixed` | amount off the bundle sum | `min(value, Σunit)` |
| `cheapest_free` | N cheapest units in the application are free (integer, `1 ≤ N < total slot qty`) | Σ price of the N cheapest units |

### A.2 Combo eligibility flag (R-03)

- `products.combo_eligible boolean NOT NULL DEFAULT true` **already exists** (dormant since the
  Phase-1 combo drop, default true). Reused, not re-added.
- `categories.combo_eligible boolean NOT NULL DEFAULT true` — new column.
- **Effective eligibility** of a product = `product.combo_eligible AND every ancestor category's
  combo_eligible` (max depth 3 via existing `categories.parent_id`). Toggling a parent category off
  excludes the whole subtree; toggling a product off excludes only that product.
- Enforced in two places: the wizard picker only offers eligible products/categories, and the
  sale RPC re-checks eligibility at matching time (so a product toggled off after the combo was
  built silently stops matching — no stale combo can sell it).
- UI: "Combo eligible" `Checkbox` on `ProductDetailsTab` (next to Active) and on
  `CategoryTreeEditor`'s form. `productUpdateToRow`/create-insert and the category mutations map the
  column. Default true → zero behaviour change on day one.
- `products.is_combo` / `combo_price_override` stay dormant and untouched (out of scope).

### A.3 Schema (migration `20260913000001_combo_promotions.sql`)

```sql
ALTER TABLE promotions ADD COLUMN kind text NOT NULL DEFAULT 'discount'
  CHECK (kind IN ('discount','combo'));
ALTER TABLE promotions DROP CONSTRAINT promotions_discount_type_check;   -- name: verify in 20260901000001
ALTER TABLE promotions ADD CONSTRAINT promotions_discount_type_check
  CHECK (discount_type IN ('percent','fixed','bundle_price','cheapest_free'));
ALTER TABLE promotions ADD CONSTRAINT promotions_kind_type_consistent
  CHECK (kind = 'combo' OR discount_type IN ('percent','fixed'));
-- discount_value check: existing (>0, percent ≤ 100) still holds; cheapest_free must be integer:
ALTER TABLE promotions ADD CONSTRAINT promotions_cheapest_free_integer
  CHECK (discount_type <> 'cheapest_free' OR discount_value = floor(discount_value));

CREATE TABLE promotion_combo_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id uuid NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  position smallint NOT NULL CHECK (position >= 0),
  quantity smallint NOT NULL CHECK (quantity BETWEEN 1 AND 20),
  label text CHECK (label IS NULL OR char_length(label) <= 60),
  UNIQUE (promotion_id, position)
);
ALTER TABLE promotion_targets ADD COLUMN slot_id uuid
  REFERENCES promotion_combo_slots(id) ON DELETE CASCADE;
CREATE INDEX idx_promotion_targets_slot ON promotion_targets(slot_id);
ALTER TABLE categories ADD COLUMN combo_eligible boolean NOT NULL DEFAULT true;
```

RLS on `promotion_combo_slots`: same two policies as `promotion_targets`
(select authenticated / manage via `manage_promotions`). The existing partial-unique indexes on
`promotion_targets (promotion_id, product_id|category_id)` stay, which means **a product or
category can appear in only one slot of a given combo** (R-04; "2 of the same" is expressed with
slot quantity, not two slots).

Discount-kind promotions keep `slot_id = NULL` on every target; combo-kind promotions require
`slot_id` on every target (app-level; the RPC's discount candidate query adds `p.kind='discount'`
and the combo pass only reads targets `WHERE slot_id IS NOT NULL`).

`order_items` needs **no new column** (R-05): participating rows are stamped with the combo's
`promotion_id`, `discount_rate` (percent for `percent`, else NULL) and per-unit `discount_amount`,
exactly like a discount promotion. Refund/reopen/receipt/report code already reads those.

### A.4 Matching algorithm (R-06) — one spec, two implementations

Implemented identically in TypeScript (`src/entities/promotion/model/combo-pricing.ts`, pure,
unit-tested with fast-check) and plpgsql (inside `process_direct_sale_atomic`). The TS version drives
the live cart preview and the client's `expectedTotal`; the SQL version is the pricing authority.

Inputs: cart lines (product id, category id, effective combo eligibility, `quantity`,
`unit_price = base price + modifier price delta`, per-line promo savings per unit already computed
by the existing best-promotion pass, `sold_by_weight`), active combo promotions (already filtered
by `active`, date range, day-of-week, time window — same predicates as discount promotions).

```
units := expand each non-weight line into `quantity` units {lineRef, price, lineSavings}
applied := []
loop (max 50):
  best := null
  for combo in combos (ordered created_at DESC for determinism):
    app := tryFill(combo, free units)          -- for each slot, take the `quantity`
                                              -- highest-priced free eligible units;
                                              -- fail if any slot can't fill
    if !app: continue
    gross := savings(combo, app.units)        -- table in A.1
    net   := gross − Σ app.units.lineSavings  -- forgone per-line promo/expiry discounts
    if net <= 0: continue                     -- combo must beat what those units already get
    if best == null or net > best.net: best := {combo, app, gross, net}
  if best == null: break
  mark best.app.units consumed; applied.push(best)
```

Per-unit discount allocation inside an application:
`cheapest_free` → 100 % on the N cheapest units, 0 on the rest;
`percent` → `round2(price × value/100)` each;
`bundle_price` / `fixed` → proportional to unit price, rounded to 2 dp, remainder on the
last unit so Σ equals `gross` exactly.

A unit consumed by a combo **loses its per-line promotion** (no stacking, R-07); its
`promotion_id` becomes the combo's. Units not consumed keep whatever the per-line pass gave them.
Weight-sold lines never participate. Modifier deltas are part of the unit price.

Server output: `order_items` rows are split so each row has a single
(`promotion_id`, `discount_amount`) — e.g. a qty-3 line where one unit is free becomes
`qty 2 @ full` + `qty 1 @ 0`. The existing `AMOUNT_MISMATCH`, floor-guard
(`BELOW_COST_REQUIRES_OVERRIDE`, evaluated per resulting row) and
`record_audit('promotion.apply', …)` paths run unchanged over the split rows.

Client output (`ComboEvaluation`): `{ applications: [{promotionId, name, unitTempIds, gross, net}],
netSavings }`. `netSavings` is subtracted from Σ`lineTotal` to obtain the sale total the server
will compute (proof: Σbase − Σline-disc(unconsumed) − Σcombo-gross).

### A.5 Client architecture

- `src/shared/lib/domain.ts`: `PromotionKindSchema = z.enum(['discount','combo'])`,
  `DiscountTypeSchema` extended with `bundle_price` | `cheapest_free`, `PromotionComboSlotSchema`
  `{id, promotionId, position, quantity, label, targets: PromotionTarget[]}`, `PromotionSchema` gains
  `kind` (default `'discount'`) and `slots: PromotionComboSlot[]` (default `[]`),
  `PromotionTargetSchema` gains `slotId` nullable, `CategorySchema` gains `comboEligible`
  (default true), `ProductSchema.comboEligible` already present. `ComboEvaluationSchema` for the
  cart store.
- `src/entities/promotion/model/queries.ts`: `usePromotions` selects
  `*, promotion_targets(*), promotion_combo_slots(*)` and nests targets under their slot for combo
  rows; create/update write slots + slot-scoped targets (delete-all-then-reinsert, existing
  pattern). Shared helper `saveComboSlots(promotionId, slots)`.
- `src/entities/promotion/model/combo-pricing.ts`: `evaluateCombos(...)` per A.4 +
  `isProductComboEligible(product, categoriesById)`; `combo-pricing.test.ts` with examples for each
  pricing mode + fast-check invariants (Σ allocation = gross; net ≤ gross; no unit consumed twice;
  discount ≤ price).
- `promotion-pricing.ts::evaluateBestPromotion` skips `kind === 'combo'` candidates.
- `src/entities/tab/model/cartStore.ts`: new non-persisted `comboResult: ComboEvaluation | null`
  + `setComboResult`; `totalAmount()` stays Σ`lineTotal`; new `comboNetSavings()` selector.
- `src/widgets/CheckoutPanel`: `useEffect` recomputes `evaluateCombos` on
  `[items, promotions, categories, minute tick]` → `setComboResult`. Renders a "Combos" block below
  the lines: one row per application (`name · −$net`), and a "Combo savings" row in the totals `dl`;
  Total = subtotal − combo savings. Each participating `CartItem` line shows a small "Combo" badge
  (existing promotion badge component with a different label).
- `src/widgets/PaymentModal/ui/PaymentForm.tsx`: subtotal input = Σ`lineTotal` −
  `comboNetSavings`; the manual "Apply Promotion" select lists only `kind==='discount'`.
- `src/features/checkout-sale`: unchanged wire format (base prices are sent; server prices).
- `src/features/manage-promotions/ui/PromotionDialog.tsx` (R-08): a kind segmented control
  (Discount / Combo) at the top of section 01, editable only on create. Combo mode renders:
  01 Basics (name, kind), 02 Composition (`ComboSlotsEditor`: list of slots, each with a qty
  stepper, optional label, and a `MultiSelectPicker` fed only eligible products/categories; add/remove
  slot; ≥ 1 slot, every slot ≥ 1 target), 03 Pricing (4-way mode select + value input with mode-specific
  validation, incl. `cheapest_free` value < Σ slot qty), 04 When (existing
  `StepValidityRecurrence`), right rail `StepReview` extended with a combo summary and a worked
  example using the first eligible product per slot. Discount mode is pixel-identical to today.
  `usePromotionWizardState` gains `kind`, `slots`, `comboPricing` state + validation + `save()` mapping.
- `/promotions` list: scope cell shows `Combo · N slots`, discount cell shows the mode label
  (`$199 bundle`, `10 % off bundle`, `1 cheapest free`), a "Kind" filter chip.
- Receipt: no change (per-row promotion discount line already prints). Reports: no change.
- i18n: all new copy in en-US + es-MX (`wAdmin.promotionDialog.combo.*`, `wAdmin.promotionsListPanel.*`,
  `wPanels.checkoutPanel.combo*`, `entities.cartItem.comboApplied`, `featMgmt.*comboEligible`).

### A.6 Server (`process_direct_sale_atomic`)

Re-create from the **latest** body (`20260912000002_platform_tenders_rappi_uber_eats.sql:623`; after
Part B lands, from `20260913000000_caja_per_terminal.sql`). Changes:

1. Discount candidate query adds `AND p.kind = 'discount'`.
2. After the per-item loop, a combo pass over `v_derived_items` implements A.4 using a temp table
   `_sale_units (unit_no, item_idx, product_id, category_id, price, line_discount, eligible, combo_promo_id, combo_discount)`.
   Combo candidates = `promotions WHERE kind='combo' AND active AND now() BETWEEN starts_at AND ends_at`
   + the same DOW/time predicates, with slots and targets loaded per candidate.
   Eligibility = `products.combo_eligible AND NOT EXISTS (ancestor category with combo_eligible=false)`
   via a recursive CTE on `categories.parent_id`.
3. `v_derived_items` is re-materialised as split rows before the existing INSERT loop.
4. Everything else (floor guard, tax, `AMOUNT_MISMATCH`, receipts) unchanged.

### A.7 Tests

- Unit: `combo-pricing.test.ts` (examples + properties), `usePromotionWizardState.test.ts` combo
  cases, `PromotionDialog.test.tsx` kind switch, `cartStore.test.ts` combo selectors,
  `promotion-pricing.test.ts` "skips combo kind".
- Integration: `promotion-rpc.integration.test.ts` gains one case per pricing mode against the local
  RPC (asserts split `order_items` rows and total).
- E2E (`e2e/promotions/combo-wizard.spec.ts`, `e2e/checkout/combo-checkout.spec.ts`,
  `e2e/products/combo-eligibility.spec.ts`): create a 3x2 combo via the dialog → appears in list with
  "Combo"; scan 3 eligible items → Combos block shows the application and total drops by the cheapest
  unit; checkout succeeds and the DB has the split rows; toggling a product's Combo-eligible off
  removes it from the picker and from matching.

---

## Part B — Caja per terminal

### B.1 Current state → target

Today: **one open caja for the whole database** (`caja_sessions_one_open` partial-unique index on
`status`), opened by a manager, with no terminal column; `useCurrentCaja` picks "the" open row.
Target (R-09): **one open caja per terminal**; each terminal opens, sells against, and closes its own
drawer; the caja report/list shows the terminal.

### B.2 Terminal identity (R-10)

New `src/shared/lib/terminal.ts`:

```ts
getTerminalId(): string   // localStorage 'pos.terminal_id' → VITE_TERMINAL_ID → 'POS-1'
setTerminalId(id): void   // validated /^[A-Za-z0-9_-]{1,32}$/
```

Replaces the 13 inline `const TERMINAL_ID = import.meta.env.VITE_TERMINAL_ID ?? 'POS-1'` copies
and the hardcoded `src/shared/config/constants.ts` export (deleted; its 4 importers switch).
`license/terminal-id.ts::getTerminalName()` delegates to it. Settings → Hardware gains an
admin-only "Terminal ID" field (saved to localStorage, toast on save, helper text "Used to key this
terminal's cash register and audit trail"). E2E and dev keep working unchanged (`POS-1`).

### B.3 Schema (migration `20260913000000_caja_per_terminal.sql`)

```sql
ALTER TABLE caja_sessions ADD COLUMN terminal_id text NOT NULL DEFAULT 'POS-1'
  CHECK (terminal_id ~ '^[A-Za-z0-9_-]{1,32}$');
DROP INDEX caja_sessions_one_open;
CREATE UNIQUE INDEX caja_sessions_one_open_per_terminal
  ON caja_sessions (terminal_id) WHERE status = 'open';
CREATE INDEX idx_caja_sessions_terminal_opened ON caja_sessions (terminal_id, opened_at DESC);
```

- `caja_open(p_opening_cash, p_opened_by, p_terminal_id)` now **stores**
  `terminal_id = COALESCE(NULLIF(trim(p_terminal_id),''), 'POS-1')` (it previously only forwarded it
  to `record_audit`). Duplicate open on the same terminal → existing `unique_violation` → client
  maps to `DUPLICATE_ENTRY` with a "this terminal already has an open caja" message.
- `process_direct_sale_atomic` gains `p_terminal_id text DEFAULT NULL` (R-11): when non-null the
  CAJA guard also requires `caja_sessions.terminal_id = p_terminal_id`, otherwise returns
  `CAJA_CLOSED` with message `caja belongs to terminal <x>`. Edge function `process-direct-sale`
  accepts optional `terminalId` and forwards it; `edge-function-contracts.ts` adds the optional field;
  `useCheckoutSale` sends `getTerminalId()`.
- `close_caja_session`, `get_caja_report`, entries: unchanged (already keyed by session id).

### B.4 Client

- `CajaSessionSchema` gains `terminalId`; `mapCajaRow` maps it.
- `useCurrentCaja`: `.eq('status','open').eq('terminal_id', getTerminalId())`. `cajaKeys.current`
  includes the terminal id. `posTools.ts::resolveOpenCajaId` gets the same filter (and switches to
  `status='open'`).
- `useMutationOpenCaja`: passes `getTerminalId()`; maps `23505` to `DUPLICATE_ENTRY`.
- `useMutationCloseCaja` (R-12): returns the RPC's `cashReconciliation` instead of `undefined`;
  `CajaDashboard` shows a post-close summary dialog (opening cash, cash sales, expected, counted,
  variance coloured by sign) — the variance was previously computed and discarded.
- `CajaDashboard`: header badge "Terminal POS-1"; open dialog shows which terminal is being opened.
- `useCajaList` / `CajaReportPanel`: session picker label `date · terminal · status`; report header
  shows the terminal.
- Caja store persisted key unchanged; a caja opened on another terminal is never loaded because the
  query is terminal-scoped.

### B.5 Tests

- Unit: `terminal.test.ts` (precedence + validation), `caja/queries.test.ts` new cases for
  `useCurrentCaja` terminal filter and open-caja duplicate mapping, `CajaDashboard.test.tsx` close
  summary + terminal badge, `HardwareSettingsTab.test.tsx` terminal field.
- E2E `e2e/caja/per-terminal.spec.ts`: terminal A (default) opens caja; set
  `localStorage['pos.terminal_id']='POS-2'` in a second context, open a second caja (allowed), complete
  a sale on POS-2 → `tabs.caja_session_id` = POS-2's session; close POS-2 → POS-1 still open; opening a
  second caja on POS-1 is refused with the duplicate message. Existing `e2e/helpers/supabase.ts::openCaja`
  keeps closing every leftover open session (all terminals) — it must add nothing, default applies.

---

## Part C — Release

- Version bump `1.4.5 → 1.5.0` in `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` (+ Cargo.lock),
  and `package.json` (align it, it is stuck at 0.1.0). Note: tag `v1.4.6` already exists while the
  manifests say 1.4.5 — v1.5.0 supersedes it.
- Migrations applied locally with `npx supabase migration up`; types regenerated with
  `npx supabase gen types typescript --local > src/shared/lib/supabase.types.ts`.
- Merge to `main` (fast-forward), push, tag `v1.5.0`, push tag (triggers `release.yml`).
- **Production DB/edge functions** (`mkvinyekkyennyegfoxq`): `supabase db push --linked --yes` and
  `supabase functions deploy process-direct-sale` are required before customers receive v1.5.0 —
  the app queries `caja_sessions.terminal_id` on boot. See the final report for the status of this step.

## Out of scope

`products.is_combo`/`combo_price_override` cleanup; combo-specific reports; per-terminal
receipt/printer settings; multi-store; combos on weight-sold items; stacking a combo with a per-line
promotion; the mobile-admin app (reads sessions; the new column is additive).
