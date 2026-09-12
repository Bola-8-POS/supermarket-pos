# Combo Promotions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Combos (fixed bundles, mix-and-match "any N for $X", Mexican 3x2 "cheapest free", "% off when bought together") as a new kind of promotion, built in the promotions dialog, auto-applied at checkout on both the live cart and the authoritative sale RPC, with per-product and per-category "combo eligible" flags.

**Architecture:** `promotions.kind = 'combo'` + `promotion_combo_slots` (N units from a set) + `promotion_targets.slot_id`. One matching algorithm (spec A.4) implemented twice: `combo-pricing.ts` (cart preview + client expected total) and plpgsql inside `process_direct_sale_atomic` (pricing authority; splits `order_items` rows so each row has one discount). No new `order_items` columns.

**Tech Stack:** Postgres/plpgsql, React 19, TanStack Query, Zustand, Zod v4, cmdk `MultiSelectPicker`, Vitest + fast-check, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-12-combos-and-terminal-caja-design.md` (Part A). **Depends on** the caja plan's Task 2 having landed (`process_direct_sale_atomic` now has 20 params and lives in `20260913000000_caja_per_terminal.sql` — copy the body from THERE).

## Global Constraints

Same as `docs/superpowers/plans/2026-09-12-caja-per-terminal.md` → "Global Constraints" (repo root, TS strictness, i18n both locales, FSD, migration hygiene, latest-RPC-body rule, scoped tests, commit trailer). Additional:
- Money math: 2-decimal rounding via `Math.round(x * 100) / 100` on the client and `ROUND(x, 2)` in SQL; allocations must sum exactly (remainder onto the last unit).
- Combo candidates are ordered `created_at DESC` for determinism in both implementations; ties in `net` savings keep the first encountered.
- Weight-sold lines (`sold_by_weight` / `weight_grams`) never participate in combos.
- Unit price for matching = catalog base price + modifier price delta.

---

### Task 1: Migration `20260913000001_combo_promotions_schema.sql` + types

**Files:**
- Create: `supabase/migrations/20260913000001_combo_promotions_schema.sql`
- Regenerate: `src/shared/lib/supabase.types.ts`
- Test: `src/entities/promotion/model/combo-schema.integration.test.ts`

**Interfaces (produces):** columns/tables exactly as spec A.3 (`promotions.kind`, extended `discount_type` CHECK, `promotions_kind_type_consistent`, `promotions_cheapest_free_integer`, table `promotion_combo_slots(id, promotion_id, position, quantity, label)`, `promotion_targets.slot_id`, `categories.combo_eligible`).

- [ ] **Step 1: Failing integration test** (service-role client like the caja plan's Task 2):
  - inserting `kind:'combo', discount_type:'bundle_price', discount_value: 199` succeeds; inserting `kind:'discount', discount_type:'bundle_price'` fails with `23514`; `discount_type:'cheapest_free', discount_value: 1.5` fails `23514`.
  - a slot row `{promotion_id, position: 0, quantity: 3}` inserts; `quantity: 0` fails; duplicate `(promotion_id, position)` fails `23505`.
  - a target with `slot_id` inserts; deleting the slot cascades the target.
  - `categories.combo_eligible` defaults `true`.
  - cleanup: delete promotions named `'ITEST combo%'` in `afterAll`.
- [ ] **Step 2:** Run → FAIL. Write the migration (spec A.3 SQL verbatim; the existing constraint to drop is the inline `CHECK (discount_type IN ('percent','fixed'))` — find its auto-generated name with `SELECT conname FROM pg_constraint WHERE conrelid='promotions'::regclass AND pg_get_constraintdef(oid) ILIKE '%discount_type%'` and use `ALTER TABLE promotions DROP CONSTRAINT <name>`; if the name is not stable, do it dynamically in a `DO $$ … $$` block). RLS on `promotion_combo_slots`: copy the two `promotion_targets_*` policies from `20260904000001_promotion_targets_recurrence.sql:58-61` renamed `promotion_combo_slots_select_authenticated` / `promotion_combo_slots_manage`. Add `promotion_combo_slots` to the promotions audit trigger only if that trigger is table-specific (it is on `promotions` — leave it).
- [ ] **Step 3:** `npx supabase migration up`, regenerate types, run test → PASS.
- [ ] **Step 4: Commit** `feat(promotions): combo kind, slots, and combo-eligible flags (schema)`

---

### Task 2: Domain schemas + promotion entity read/write of slots

**Files:**
- Modify: `src/shared/lib/domain.ts` (~:160 `DiscountTypeSchema = z.enum(['percent','fixed','bundle_price','cheapest_free'])`; new `PromotionKindSchema = z.enum(['discount','combo'])`; `PromotionTargetSchema` + `PromotionTargetInputSchema` gain `slotId: UuidSchema.nullable().optional()`; new `PromotionComboSlotSchema = z.object({ id: UuidSchema, promotionId: UuidSchema, position: z.number().int().min(0), quantity: z.number().int().min(1).max(20), label: z.string().max(60).nullable(), targets: z.array(PromotionTargetSchema).default([]) })`, `PromotionComboSlotInputSchema` (`{ quantity, label, targets: PromotionTargetInput[] }`); `PromotionSchema` gains `kind: PromotionKindSchema.default('discount')`, `slots: z.array(PromotionComboSlotSchema).default([])`; `PromotionCreateSchema`/`PromotionUpdateSchema` gain `kind` and `slots: z.array(PromotionComboSlotInputSchema).optional()`; `CategorySchema` gains `comboEligible: z.boolean().default(true)`; `CategoryCreate/Update` inherit; export types `PromotionKind`, `PromotionComboSlot`, `PromotionComboSlotInput`)
- Modify: `src/entities/promotion/model/queries.ts` (`usePromotions` select `'*, promotion_targets(*), promotion_combo_slots(*)'`; `mapPromotionRow` builds `slots` sorted by `position`, each with `targets = promotion_targets.filter(t => t.slot_id === slot.id)`, and top-level `targets` = targets with `slot_id IS NULL`; new internal `async function saveComboSlots(promotionId, slots: PromotionComboSlotInput[])` = delete all `promotion_combo_slots` for the promotion (targets cascade), insert slots with `position = index`, then insert targets with `slot_id`; create mutation calls it when `kind==='combo'`; update mutation calls it when `input.slots !== undefined`)
- Modify: `src/entities/category/model/queries.ts` (`mapCategoryRow` maps `combo_eligible`; create/update write `combo_eligible` when defined)
- Modify: `src/entities/promotion/model/promotion-pricing.ts:~105` (`if (promo.kind === 'combo') continue;`)
- Test: `src/entities/promotion/model/queries.test.ts` (create if absent: pure `mapPromotionRow` tests), `promotion-pricing.test.ts` ("ignores combo-kind promotions"), `src/shared/lib/domain.test.ts` (Promotion parses with defaults `kind:'discount'`, `slots:[]`).

- [ ] **Step 1:** Failing tests: `mapPromotionRow` nests two slots (positions 1,0 → sorted 0,1) with their targets and leaves slot-less targets at top level; `evaluateBestPromotion` returns null when the only candidate has `kind:'combo'`; domain defaults.
- [ ] **Step 2:** Implement → PASS. Existing `usePromotionWizardState.test.ts`, `PromotionDialog.test.tsx` still green (they construct `Promotion` objects — the new fields default). `npm run typecheck`.
- [ ] **Step 3: Commit** `feat(promotions): combo kind + slots in domain and entity layer`

---

### Task 3: `combo-pricing.ts` — pure matching algorithm

**Files:**
- Create: `src/entities/promotion/model/combo-pricing.ts`, `src/entities/promotion/model/combo-pricing.test.ts`
- Modify: `src/entities/promotion/index.ts` (export `evaluateCombos`, `isProductComboEligible`, types)

**Interfaces (produces):**

```ts
export interface ComboCartLine {
  tempId: string; productId: string; categoryId: string;
  quantity: number; unitPrice: number;           // base + modifier delta
  lineDiscountPerUnit: number;                   // per-line promo/expiry savings already applied (0 if none)
  soldByWeight: boolean; comboEligible: boolean;  // product flag only; category chain resolved via isProductComboEligible
}
export interface ComboUnitAllocation { tempId: string; discountAmount: number }   // one entry per consumed unit
export interface ComboApplication {
  promotionId: string; promotionName: string; discountType: DiscountType; discountRate: number | null;
  units: ComboUnitAllocation[]; gross: number; net: number;
}
export interface ComboEvaluation { applications: ComboApplication[]; netSavings: number }
export function isProductComboEligible(product: { comboEligible: boolean; categoryId: string }, categoriesById: Map<string, { comboEligible: boolean; parentId: string | null | undefined }>): boolean
export function evaluateCombos(lines: ComboCartLine[], promotions: Promotion[], now: Date, timezone: string, categoriesById: Map<string, { comboEligible: boolean; parentId: string | null | undefined }>): ComboEvaluation
```
`evaluateCombos` filters `promotions` to `kind==='combo' && active && startsAt<=now<=endsAt` and the same DOW/time window logic as `evaluateBestPromotion` (extract that predicate into a shared helper `isPromotionLiveAt(promo, now, timezone)` in `promotion-pricing.ts` and reuse it). Slot membership: a unit matches a slot if any slot target has `productId === unit.productId` or `categoryId ∈ ancestors(unit.categoryId) ∪ {unit.categoryId}`. `discountRate` = `discountValue` for `percent`, else `null`.

- [ ] **Step 1: Failing tests** (factory `makeCombo(overrides)` + `line(id, price, qty, cat)` helpers):
  - 3x2 (`cheapest_free`, value 1, one slot qty 3 on category `snacks`): lines A 10×1, B 20×1, C 30×1 → one application, `gross 10`, `net 10`, unit for A has `discountAmount 10`, others 0; `netSavings 10`.
  - 3x2 with 4 units 10,20,30,40 → picks 20,30,40 (highest first), frees 20; `netSavings 20`, one unit left.
  - 6 units → two applications.
  - bundle_price 199 over slots [atta], [ghee], [tea] priced 100/120/40 → gross 61, proportional allocation sums to 61 exactly (assert `Σ === 61` after rounding), remainder on last.
  - bundle_price higher than Σ → no application.
  - percent 10 over two slots → each unit 10 % of its price.
  - fixed 15 over Σ 40 → allocation sums 15; fixed 100 over Σ 40 → gross 40.
  - net rule: units already carrying `lineDiscountPerUnit` totalling ≥ combo gross → no application.
  - weight line ignored; product with `comboEligible:false` ignored; product under an ineligible parent category ignored (`isProductComboEligible` unit test with a 3-deep chain).
  - inactive / out-of-date-range / wrong DOW combos ignored.
  - a product can fill only one slot per application (product appears in two slots' target sets — cannot happen by DB rule, but unit not reused).
  - fast-check property: for random lines/combos — no `tempId` unit allocated more times than its quantity; every `discountAmount ≤ unitPrice`; `Σ units.discountAmount === gross` per application (±0); `net ≤ gross`; `netSavings === Σ net`.
- [ ] **Step 2:** Run → FAIL. Implement per spec A.4 (expand units, greedy best-net loop with `MAX_APPLICATIONS = 50`, take highest-priced free eligible units per slot, allocation rules). Run → PASS.
- [ ] **Step 3: Commit** `feat(promotions): combo matching algorithm (client)`

---

### Task 4: Server pricing — `20260913000002_combo_sale_pricing.sql`

**Files:**
- Create: `supabase/migrations/20260913000002_combo_sale_pricing.sql`
- Test: `src/entities/promotion/model/promotion-rpc.integration.test.ts` (extend)

**Interfaces:** `process_direct_sale_atomic` signature unchanged (20 params, from `20260913000000_caja_per_terminal.sql`). Behaviour: combo pass after the item loop; `order_items` rows split by discount.

- [ ] **Step 1: Failing integration tests** (follow the file's existing setup: open caja + shift for the fixture manager, seed products/categories with service role, call the RPC, inspect `order_items`, clean up). Add four cases:
  - **3x2**: combo `cheapest_free` value 1, slot qty 3 targeting category X; items = 3 different products in X priced 10/20/30 qty 1 → `ok:true`; `order_items` has 3 rows; the 10-priced row has `unit_price 0`, `discount_amount 10`, `promotion_id = combo.id`; total = 50 (+tax per settings — compute like the existing tests do).
  - **split rows**: same combo, one product qty 3 @ 10 → two rows: `qty 2 unit_price 10 discount 0` and `qty 1 unit_price 0 discount 10`.
  - **bundle_price** 25 over slots [P1],[P2] priced 20/10 → both rows discounted, `Σ discount_amount×qty = 5`.
  - **eligibility**: product with `combo_eligible=false` in category X → no combo applied, full price.
  - **beats per-line promo only when better**: a 50 % discount promotion on X plus the 3x2 combo → per-line wins (rows carry the discount promotion's id, not the combo's).
- [ ] **Step 2:** Run → FAIL. Write the migration: `CREATE OR REPLACE FUNCTION public.process_direct_sale_atomic(<20 params verbatim>)` with the body from `20260913000000_caja_per_terminal.sql` plus:
  1. In the discount candidate query (the `SELECT … FROM promotions p WHERE p.active …` inside the item loop) add `AND p.kind = 'discount'`.
  2. New DECLAREs: `v_combo record; v_slot record; v_unit record; v_app_units int[]; v_gross numeric; v_net numeric; v_best_net numeric; v_best_combo_id uuid; v_best_units int[]; v_best_gross numeric; v_best_type text; v_best_value numeric; v_iter int := 0; v_sum numeric; v_alloc numeric; v_running numeric; v_idx int; v_n int;`
  3. After `END LOOP;` of the item loop and **before** `v_subtotal := ROUND(v_subtotal, 2);`, insert the combo pass:

```sql
  -- ===== Combo pass (spec A.4) =====
  CREATE TEMP TABLE IF NOT EXISTS _sale_units (
    unit_no serial PRIMARY KEY, item_idx int NOT NULL, product_id uuid NOT NULL, category_id uuid NOT NULL,
    price numeric NOT NULL, line_discount numeric NOT NULL, eligible boolean NOT NULL,
    combo_promo_id uuid, combo_discount numeric, combo_rate numeric, consumed boolean NOT NULL DEFAULT false
  ) ON COMMIT DROP;
  TRUNCATE _sale_units;
  INSERT INTO _sale_units (item_idx, product_id, category_id, price, line_discount, eligible)
  SELECT i.idx - 1, (i.elem->>'product_id')::uuid, p.category_id,
         (i.elem->>'unit_price')::numeric + (i.elem->>'discount_amount')::numeric + (i.elem->>'modifier_price_delta')::numeric,
         (i.elem->>'discount_amount')::numeric,
         p.combo_eligible AND NOT EXISTS (
           WITH RECURSIVE anc AS (
             SELECT c.id, c.parent_id, c.combo_eligible FROM categories c WHERE c.id = p.category_id
             UNION ALL SELECT c.id, c.parent_id, c.combo_eligible FROM categories c JOIN anc ON c.id = anc.parent_id)
           SELECT 1 FROM anc WHERE NOT anc.combo_eligible)
  FROM jsonb_array_elements(v_derived_items) WITH ORDINALITY AS i(elem, idx)
  JOIN products p ON p.id = (i.elem->>'product_id')::uuid
  CROSS JOIN generate_series(1, (i.elem->>'quantity')::int)
  WHERE NULLIF(i.elem->>'weight_grams', '') IS NULL AND NOT p.sold_by_weight;

  LOOP
    v_iter := v_iter + 1; EXIT WHEN v_iter > 50;
    v_best_net := 0; v_best_combo_id := NULL;
    FOR v_combo IN
      SELECT p.id, p.name, p.discount_type, p.discount_value
      FROM promotions p
      WHERE p.kind = 'combo' AND p.active AND now() BETWEEN p.starts_at AND p.ends_at
        AND (p.days_of_week IS NULL OR EXTRACT(DOW FROM now() AT TIME ZONE v_store_tz)::int = ANY(p.days_of_week))
        AND (p.start_time IS NULL OR (now() AT TIME ZONE v_store_tz)::time BETWEEN p.start_time AND p.end_time)
      ORDER BY p.created_at DESC
    LOOP
      v_app_units := ARRAY[]::int[]; v_sum := 0;
      FOR v_slot IN SELECT s.id, s.quantity FROM promotion_combo_slots s WHERE s.promotion_id = v_combo.id ORDER BY s.position LOOP
        SELECT array_agg(unit_no ORDER BY price DESC, unit_no) INTO v_best_units   -- reuse var as scratch
        FROM (
          SELECT u.unit_no, u.price FROM _sale_units u
          WHERE NOT u.consumed AND u.eligible AND NOT (u.unit_no = ANY(v_app_units))
            AND EXISTS (
              WITH RECURSIVE anc AS (
                SELECT c.id, c.parent_id FROM categories c WHERE c.id = u.category_id
                UNION ALL SELECT c.id, c.parent_id FROM categories c JOIN anc ON c.id = anc.parent_id)
              SELECT 1 FROM promotion_targets t WHERE t.slot_id = v_slot.id
                AND (t.product_id = u.product_id OR t.category_id IN (SELECT id FROM anc)))
          ORDER BY u.price DESC, u.unit_no LIMIT v_slot.quantity
        ) pick;
        IF v_best_units IS NULL OR array_length(v_best_units, 1) < v_slot.quantity THEN v_app_units := NULL; EXIT; END IF;
        v_app_units := v_app_units || v_best_units;
      END LOOP;
      CONTINUE WHEN v_app_units IS NULL OR array_length(v_app_units, 1) IS NULL;

      SELECT SUM(price), SUM(line_discount) INTO v_sum, v_alloc FROM _sale_units WHERE unit_no = ANY(v_app_units);
      v_gross := CASE v_combo.discount_type
        WHEN 'bundle_price'  THEN GREATEST(0, ROUND(v_sum - v_combo.discount_value, 2))
        WHEN 'percent'       THEN (SELECT SUM(ROUND(price * v_combo.discount_value / 100.0, 2)) FROM _sale_units WHERE unit_no = ANY(v_app_units))
        WHEN 'fixed'         THEN LEAST(v_combo.discount_value, v_sum)
        WHEN 'cheapest_free' THEN (SELECT COALESCE(SUM(price),0) FROM (SELECT price FROM _sale_units WHERE unit_no = ANY(v_app_units) ORDER BY price ASC, unit_no LIMIT v_combo.discount_value::int) c)
        ELSE 0 END;
      v_net := v_gross - v_alloc;
      IF v_gross > 0 AND v_net > v_best_net THEN
        v_best_net := v_net; v_best_combo_id := v_combo.id; v_best_gross := v_gross;
        v_best_type := v_combo.discount_type; v_best_value := v_combo.discount_value;
        SELECT array_agg(unit_no ORDER BY unit_no) INTO v_best_units FROM _sale_units WHERE unit_no = ANY(v_app_units);
      END IF;
    END LOOP;
    EXIT WHEN v_best_combo_id IS NULL;

    -- allocate v_best_gross over v_best_units (spec A.4 allocation rules)
    IF v_best_type = 'cheapest_free' THEN
      UPDATE _sale_units SET combo_discount = 0 WHERE unit_no = ANY(v_best_units);
      UPDATE _sale_units SET combo_discount = price WHERE unit_no IN (
        SELECT unit_no FROM _sale_units WHERE unit_no = ANY(v_best_units) ORDER BY price ASC, unit_no LIMIT v_best_value::int);
    ELSIF v_best_type = 'percent' THEN
      UPDATE _sale_units SET combo_discount = ROUND(price * v_best_value / 100.0, 2) WHERE unit_no = ANY(v_best_units);
    ELSE  -- bundle_price / fixed: proportional, remainder on the last unit
      SELECT SUM(price) INTO v_sum FROM _sale_units WHERE unit_no = ANY(v_best_units);
      v_running := 0; v_n := array_length(v_best_units, 1);
      FOR v_idx IN 1..v_n LOOP
        IF v_idx = v_n THEN v_alloc := ROUND(v_best_gross - v_running, 2);
        ELSE SELECT ROUND(v_best_gross * price / v_sum, 2) INTO v_alloc FROM _sale_units WHERE unit_no = v_best_units[v_idx]; END IF;
        UPDATE _sale_units SET combo_discount = v_alloc WHERE unit_no = v_best_units[v_idx];
        v_running := v_running + v_alloc;
      END LOOP;
    END IF;
    UPDATE _sale_units SET consumed = true, combo_promo_id = v_best_combo_id,
      combo_rate = CASE WHEN v_best_type = 'percent' THEN v_best_value ELSE NULL END
    WHERE unit_no = ANY(v_best_units);
  END LOOP;

  -- Re-materialise v_derived_items (loop form; v_before := copy taken BEFORE the combo pass).
  -- Every group (item_idx, consumed, combo_promo_id, combo_discount) becomes one row; unconsumed
  -- units copy the original element with only 'quantity' replaced.
  IF EXISTS (SELECT 1 FROM _sale_units WHERE consumed) THEN
    v_before := v_derived_items; v_derived_items := '[]'::jsonb; v_subtotal := 0;
    FOR v_grp IN
      SELECT u.item_idx, u.consumed, u.combo_promo_id, u.combo_rate, u.combo_discount, COUNT(*)::int AS qty,
             (SELECT elem FROM jsonb_array_elements(v_before) WITH ORDINALITY d(elem, i) WHERE d.i - 1 = u.item_idx) AS orig
      FROM _sale_units u
      GROUP BY u.item_idx, u.consumed, u.combo_promo_id, u.combo_rate, u.combo_discount
      ORDER BY u.item_idx, u.consumed, u.combo_discount
    LOOP
      IF v_grp.consumed THEN
        -- unit_price = catalog price (orig unit_price + orig discount) - combo discount, modifier delta stays separate
        v_line_price := ROUND((v_grp.orig->>'unit_price')::numeric + (v_grp.orig->>'discount_amount')::numeric - v_grp.combo_discount, 2);
        IF v_line_price < COALESCE((v_grp.orig->>'cost_price_snapshot')::numeric, 0) AND NOT p_manager_override THEN
          RETURN jsonb_build_object('ok', false, 'code', 'BELOW_COST_REQUIRES_OVERRIDE', 'message', 'This combination of discounts would sell below cost');
        END IF;
        v_derived_items := v_derived_items || (v_grp.orig || jsonb_build_object(
          'quantity', v_grp.qty, 'unit_price', v_line_price,
          'promotion_id', v_grp.combo_promo_id, 'discount_rate', v_grp.combo_rate, 'discount_amount', v_grp.combo_discount));
      ELSE
        v_derived_items := v_derived_items || (v_grp.orig || jsonb_build_object('quantity', v_grp.qty));
      END IF;
    END LOOP;
    -- weight lines never entered _sale_units: append them unchanged
    FOR v_elem IN SELECT elem FROM jsonb_array_elements(v_before) WITH ORDINALITY d(elem, i)
                  WHERE NOT EXISTS (SELECT 1 FROM _sale_units u WHERE u.item_idx = d.i - 1) LOOP
      v_derived_items := v_derived_items || v_elem;
    END LOOP;
    SELECT ROUND(SUM(((e->>'unit_price')::numeric + (e->>'modifier_price_delta')::numeric) * (e->>'quantity')::int), 2)
      INTO v_subtotal FROM jsonb_array_elements(v_derived_items) e;
    -- one audit row per combo application
    FOR v_grp IN SELECT combo_promo_id, SUM(combo_discount) AS total FROM _sale_units WHERE consumed GROUP BY combo_promo_id LOOP
      PERFORM record_audit('promotion.apply', 'order_item', v_grp.combo_promo_id, NULL,
        jsonb_build_object('kind', 'combo', 'discountAmount', v_grp.total), 'rpc');
    END LOOP;
  END IF;
