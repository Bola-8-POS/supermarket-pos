/* eslint-disable */
// vi.unmock MUST be the very first statement — overrides the global Supabase mock in test-setup.ts
vi.unmock('@shared/lib/supabase');

/**
 * Integration test: process_direct_sale_atomic's promotion/floor-guard
 * extension (Phase 27, Plan 01, Task 3).
 *
 * Calls the RPC directly via the service-role client (bypassing the edge
 * function) — process_direct_sale_atomic trusts p_staff_id directly rather
 * than auth.uid() (same as process_payment_atomic, mirrored from
 * bank-transfer-rpc.integration.test.ts), so a service-role client with an
 * explicit p_staff_id is sufficient; no JWT sign-in is needed for these
 * three scenarios.
 *
 * Proves the TS/plpgsql parity backstop truth: evaluateBestPromotion()'s
 * computed discount for a fixture input matches what the live RPC actually
 * wrote to order_items for the identical fixture.
 *
 * Run: npx vitest run src/entities/promotion/model/promotion-rpc.integration.test.ts
 */
import { describe, expect, it, vi } from 'vitest';
import type { Promotion } from '@shared/lib/domain';
import { testDb } from '@shared/lib/supabase-test-client';
import { evaluateBestPromotion } from './promotion-pricing';

const hasEnv =
  typeof process.env['VITE_SUPABASE_URL'] === 'string' &&
  process.env['VITE_SUPABASE_URL'] !== '' &&
  typeof process.env['SUPABASE_SERVICE_ROLE_KEY'] === 'string' &&
  process.env['SUPABASE_SERVICE_ROLE_KEY'] !== '';

const itPlain = hasEnv ? it : it.skip;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function getBillingSettings(): Promise<{ taxRatePercent: number; taxInclusive: boolean }> {
  const { data } = await testDb.from('settings').select('value').eq('key', 'billing').maybeSingle();
  const value = (data?.value ?? {}) as { taxRatePercent?: number; taxInclusive?: boolean };
  return {
    taxRatePercent: value.taxRatePercent ?? 16,
    taxInclusive: value.taxInclusive ?? true,
  };
}

function deriveTotal(subtotal: number, taxRatePercent: number, taxInclusive: boolean): number {
  if (taxInclusive) return round2(subtotal);
  return round2(subtotal + round2(subtotal * (taxRatePercent / 100)));
}

async function getStaffAndShift(
  roles: ('cashier' | 'manager' | 'admin')[]
): Promise<{ staffId: string; shiftId: string; staffPin: string }> {
  const { data: staff } = await testDb
    .from('profiles')
    .select('id, pin')
    .in('role', roles)
    .limit(1)
    .single();
  if (!staff) throw new Error(`getStaffAndShift: no profile found for roles ${roles.join(',')}`);
  const staffId = staff.id as string;
  const staffPin = staff.pin as string;

  const { data: existing } = await testDb
    .from('shifts')
    .select('id')
    .eq('staff_id', staffId)
    .is('clock_out', null)
    .limit(1)
    .maybeSingle();
  if (existing) return { staffId, shiftId: existing.id as string, staffPin };

  const { data: newShift, error } = await testDb
    .from('shifts')
    .insert({ staff_id: staffId, opening_cash: 0 })
    .select('id')
    .single();
  if (error || !newShift)
    throw new Error(`getStaffAndShift: shift create failed: ${error?.message ?? 'no row'}`);
  return { staffId, shiftId: newShift.id as string, staffPin };
}

async function getOrCreateOpenCaja(staffId: string): Promise<{ cajaId: string; created: boolean }> {
  const { data: existing } = await testDb
    .from('caja_sessions')
    .select('id')
    .eq('status', 'open')
    .maybeSingle();
  if (existing) return { cajaId: existing.id as string, created: false };

  const { data, error } = await testDb
    .from('caja_sessions')
    .insert({ opened_by: staffId, opening_cash: 0 })
    .select('id')
    .single();
  if (error || !data)
    throw new Error(`getOrCreateOpenCaja: create failed: ${error?.message ?? 'no row'}`);
  return { cajaId: data.id as string, created: true };
}

interface ProductFixture {
  categoryId: string;
  productId: string;
  basePrice: number;
  costPrice: number;
}

/** Seeds an isolated category + product + inventory row. */
async function seedProduct(basePrice: number, costPrice: number): Promise<ProductFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { data: category, error: catErr } = await testDb
    .from('categories')
    .insert({ name: `Promo Test Category ${suffix}` })
    .select('id')
    .single();
  if (catErr || !category)
    throw new Error(`seedProduct: category insert failed: ${catErr?.message ?? 'no row'}`);

  const { data: product, error: prodErr } = await testDb
    .from('products')
    .insert({
      name: `Promo Test Product ${suffix}`,
      category_id: category.id,
      base_price: basePrice,
      is_active: true,
    })
    .select('id')
    .single();
  if (prodErr || !product)
    throw new Error(`seedProduct: product insert failed: ${prodErr?.message ?? 'no row'}`);

  const { error: invErr } = await testDb
    .from('inventory')
    .insert({ product_id: product.id, quantity_on_hand: 100, cost_price: costPrice });
  if (invErr) throw new Error(`seedProduct: inventory insert failed: ${invErr.message}`);

  return {
    categoryId: category.id as string,
    productId: product.id as string,
    basePrice,
    costPrice,
  };
}

