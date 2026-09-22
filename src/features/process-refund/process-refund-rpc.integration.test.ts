/* eslint-disable */
/**
 * Integration tests: process_refund RPC (Phase 6, Plan 10)
 *
 * Requires: VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY env vars
 * Auth tests also require: VITE_SUPABASE_ANON_KEY + E2E_MANAGER_NAME + E2E_MANAGER_PIN
 * Run: cd bar-pos && npx vitest run src/features/process-refund/process-refund-rpc.integration.test.ts
 *
 * process_refund uses auth.uid() in SECURITY DEFINER context, so calls must be made
 * with an authenticated user JWT (manager or admin role).
 * Service role client is used only for data seeding (bypasses RLS).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// ── Env guards ────────────────────────────────────────────────────────────────

const hasEnv =
  typeof process.env['VITE_SUPABASE_URL'] === 'string' &&
  process.env['VITE_SUPABASE_URL'] !== '' &&
  typeof process.env['SUPABASE_SERVICE_ROLE_KEY'] === 'string' &&
  process.env['SUPABASE_SERVICE_ROLE_KEY'] !== '';

/** process_refund calls auth.uid() → needs signed-in manager JWT + anon key */
const hasAuthEnv =
  hasEnv &&
  typeof process.env['VITE_SUPABASE_ANON_KEY'] === 'string' &&
  process.env['VITE_SUPABASE_ANON_KEY'] !== '' &&
  typeof process.env['E2E_MANAGER_NAME'] === 'string' &&
  process.env['E2E_MANAGER_NAME'] !== '' &&
  typeof process.env['E2E_MANAGER_PIN'] === 'string' &&
  process.env['E2E_MANAGER_PIN'] !== '';

const hasBartenderEnv =
  hasAuthEnv &&
  typeof process.env['E2E_BARTENDER_NAME'] === 'string' &&
  process.env['E2E_BARTENDER_NAME'] !== '' &&
  typeof process.env['E2E_BARTENDER_PIN'] === 'string' &&
  process.env['E2E_BARTENDER_PIN'] !== '';

/** Live-DB test that calls process_refund as manager (needs auth env) */
const itAuth = hasAuthEnv ? it : it.skip;
/** Live-DB test that calls process_refund as bartender (needs bartender env) */
const itBartender = hasBartenderEnv ? it : it.skip;

// ── Client factories ──────────────────────────────────────────────────────────