```
  Extra DECLAREs for this block: `v_before jsonb; v_grp record;`. Note the `_sale_units` price column = orig `unit_price` + orig `discount_amount` + `modifier_price_delta` (catalog price incl. modifiers), so `cheapest_free`'s "free" unit ends with `unit_price = 0` only when it has no modifier delta — that matches the client (`unitPrice` includes the delta; the discount equals the full unit price). The `promotion.apply` audit inside the item loop still fires for per-line discounts; that is acceptable even for units later consumed by a combo (audit is informational).
- [ ] **Step 3:** `npx supabase migration up`; run the integration test file → PASS (all pre-existing cases too). Run `npx vitest run src/entities/tab --project integration` for regression on other RPC users if such tests exist.
- [ ] **Step 4:** Client parity check: add to `combo-pricing.test.ts` one table-driven case per integration scenario above with the same numbers and assert `netSavings` equals the server's total discount (documented in the test as the cross-check).
- [ ] **Step 5: Commit** `feat(promotions): combo pricing in process_direct_sale_atomic`

---

### Task 5: Cart store + CheckoutPanel + PaymentForm integration

**Files:**
- Modify: `src/entities/tab/model/cartStore.ts` (state `comboResult: ComboEvaluation | null` default `null`, action `setComboResult(r)`, selector `comboNetSavings(): number`; excluded from `partialize`; `clearCart`/`resumeHeld`/`holdCart` reset it to `null`)
- Modify: `src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx` (`useEffect` computing `evaluateCombos(lines, promotions, new Date(), timezone, categoriesById)` where `lines` map cart items: `unitPrice = product.basePrice + Σ modifier deltas`, `lineDiscountPerUnit = max(0, product.basePrice − item.unitPrice)`; deps `[items, promotions, categories, minuteTick]` with a 60 s `setInterval` tick; render a `section data-testid="combo-applications"` listing `applications` (`name` + `−{formatMoney(net)}`) between the lines and totals, a `dt/dd` "Combo savings" row `data-testid="combo-savings"` when `netSavings > 0`, and `Total = total − netSavings` `data-testid="cart-total"`)
- Modify: `src/entities/tab/ui/CartItem.tsx` (optional prop `comboLabel: string | undefined` → renders the same badge style as the promotion badge with `data-testid="cart-item-combo-badge"`; CheckoutPanel passes it for lines with any allocated unit)
- Modify: `src/widgets/PaymentModal/ui/PaymentForm.tsx` (~:386 subtotal source: subtract `useCartStore(s => s.comboNetSavings())`; the "Apply Promotion" `<Select>` (~:828) filters `kind === 'discount'`)
- i18n: `wPanels.json` → `checkoutPanel.comboSectionTitle`, `checkoutPanel.comboSavings`; `entities.json` → `cartItem.comboApplied`.
- Test: `src/entities/tab/model/cartStore.test.ts` (combo selectors + reset on clear), `src/widgets/CheckoutPanel/ui/CheckoutPanel.test.tsx` (mock `usePromotions` with a 3x2 combo + 3 eligible lines → `combo-applications` shows the name, `combo-savings` shows `−$10.00`, total reflects it), `PaymentForm.test.tsx` if it exists (subtotal minus combo savings; combo excluded from select).

- [ ] **Step 1:** Failing tests → **Step 2:** implement → PASS → lint/typecheck. Verify `useCheckoutSale.test.ts` still passes (wire format unchanged).
- [ ] **Step 3: Commit** `feat(checkout): live combo evaluation in cart and payment totals`

---

### Task 6: Product & category "Combo eligible" toggles

**Files:**
- Modify: `src/features/manage-products/ui/tabs/ProductDetailsTab.tsx:197-207` (second `Checkbox id="product-combo-eligible"` under Active), `src/features/manage-products/ui/ProductDetailDialog.tsx` (state `comboEligible` initialised from `initialProduct?.comboEligible ?? true`, included in create/update payload), `src/entities/product/model/queries.ts:391-421` `productUpdateToRow` + create `insertRow` (~:441) map `combo_eligible`
- Modify: `src/features/manage-categories/ui/CategoryTreeEditor.tsx` (form state `comboEligible`, `Checkbox id="category-combo-eligible"`, passed to create/update; a small muted "No combos" tag on rows where `comboEligible === false`)
- i18n: `featMgmt.json` → `productForm.comboEligible`, `productForm.comboEligibleHelp`, `categoryTree.comboEligible`, `categoryTree.noCombosTag` (check the actual namespace/prefix these components use).
- Test: extend `ProductDetailDialog` tests (if present, else `ProductDetailsTab.test.tsx`): unchecking Combo eligible sends `comboEligible: false`; `queries.test.ts` for product: `productUpdateToRow({ comboEligible:false })` → `{ combo_eligible:false }`; `CategoryTreeEditor.test.tsx`: toggle persists via update mutation.

- [ ] Steps: failing tests → implement → PASS → commit `feat(catalog): combo-eligible flag on products and categories`

---

### Task 7: Combo builder in `PromotionDialog` + list page

**Files:**
- Modify: `src/features/manage-promotions/model/usePromotionWizardState.ts` (state: `kind: PromotionKind` (create default `'discount'`, prefilled on edit, immutable on edit), `slots: SlotDraft[]` where `SlotDraft = { key: string; quantity: number; label: string; productIds: string[]; categoryIds: string[] }` (start with one empty slot when switching to combo), `comboPricing: { type: DiscountType; value: string }` (default `bundle_price`); actions `setKind`, `addSlot`, `removeSlot(key)`, `updateSlot(key, patch)`, `setComboPricing`; `isCompositionValid` = ≥1 slot, each qty 1..20 and ≥1 target; `validateComboPricing` = value > 0; percent ≤ 100; `cheapest_free` integer and `< Σ quantity`; `bundle_price` any positive; `save()` maps `kind`, `discountType/Value` from `comboPricing` when combo, `slots` → `PromotionComboSlotInput[]` (`targets` = productIds→`{productId}` + categoryIds→`{categoryId}`), `targets: []`)
- Create: `src/features/manage-promotions/ui/wizard/ComboSlotsEditor.tsx` (props: `slots`, `eligibleProducts`, `eligibleCategories`, `onAdd`, `onRemove`, `onUpdate`, i18n strings; each slot row: index label, qty `Input type=number min=1 max=20` `data-testid="combo-slot-qty-{i}"`, optional label `Input`, `MultiSelectPicker` (same props as `StepScope`), remove button; "Add slot" button `data-testid="combo-add-slot"`)
- Create: `src/features/manage-promotions/ui/wizard/ComboPricingSection.tsx` (4-option radio group / `Select` `data-testid="combo-pricing-type"` + value input `data-testid="combo-pricing-value"`; `MoneyInput` for `bundle_price`/`fixed`, number input for `percent`/`cheapest_free`; helper text per mode)
- Modify: `src/features/manage-promotions/ui/PromotionDialog.tsx` (kind segmented control `data-testid="promotion-kind-discount|combo"` in section 01, disabled on edit; when combo: replace section 02 `StepScope` with `ComboSlotsEditor`, insert section 03 `ComboPricingSection`, renumber "When" to 04; `handleSubmit` validates composition + pricing and scrolls to the first invalid section like today)
- Modify: `src/features/manage-promotions/ui/wizard/StepReview.tsx` (combo branch: list slots as "N × {targets summary}", pricing sentence, worked example: pick the first eligible product per slot from the catalog and run `evaluateCombos` to show "Example: $X → $Y")
- Modify: `src/pages/promotions/index.tsx` (scope cell: `Combo · {{count}} slots` when combo; discount cell: mode label for combo types; kind filter chip "All / Discounts / Combos" alongside status chips; row `data-testid` stays)
- Eligible catalog: in `PromotionDialogForm`, `eligibleCategories = categories.filter(isCategoryChainEligible)` and `eligibleProducts = products.filter(p => isProductComboEligible(p, categoriesById))` (add `isCategoryChainEligible` to `combo-pricing.ts` if not already exported).
- i18n `wAdmin.json` (+ es-MX): `promotionDialog.kind.{label,discount,combo}`, `promotionDialog.composition.{title,hint,slot,quantity,label,addSlot,removeSlot,noEligible}`, `promotionDialog.pricing.{title,hint,bundle_price,percent,fixed,cheapest_free,valueLabel.*,help.*}`, `promotionWizard.review.combo.*`, `promotionsListPanel.{scopeCombo,kindFilter.*,comboPricing.*}`, validation error keys.
- Test: `usePromotionWizardState.test.ts` (kind switch seeds one slot; composition/pricing validation matrix incl. `cheapest_free` ≥ Σ qty invalid; `save()` payload shape for a 3x2), `PromotionDialog.test.tsx` (switching kind shows composition section; edit mode disables kind), `src/pages/promotions/*.test.tsx` if present (scope cell text).

- [ ] Steps: failing tests → implement → PASS → `npm run lint` (watch `no-literal-string`) → commit `feat(promotions): combo builder in the promotion dialog and list`

---

### Task 8: E2E

**Files:**
- Create: `e2e/promotions/combo-wizard.spec.ts`, `e2e/checkout/combo-checkout.spec.ts`, `e2e/products/combo-eligibility.spec.ts`
- Modify: `e2e/helpers/supabase.ts` → `seedComboPromotion({ name, type, value, slots: [{ quantity, categoryNames?, productNames? }] })` (service role: insert promotion `kind:'combo'` named `E2E …` so `resetTestState`'s `'E2E %'` sweep removes it, then slots + targets) and `setProductComboEligible(name, flag)` / `setCategoryComboEligible(name, flag)` (reset both to `true` in `resetTestState`).

- [ ] **combo-wizard.spec.ts** (admin): `/promotions?new=1` → click `promotion-kind-combo` → name `E2E 3x2 Snacks` → slot 0 qty 3, pick category "Snacks" in the picker (same interaction as `promotion-dialog-validation.spec.ts`) → pricing `cheapest_free` value 1 → date preset → save → list row shows "Combo · 1 slot"; DB has `kind='combo'`, one slot qty 3, one target with `slot_id`. Second test: `cheapest_free` value 3 on Σ qty 3 shows the validation error and does not save. Third: reopen via `?edit=<id>` shows kind control disabled and composition prefilled.
- [ ] **combo-checkout.spec.ts** (manager, `openCaja`): seed `E2E 3x2` combo on category Snacks; on `/pos` add three different Snacks products (use the seeded names from `scripts/seed-dev-data.ts`, priced differently — if equal, `setProductPrice` helper or pick three with distinct `base_price`); expect `combo-applications` to contain the combo name, `combo-savings` = cheapest price, `cart-total` = Σ − cheapest; pay cash → success; DB: latest order has a row with `unit_price 0` and `promotion_id` = combo id; receipt preview shows the discount line.
- [ ] **combo-eligibility.spec.ts** (admin): toggle a Snacks product's Combo-eligible off in `/inventory` → Catalog → edit dialog; DB `combo_eligible=false`; open `/promotions?new=1` combo mode → picker search for that product yields nothing; toggle back on → it appears. Category variant: uncheck on the category in the tree editor → the category disappears from the picker.
- [ ] Run: `npx playwright test e2e/promotions e2e/checkout/combo-checkout.spec.ts e2e/products/combo-eligibility.spec.ts e2e/payments/apply-promotion-and-custom-discount.spec.ts` → all pass. Two fix attempts max per failure, then STOP and report.
- [ ] Commit `test(promotions): combo wizard, checkout, and eligibility E2E`

---

### Task 9: Integration gate + release prep

- [ ] `npm run typecheck && npm run lint && npm run test && npm run test:integration` all green.
- [ ] Full `npm run test:e2e` once (≈20 min). Triage failures: only fix those attributable to this branch; pre-existing flakes noted in the report. Do not loop.
- [ ] Bump versions: `src-tauri/tauri.conf.json` `"version": "1.5.0"`, `src-tauri/Cargo.toml` `version = "1.5.0"` (run `cargo update -p bar-pos --manifest-path src-tauri/Cargo.toml` or edit `Cargo.lock`'s own package entry so the lock matches), `package.json` `"version": "1.5.0"` + `package-lock.json` root entries.
- [ ] Update `CLAUDE.md` briefly: Implemented Features bullet for combos (under Promotions) and caja-per-terminal note in the Caja bullet; RBAC unchanged; DB tables row `promotion_combo_slots`.
- [ ] Commit `chore(release): bump version to 1.5.0`.