async function seedPromotion(
  productId: string,
  discountType: 'percent' | 'fixed',
  discountValue: number
): Promise<Promotion> {
  const now = new Date();
  const startsAt = new Date(now.getTime() - 60_000);
  const endsAt = new Date(now.getTime() + 60 * 60_000);
  const { data, error } = await testDb
    .from('promotions')
    .insert({
      name: `Promo Test ${Date.now()}`,
      discount_type: discountType,
      discount_value: discountValue,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
    })
    .select('*')
    .single();
  if (error || !data)
    throw new Error(`seedPromotion: insert failed: ${error?.message ?? 'no row'}`);
  const { data: targetRow, error: targetError } = await testDb
    .from('promotion_targets')
    .insert({ promotion_id: data.id as string, product_id: productId })
    .select('*')
    .single();
  if (targetError || !targetRow) {
    throw new Error(`seedPromotion: target insert failed: ${targetError?.message ?? 'no row'}`);
  }
  return {
    id: data.id as string,
    name: data.name as string,
    targets: [
      {
        id: targetRow.id as string,
        promotionId: data.id as string,
        productId: targetRow.product_id as string | null,
        categoryId: targetRow.category_id as string | null,
      },
    ],
    kind: (data as { kind?: string }).kind === 'combo' ? 'combo' : 'discount',
    discountType: data.discount_type as 'percent' | 'fixed',
    discountValue: data.discount_value as number,
    startsAt: new Date(data.starts_at as string),
    endsAt: new Date(data.ends_at as string),
    daysOfWeek: data.days_of_week as number[] | null,
    startTime: data.start_time as string | null,
    endTime: data.end_time as string | null,
    needsReview: data.needs_review as boolean,
    active: data.active as boolean,
    createdAt: new Date(data.created_at as string),
    createdBy: data.created_by as string | null,
    slots: [],
  };
}

/** Deletes everything the RPC creates for one sale, plus the fixture rows. */
async function cleanupSale(
  tabId: string | undefined,
  fixture: ProductFixture,
  promotionId?: string
): Promise<void> {
  if (tabId) {
    await testDb.from('payments').delete().eq('tab_id', tabId);
    const { data: orders } = await testDb.from('orders').select('id').eq('tab_id', tabId);
    const orderIds = (orders ?? []).map(o => o.id as string);
    if (orderIds.length > 0) {
      await testDb.from('order_items').delete().in('order_id', orderIds);
      await testDb.from('orders').delete().in('id', orderIds);
    }
    await testDb.from('tabs').delete().eq('id', tabId);
  }
  if (promotionId) await testDb.from('promotions').delete().eq('id', promotionId);
  await testDb.from('inventory').delete().eq('product_id', fixture.productId);
  await testDb.from('products').delete().eq('id', fixture.productId);
  await testDb.from('categories').delete().eq('id', fixture.categoryId);
}