function getServiceDb(): any {
  const url = process.env['VITE_SUPABASE_URL']!;
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY']!;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Returns a Supabase client authenticated as the named staff member.
 * Looks up the profile email via service role, then signs in with anon key + PIN.
 * process_refund reads auth.uid() — this JWT must identify a manager/admin profile.
 */
async function getAuthClient(name: string, pin: string): Promise<SupabaseClient> {
  const url = process.env['VITE_SUPABASE_URL']!;
  const anonKey = process.env['VITE_SUPABASE_ANON_KEY']!;

  const svc = getServiceDb();
  const { data: profile, error: profileErr } = await svc
    .from('profiles')
    .select('email')
    .eq('name', name)
    .single();
  if (profileErr || !profile?.email) {
    throw new Error(
      `getAuthClient: profile "${name}" not found or missing email: ${profileErr?.message ?? 'no email'}`,
    );
  }

  const anonClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authErr } = await anonClient.auth.signInWithPassword({
    email: profile.email as string,
    password: pin, // PIN is used as password for E2E accounts
  });
  if (authErr || !authData.session) {
    throw new Error(`getAuthClient: sign-in failed for "${name}": ${authErr?.message ?? 'no session'}`);
  }

  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${authData.session.access_token}` } },
  });
}

// ── Seed helpers ──────────────────────────────────────────────────────────────

async function getStaffAndShift(svc: any): Promise<{ staffId: string; shiftId: string }> {
  const { data: staff } = await svc
    .from('profiles')
    .select('id')
    .in('role', ['manager', 'admin'])
    .limit(1)
    .single();
  if (!staff) throw new Error('getStaffAndShift: no manager/admin profile found');
  const staffId = staff.id as string;

  const { data: existing } = await svc
    .from('shifts')
    .select('id')
    .eq('staff_id', staffId)
    .is('clock_out', null)
    .limit(1)
    .maybeSingle();

  if (existing) return { staffId, shiftId: existing.id as string };

  const { data: newShift, error: shiftErr } = await svc
    .from('shifts')
    .insert({ staff_id: staffId, opening_cash: 0 })
    .select('id')
    .single();
  if (shiftErr || !newShift) throw new Error(`getStaffAndShift: shift create failed: ${shiftErr?.message ?? 'no row'}`);
  return { staffId, shiftId: newShift.id as string };
}

interface PaidTabSeed {
  tabId: string;
  paymentId: string;
  itemIds: string[];
  staffId: string;
}

/**
 * Seeds a closed (paid) tab with 5 order_items at $10 each = $50 total,
 * plus a corresponding payment row ($50, cash).
 */
async function seedPaidTabWithPayment(svc: any): Promise<PaidTabSeed> {
  const { staffId, shiftId } = await getStaffAndShift(svc);

  const { data: product } = await svc
    .from('products')
    .select('id, base_price')
    .eq('is_active', true)
    .limit(1)
    .single();
  if (!product) throw new Error('seedPaidTabWithPayment: no active product found');

  const { data: tab, error: tabErr } = await svc
    .from('tabs')
    .insert({
      customer_name: `Refund Integration Tab ${Date.now()}`,
      staff_id: staffId,
      shift_id: shiftId,
      status: 'paid',
      closed_at: new Date().toISOString(), // CHECK: paid requires closed_at IS NOT NULL
    })
    .select('id')
    .single();
  if (tabErr || !tab) throw new Error(`seedPaidTabWithPayment: tab insert failed: ${tabErr?.message ?? 'no row'}`);

  const { data: order, error: orderErr } = await svc
    .from('orders')
    .insert({ tab_id: tab.id, staff_id: staffId, status: 'served' })
    .select('id')
    .single();
  if (orderErr || !order) throw new Error(`seedPaidTabWithPayment: order insert failed: ${orderErr?.message ?? 'no row'}`);

  const { data: items, error: itemErr } = await svc
    .from('order_items')
    .insert(
      Array.from({ length: 5 }, () => ({
        order_id: order.id,
        product_id: product.id,
        quantity: 1,
        unit_price: 10.0, // 5 × $10 = $50 total
        modifier_price_delta: 0,
      })),
    )
    .select('id');
  if (itemErr || !items) throw new Error(`seedPaidTabWithPayment: items insert failed: ${itemErr?.message ?? 'no row'}`);

  const { data: payment, error: payErr } = await svc
    .from('payments')
    .insert({
      tab_id: tab.id,
      amount: 50.0,
      method: 'cash',
      processed_by: staffId,
      idempotency_key: `seed-refund-test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    })
    .select('id')
    .single();
  if (payErr || !payment) throw new Error(`seedPaidTabWithPayment: payment insert failed: ${payErr?.message ?? 'no row'}`);

  return {
    tabId: tab.id as string,
    paymentId: payment.id as string,
    itemIds: (items as { id: string }[]).map((i) => i.id),
    staffId,
  };
}

/**
 * Cleanup: handles a tab + its refund rows.
 * Cleanup order matters — foreign key RESTRICT constraints require payments/refunds
 * to be removed before deleting their referenced rows.
 *
 * Sub-tab handling was removed (Phase 1, Plan 11, D-09): tabs.parent_tab_id and
 * split_tab_by_* no longer exist — split-tab is a removed feature, so tabs seeded
 * by this file never have sub-tabs to clean up.
 */