describe('process_direct_sale_atomic — promotions + floor guard (integration)', () => {
  itPlain(
    'normal case: a matching product-scoped promotion recomputes the discount server-side, snapshots it on order_items, and matches evaluateBestPromotion() (parity backstop)',
    async () => {
      const basePrice = 100;
      const costPrice = 50; // discounted price (80) stays above cost — no floor guard trip
      const fixture = await seedProduct(basePrice, costPrice);
      const promotion = await seedPromotion(fixture.productId, 'percent', 20);
      const { staffId, shiftId } = await getStaffAndShift(['cashier', 'manager', 'admin']);
      const { cajaId } = await getOrCreateOpenCaja(staffId);
      const { taxRatePercent, taxInclusive } = await getBillingSettings();

      const expected = evaluateBestPromotion(
        { productId: fixture.productId, categoryId: fixture.categoryId, basePrice },
        [promotion],
        new Date(),
        15,
        null,
        14,
        'America/Mexico_City'
      );
      expect(expected).not.toBeNull();

      const subtotal = expected!.discountedUnitPrice;
      const amount = deriveTotal(subtotal, taxRatePercent, taxInclusive);
      const idKey = `promo-normal-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      let tabId: string | undefined;
      try {
        const { data, error } = await testDb.rpc('process_direct_sale_atomic', {
          p_staff_id: staffId,
          p_shift_id: shiftId,
          p_caja_session_id: cajaId,
          p_items: [
            {
              product_id: fixture.productId,
              quantity: 1,
              unit_price: basePrice,
              modifier_ids: [],
              modifier_price_delta: 0,
              notes: '',
            },
          ],
          p_idempotency_key: idKey,
          p_method: 'cash',
          p_amount: amount,
          p_tendered_amount: amount,
          p_manager_override: false,
        } as never);

        expect(error).toBeNull();
        expect((data as { ok?: boolean } | null)?.ok).toBe(true);
        tabId = (data as { tabId?: string }).tabId;
        expect(tabId).toBeTruthy();

        const { data: orders } = await testDb
          .from('orders')
          .select('id')
          .eq('tab_id', tabId as string);
        const orderIds = (orders ?? []).map(o => o.id as string);
        const { data: orderItems } = await testDb
          .from('order_items')
          .select('unit_price, promotion_id, discount_rate, discount_amount')
          .in('order_id', orderIds);
        expect(orderItems).toHaveLength(1);
        const row = orderItems![0] as {
          unit_price: number;
          promotion_id: string | null;
          discount_rate: number | null;
          discount_amount: number | null;
        };
        expect(Number(row.unit_price)).toBe(expected!.discountedUnitPrice);
        expect(row.promotion_id).toBe(expected!.promotionId);
        expect(Number(row.discount_rate)).toBe(expected!.discountRate);
        expect(Number(row.discount_amount)).toBe(expected!.discountAmount);
      } finally {
        await cleanupSale(tabId, fixture, promotion.id);
      }
    }
  );

  itPlain(
    'below-cost case: p_manager_override=false is blocked with BELOW_COST_REQUIRES_OVERRIDE',
    async () => {
      const basePrice = 100;
      const costPrice = 90; // discounted price (70) falls below cost (90)
      const fixture = await seedProduct(basePrice, costPrice);
      const promotion = await seedPromotion(fixture.productId, 'fixed', 30);
      const { staffId, shiftId } = await getStaffAndShift(['cashier', 'manager', 'admin']);
      const { cajaId } = await getOrCreateOpenCaja(staffId);
      const idKey = `promo-belowcost-block-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      try {
        const { data, error } = await testDb.rpc('process_direct_sale_atomic', {
          p_staff_id: staffId,
          p_shift_id: shiftId,
          p_caja_session_id: cajaId,
          p_items: [
            {
              product_id: fixture.productId,
              quantity: 1,
              unit_price: basePrice,
              modifier_ids: [],
              modifier_price_delta: 0,
              notes: '',
            },
          ],
          p_idempotency_key: idKey,
          p_method: 'cash',
          p_amount: 70,
          p_tendered_amount: 70,
          p_manager_override: false,
        } as never);

        expect(error).toBeNull();
        const result = data as { ok?: boolean; code?: string };
        expect(result.ok).toBe(false);
        expect(result.code).toBe('BELOW_COST_REQUIRES_OVERRIDE');

        // The floor guard RETURNs from inside the per-item loop, before the
        // tabs/orders/order_items INSERT block runs — no order_item should
        // ever reference this freshly-created, uniquely-named product.
        const { data: leaked } = await testDb
          .from('order_items')
          .select('id')
          .eq('product_id', fixture.productId);
        expect(leaked ?? []).toHaveLength(0);
      } finally {
        await cleanupSale(undefined, fixture, promotion.id);
      }
    }
  );

  itPlain(
    'below-cost case: p_manager_override=true with a manager-role staff member succeeds',
    async () => {
      const basePrice = 100;
      const costPrice = 90;
      const fixture = await seedProduct(basePrice, costPrice);
      const promotion = await seedPromotion(fixture.productId, 'fixed', 30);
      const { staffId, shiftId, staffPin } = await getStaffAndShift(['manager', 'admin']);
      const { cajaId } = await getOrCreateOpenCaja(staffId);
      const { taxRatePercent, taxInclusive } = await getBillingSettings();
      const amount = deriveTotal(70, taxRatePercent, taxInclusive);
      const idKey = `promo-belowcost-override-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      let tabId: string | undefined;
      try {
        const { data, error } = await testDb.rpc('process_direct_sale_atomic', {
          p_staff_id: staffId,
          p_shift_id: shiftId,
          p_caja_session_id: cajaId,
          p_items: [
            {
              product_id: fixture.productId,
              quantity: 1,
              unit_price: basePrice,
              modifier_ids: [],
              modifier_price_delta: 0,
              notes: '',
            },
          ],
          p_idempotency_key: idKey,
          p_method: 'cash',
          p_amount: amount,
          p_tendered_amount: amount,
          p_manager_override: true,
          p_manager_pin: staffPin,
        } as never);

        expect(error).toBeNull();
        const result = data as { ok?: boolean; tabId?: string };
        expect(result.ok).toBe(true);
        tabId = result.tabId;
        expect(tabId).toBeTruthy();
      } finally {
        await cleanupSale(tabId, fixture, promotion.id);
      }
    }
  );
});