async function cleanup(svc: any, tabId: string): Promise<void> {
  // 1. Handle refunds linked to this tab's payments
  const { data: payments } = await svc
    .from('payments')
    .select('id')
    .eq('tab_id', tabId)
    .eq('is_refund', false);
  for (const p of (payments ?? []) as { id: string }[]) {
    const { data: refunds } = await svc
      .from('refunds')
      .select('id')
      .eq('original_payment_id', p.id);
    for (const r of (refunds ?? []) as { id: string }[]) {
      // Delete refund_items first (CASCADE would handle this, but be explicit)
      await svc.from('refund_items').delete().eq('refund_id', r.id);
      // Delete negative payment row that references this refund (RESTRICT on payments.refund_id)
      await svc.from('payments').delete().eq('refund_id', r.id);
    }
    await svc.from('refunds').delete().eq('original_payment_id', p.id);
  }

  // 2. Delete all remaining payments
  await svc.from('payments').delete().eq('tab_id', tabId);

  // 3. Delete the tab → cascade to its orders → cascade to order_items
  await svc.from('tabs').delete().eq('id', tabId);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('process_refund RPC (integration)', () => {
  let svc: any;
  let tabId: string;

  beforeEach(() => {
    svc = getServiceDb();
    tabId = '';
  });

  afterEach(async () => {
    if (tabId) {
      await cleanup(svc, tabId).catch(() => undefined);
    }
  });

  itAuth('process_refund: inserts negative payment row and refund record', async () => {
    const { tabId: tid, paymentId, itemIds } = await seedPaidTabWithPayment(svc);
    tabId = tid;

    const managerClient = await getAuthClient(
      process.env['E2E_MANAGER_NAME']!,
      process.env['E2E_MANAGER_PIN']!,
    );

    // Refund 2 of 5 items with restock=true ($10 + $10 = $20)
    const refundItems = [
      { order_item_id: itemIds[0], qty: 1, amount: 10.0, restock: true },
      { order_item_id: itemIds[1], qty: 1, amount: 10.0, restock: true },
    ];

    const { data: refundId, error } = await (managerClient as any).rpc('process_refund', {
      p_original_payment_id: paymentId,
      p_items: refundItems,
      p_reason: 'wrong_order',
      p_manager_pin: process.env['E2E_MANAGER_PIN']!,
    });

    expect(error).toBeNull();
    expect(refundId).toBeTruthy();

    // Verify refund row
    const { data: refund } = await svc
      .from('refunds')
      .select('amount, reason, original_payment_id')
      .eq('id', refundId)
      .single();
    expect(Number(refund.amount)).toBe(20.0);
    expect(refund.reason).toBe('wrong_order');
    expect(refund.original_payment_id).toBe(paymentId);

    // Verify refund_items rows (2 items)
    const { data: rItems } = await svc
      .from('refund_items')
      .select('order_item_id, qty, amount, restock')
      .eq('refund_id', refundId);
    expect(rItems).toHaveLength(2);

    // Verify negative payment row (is_refund=true, amount=-20.00)
    const { data: negPayment } = await svc
      .from('payments')
      .select('amount, is_refund, refund_id')
      .eq('refund_id', refundId)
      .single();
    expect(Number(negPayment.amount)).toBe(-20.0);
    expect(negPayment.is_refund).toBe(true);
  });

  itAuth('process_refund: REFUND_EXCEEDS_ORIGINAL blocks over-refund', async () => {
    const { tabId: tid, paymentId, itemIds } = await seedPaidTabWithPayment(svc);
    tabId = tid;

    const managerClient = await getAuthClient(
      process.env['E2E_MANAGER_NAME']!,
      process.env['E2E_MANAGER_PIN']!,
    );

    // First refund: 1 item ($10) — succeeds; remaining refundable = $40
    const { error: firstErr } = await (managerClient as any).rpc('process_refund', {
      p_original_payment_id: paymentId,
      p_items: [{ order_item_id: itemIds[0], qty: 1, amount: 10.0, restock: false }],
      p_reason: 'billing_error',
      p_manager_pin: process.env['E2E_MANAGER_PIN']!,
    });
    expect(firstErr).toBeNull();

    // Second refund: all 5 items ($50) — total requested exceeds original ($50) - already refunded ($10) = $40
    // Requesting $50 when only $40 remains → REFUND_EXCEEDS_ORIGINAL
    const { error } = await (managerClient as any).rpc('process_refund', {
      p_original_payment_id: paymentId,
      p_items: itemIds.map((id: string) => ({ order_item_id: id, qty: 1, amount: 10.0, restock: false })),
      p_reason: 'billing_error',
      p_manager_pin: process.env['E2E_MANAGER_PIN']!,
    });

    expect(error).not.toBeNull();
    expect(error.message).toContain('REFUND_EXCEEDS_ORIGINAL');
  });

  itBartender('process_refund: AUTH_FORBIDDEN blocks bartender role', async () => {
    const { tabId: tid, paymentId, itemIds } = await seedPaidTabWithPayment(svc);
    tabId = tid;

    const bartenderClient = await getAuthClient(
      process.env['E2E_BARTENDER_NAME']!,
      process.env['E2E_BARTENDER_PIN']!,
    );

    const { data, error } = await (bartenderClient as any).rpc('process_refund', {
      p_original_payment_id: paymentId,
      p_items: [{ order_item_id: itemIds[0], qty: 1, amount: 10.0, restock: false }],
      p_reason: 'wrong_order',
      p_manager_pin: '',
    });

    expect(error).toBeNull();
    expect(data).toBeNull();
    const { count } = await svc.from('refunds').select('id', { count: 'exact', head: true }).eq('original_payment_id', paymentId);
    expect(count).toBe(0);
  });

  itAuth(
    'process_refund: restock=true attempts deplete_for_order_item (stub graceful when Phase 4 absent)',
    async () => {
      const { tabId: tid, paymentId, itemIds } = await seedPaidTabWithPayment(svc);
      tabId = tid;

      const managerClient = await getAuthClient(
        process.env['E2E_MANAGER_NAME']!,
        process.env['E2E_MANAGER_PIN']!,
      );

      // restock=true should succeed even if deplete_for_order_item is not yet deployed (Phase 4 stub)
      const { data: refundId, error } = await (managerClient as any).rpc('process_refund', {
        p_original_payment_id: paymentId,
        p_items: [{ order_item_id: itemIds[0], qty: 1, amount: 10.0, restock: true }],
        p_reason: 'quality_issue',
        p_manager_pin: process.env['E2E_MANAGER_PIN']!,
      });

      expect(error).toBeNull();
      expect(refundId).toBeTruthy();
    },
  );
});
