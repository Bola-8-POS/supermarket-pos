/* eslint-disable */
import { createClient } from '@supabase/supabase-js';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

/**
 * Integration test: manager approvals on the override RPCs.
 *
 * Requires VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY
 * (local stack). Skips gracefully when they are absent.
 *
 * Run: npx vitest run src/entities/payment/model/manager-approvals.integration.test.ts --project integration
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const serviceKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
const skip = !url || !serviceKey || !anonKey;

const TAG = '__manager_approvals_test__';
const PASSWORD = `Tp-${crypto.randomUUID()}`;

interface TestUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'cashier';
  pin: string;
  client: any;
}

interface PaidTab {
  tabId: string;
  paymentId: string;
  itemIds: string[];
}

describe.skipIf(skip)('manager approvals', () => {
  const db = createClient(url!, serviceKey!, { auth: { persistSession: false } }) as any;
  const stamp = String(Date.now());
  const cashier: TestUser = { id: '', name: `${TAG}cashier`, email: `${TAG}c_${stamp}@test.local`, role: 'cashier', pin: '', client: null };
  const managerA: TestUser = { id: '', name: `${TAG}managerA`, email: `${TAG}ma_${stamp}@test.local`, role: 'manager', pin: '', client: null };
  const managerB: TestUser = { id: '', name: `${TAG}managerB`, email: `${TAG}mb_${stamp}@test.local`, role: 'manager', pin: '', client: null };
  const admin: TestUser = { id: '', name: `${TAG}admin`, email: `${TAG}ad_${stamp}@test.local`, role: 'admin', pin: '', client: null };
  const tabIds: string[] = [];

  async function unusedPin(): Promise<string> {
    for (let i = 0; i < 50; i++) {
      const candidate = String(100000 + Math.floor(Math.random() * 900000));
      const { count } = await db.from('profiles').select('id', { count: 'exact', head: true }).eq('pin', candidate);
      if (count === 0) return candidate;
    }
    throw new Error('no unused pin found');
  }

  async function makeUser(u: TestUser, pin?: string): Promise<void> {
    u.pin = pin ?? (await unusedPin());
    const { data, error } = await db.auth.admin.createUser({ email: u.email, password: PASSWORD, email_confirm: true });
    if (error || !data.user) throw new Error(`create user: ${error?.message}`);
    u.id = data.user.id as string;
    const { error: profileErr } = await db.from('profiles').upsert({
      id: u.id, name: u.name, email: u.email, role: u.role, pin: u.pin, is_active: true,
    });
    if (profileErr) throw new Error(`profile upsert: ${profileErr.message}`);
    u.client = createClient(url!, anonKey!, { auth: { persistSession: false } });
    const { error: signInErr } = await u.client.auth.signInWithPassword({ email: u.email, password: PASSWORD });
    if (signInErr) throw new Error(`sign in: ${signInErr.message}`);
  }

  async function removeUser(u: TestUser): Promise<void> {
    if (!u.id) return;
    await db.from('pin_attempts').delete().eq('attempt_key', `caller:${u.id}`);
    const { error: profileErr } = await db.from('profiles').delete().eq('id', u.id);
    if (profileErr) throw new Error(`profile delete for ${u.name}: ${profileErr.message}`);
    const { error: authErr } = await db.auth.admin.deleteUser(u.id);
    if (authErr) throw new Error(`auth user delete for ${u.name}: ${authErr.message}`);
  }

  async function clearAttempts(u: TestUser): Promise<void> {
    await db.from('pin_attempts').delete().eq('attempt_key', `caller:${u.id}`);
  }

  async function attemptRow(u: TestUser): Promise<{ failed_count: number } | null> {
    const { data } = await db.from('pin_attempts').select('failed_count').eq('attempt_key', `caller:${u.id}`).maybeSingle();
    return data;
  }

  /** A paid tab owned by the cashier with five $10 lines and one $50 cash payment. */
  async function seedPaidTab(): Promise<PaidTab> {
    const { data: product } = await db.from('products').select('id').eq('is_active', true).limit(1).single();
    if (!product) throw new Error('no active product');
    const { data: tab, error: tabErr } = await db.from('tabs').insert({
      customer_name: `${TAG}${Date.now()}`, staff_id: cashier.id, shift_id: shiftId, status: 'paid', closed_at: new Date().toISOString(),
    }).select('id').single();
    if (tabErr || !tab) throw new Error(`tab insert: ${tabErr?.message}`);
    tabIds.push(tab.id);
    const { data: order, error: orderErr } = await db.from('orders').insert({ tab_id: tab.id, staff_id: cashier.id, status: 'served' }).select('id').single();
    if (orderErr || !order) throw new Error(`order insert: ${orderErr?.message}`);
    const { data: items, error: itemErr } = await db.from('order_items').insert(
      Array.from({ length: 5 }, () => ({ order_id: order.id, product_id: product.id, quantity: 1, unit_price: 10.0, modifier_price_delta: 0 })),
    ).select('id');
    if (itemErr || !items) throw new Error(`items insert: ${itemErr?.message}`);
    const { data: payment, error: payErr } = await db.from('payments').insert({
      tab_id: tab.id, amount: 50.0, method: 'cash', processed_by: cashier.id, idempotency_key: `${TAG}${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    }).select('id').single();
    if (payErr || !payment) throw new Error(`payment insert: ${payErr?.message}`);
    return { tabId: tab.id, paymentId: payment.id, itemIds: items.map((i: { id: string }) => i.id) };
  }

  /** An open tab owned by the cashier with one $40 line. */
  async function seedOpenTab(): Promise<string> {
    const { data: product } = await db.from('products').select('id').eq('is_active', true).limit(1).single();
    if (!product) throw new Error('no active product');
    const { data: tab, error: tabErr } = await db.from('tabs').insert({
      customer_name: `${TAG}${Date.now()}`, staff_id: cashier.id, shift_id: shiftId, status: 'open',
    }).select('id').single();
    if (tabErr || !tab) throw new Error(`tab insert: ${tabErr?.message}`);
    tabIds.push(tab.id);
    const { data: order, error: orderErr } = await db.from('orders').insert({ tab_id: tab.id, staff_id: cashier.id, status: 'pending' }).select('id').single();
    if (orderErr || !order) throw new Error(`order insert: ${orderErr?.message}`);
    const { error: itemErr } = await db.from('order_items').insert({ order_id: order.id, product_id: product.id, quantity: 1, unit_price: 40.0, modifier_price_delta: 0 });
    if (itemErr) throw new Error(`item insert: ${itemErr.message}`);
    return tab.id;
  }

  function refundArgs(tab: PaidTab, pin: string, approverId: string | null) {
    return {
      p_original_payment_id: tab.paymentId,
      p_items: [{ order_item_id: tab.itemIds[0], qty: 1, amount: 10.0, restock: false }],
      p_reason: 'other',
      p_manager_pin: pin,
      p_approver_id: approverId,
    };
  }

  function paymentArgs(tabId: string, pin: string | null, approverId: string | null) {
    return {
      p_tab_id: tabId,
      p_staff_id: cashier.id,
      p_amount: 36.0,
      p_method: 'cash',
      p_idempotency_key: `${TAG}${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      p_tendered_amount: 40.0,
      p_discount_scope: 'all',
      p_discount_type: 'percent',
      p_discount_value: 10,
      p_discount_amount: 4.0,
      p_manager_override: true,
      p_manager_pin: pin,
      p_approver_id: approverId,
    };
  }

  let shiftId = '';

  beforeAll(async () => {
    await makeUser(cashier);
    await makeUser(managerA);
    await makeUser(managerB, managerA.pin); // shares a PIN with manager A
    await makeUser(admin);
    const { data: shift, error } = await db.from('shifts').insert({ staff_id: cashier.id, opening_cash: 0 }).select('id').single();
    if (error || !shift) throw new Error(`shift insert: ${error?.message}`);
    shiftId = shift.id;
  });

  afterEach(async () => {
    await clearAttempts(cashier);
  });

  afterAll(async () => {
    for (const tabId of tabIds) {
      const tabPaymentIds = (await db.from('payments').select('id').eq('tab_id', tabId)).data?.map((p: { id: string }) => p.id) ?? [];
      // payments.refund_id and refunds.original_payment_id reference each
      // other (both RESTRICT), so the refund-tracking payment row has to go
      // before the refund it points to, or the refund delete below is
      // blocked by its own foreign key.
      await db.from('payments').delete().eq('tab_id', tabId).eq('is_refund', true);
      await db.from('refunds').delete().in('original_payment_id', tabPaymentIds);
      await db.from('payments').delete().eq('tab_id', tabId);
      await db.from('order_items').delete().in('order_id', (await db.from('orders').select('id').eq('tab_id', tabId)).data?.map((o: { id: string }) => o.id) ?? []);
      await db.from('orders').delete().eq('tab_id', tabId);
      await db.from('tabs').delete().eq('id', tabId);
    }
    if (shiftId) await db.from('shifts').delete().eq('id', shiftId);

    // The payment and direct-sale paths write stock_movements rows for the
    // cashier (via the order_items trigger), and process_refund writes a
    // legacy audit_log row for the approver. Both carry a RESTRICT/NO ACTION
    // foreign key to profiles, so clear them before removing the profiles
    // below or the deletes silently no-op and the rows accumulate.
    const testUserIds = [cashier.id, managerA.id, managerB.id, admin.id].filter(Boolean);
    if (testUserIds.length > 0) {
      const { error: stockErr } = await db.from('stock_movements').delete().in('staff_id', testUserIds);
      if (stockErr) throw new Error(`stock_movements cleanup: ${stockErr.message}`);
      const { error: auditErr } = await db.from('audit_log').delete().in('actor_id', testUserIds);
      if (auditErr) throw new Error(`audit_log cleanup: ${auditErr.message}`);
    }

    await removeUser(cashier);
    await removeUser(managerA);
    await removeUser(managerB);
    await removeUser(admin);
  });

  it('refuses a PIN that two eligible staff members share when no approver id is given', async () => {
    const tab = await seedPaidTab();
    const { data, error } = await cashier.client.rpc('process_refund', refundArgs(tab, managerA.pin, null));
    expect(error).toBeNull();
    expect(data).toBeNull();
    const { count } = await db.from('refunds').select('id', { count: 'exact', head: true }).eq('original_payment_id', tab.paymentId);
    expect(count).toBe(0);
  });

  it('records the approver and the session actor on a refund approved with an id', async () => {
    const tab = await seedPaidTab();
    const { data: refundId, error } = await cashier.client.rpc('process_refund', refundArgs(tab, managerA.pin, managerA.id));
    expect(error).toBeNull();
    const { data: refund } = await db.from('refunds').select('created_by').eq('id', refundId).single();
    expect(refund.created_by).toBe(managerA.id);
    const { data: audit } = await db.from('audit_logs').select('actor_id, after').eq('action', 'payment.refund').eq('entity_id', tab.paymentId).order('created_at', { ascending: false }).limit(1).single();
    expect(audit.actor_id).toBe(cashier.id);
    expect(audit.after.approved_by).toBe(managerA.id);
    expect(await attemptRow(cashier)).toBeNull();
  });

  it('refuses a valid PIN paired with someone else\'s id', async () => {
    const tab = await seedPaidTab();
    const { data, error } = await cashier.client.rpc('process_refund', refundArgs(tab, admin.pin, managerA.id));
    expect(error).toBeNull();
    expect(data).toBeNull();
    expect((await attemptRow(cashier))?.failed_count).toBe(1);
  });

  it('still accepts the PIN-only shape when the PIN has one eligible holder', async () => {
    const tab = await seedPaidTab();
    const { error } = await cashier.client.rpc('process_refund', refundArgs(tab, admin.pin, null));
    expect(error).toBeNull();
    const { data: refund } = await db.from('refunds').select('created_by').eq('original_payment_id', tab.paymentId).single();
    expect(refund.created_by).toBe(admin.id);
  });

  it('locks the caller after repeated wrong PINs, shares the lock with the in-session check, and refuses the right PIN while locked', async () => {
    const tab = await seedPaidTab();
    expect(await attemptRow(cashier)).toBeNull();
    for (let i = 0; i < 5; i++) {
      const wrong = managerA.pin === '000000' ? '000001' : '000000';
      const { data, error } = await cashier.client.rpc('process_refund', refundArgs(tab, wrong, managerA.id));
      expect(error).toBeNull();
      expect(data).toBeNull();
    }
    const { data: check } = await cashier.client.rpc('verify_staff_pin', { p_pin: managerA.pin, p_staff_id: managerA.id });
    expect(check).toMatchObject({ ok: false, code: 'LOCKED' });
    const { data, error } = await cashier.client.rpc('process_refund', refundArgs(tab, managerA.pin, managerA.id));
    expect(error).toBeNull();
    expect(data).toBeNull();
    const { count } = await db.from('refunds').select('id', { count: 'exact', head: true }).eq('original_payment_id', tab.paymentId);
    expect(count).toBe(0);
  });

  it('stores the approver on a discounted payment and reports a lock with its own code', async () => {
    const tabId = await seedOpenTab();
    const { data, error } = await db.rpc('process_payment_atomic', paymentArgs(tabId, managerA.pin, managerA.id));
    expect(error).toBeNull();
    expect(data.ok).toBe(true);
    const { data: payment } = await db.from('payments').select('approved_by, processed_by').eq('id', data.paymentId).single();
    expect(payment).toEqual({ approved_by: managerA.id, processed_by: cashier.id });
    const { data: audit } = await db.from('audit_logs').select('actor_id, after').eq('action', 'payment.process').eq('entity_id', data.paymentId).single();
    expect(audit.after.approved_by).toBe(managerA.id);

    const second = await seedOpenTab();
    for (let i = 0; i < 5; i++) {
      const wrong = managerA.pin === '000000' ? '000001' : '000000';
      const { data: refused } = await db.rpc('process_payment_atomic', paymentArgs(second, wrong, managerA.id));
      expect(refused).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    }
    const { data: locked } = await db.rpc('process_payment_atomic', paymentArgs(second, managerA.pin, managerA.id));
    expect(locked).toMatchObject({ ok: false, code: 'PIN_LOCKED' });
    expect(locked.retryAfter).toBeGreaterThan(0);
  });

  it('counts one attempt and records no payment when a direct sale is refused', async () => {
    const wrong = managerA.pin === '000000' ? '000001' : '000000';
    const { data: product } = await db.from('products').select('id').eq('is_active', true).limit(1).single();
    if (!product) throw new Error('no active product');
    const { data: caja, error: cajaErr } = await db.from('caja_sessions').insert({ opened_by: managerA.id, opening_cash: 0, terminal_id: `T${stamp.slice(-8)}` }).select('id, terminal_id').single();
    if (cajaErr || !caja) throw new Error(`caja insert: ${cajaErr?.message}`);
    try {
      const { data, error } = await db.rpc('process_direct_sale_atomic', {
        p_staff_id: cashier.id,
        p_shift_id: shiftId,
        p_caja_session_id: caja.id,
        p_items: [{ product_id: product.id, quantity: 1, unit_price: 1, modifier_ids: [], modifier_price_delta: 0, notes: '' }],
        p_idempotency_key: `${TAG}${Date.now()}`,
        p_method: 'cash',
        p_amount: 1,
        p_tendered_amount: 1,
        p_manager_override: true,
        p_manager_pin: wrong,
        p_approver_id: managerA.id,
        p_terminal_id: caja.terminal_id,
      });
      expect(error).toBeNull();
      expect(data).toMatchObject({ ok: false, code: 'FORBIDDEN' });
      expect((await attemptRow(cashier))?.failed_count).toBe(1);
    } finally {
      await db.from('caja_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', caja.id);
      await db.from('caja_sessions').delete().eq('id', caja.id);
    }
  });

  it('stores the approver on the delegated payment and clears the attempt when a direct sale succeeds', async () => {
    const { data: product } = await db.from('products').select('id, base_price').eq('is_active', true).eq('sold_by_weight', false).limit(1).single();
    if (!product) throw new Error('no active product');
    const { data: caja, error: cajaErr } = await db.from('caja_sessions').insert({ opened_by: managerA.id, opening_cash: 0, terminal_id: `T${stamp.slice(-8)}` }).select('id, terminal_id').single();
    if (cajaErr || !caja) throw new Error(`caja insert: ${cajaErr?.message}`);
    let saleTabId: string | null = null;
    try {
      const basePrice = Number(product.base_price);
      const discountAmount = Math.round(basePrice * 10) / 100;
      const total = Math.round((basePrice - discountAmount) * 100) / 100;
      const { data, error } = await db.rpc('process_direct_sale_atomic', {
        p_staff_id: cashier.id,
        p_shift_id: shiftId,
        p_caja_session_id: caja.id,
        p_items: [{ product_id: product.id, quantity: 1, unit_price: basePrice, modifier_ids: [], modifier_price_delta: 0, notes: '' }],
        p_idempotency_key: `${TAG}${Date.now()}`,
        p_method: 'cash',
        p_amount: total,
        p_tendered_amount: total,
        p_discount_scope: 'all',
        p_discount_type: 'percent',
        p_discount_value: 10,
        p_discount_amount: discountAmount,
        p_manager_override: true,
        p_manager_pin: managerA.pin,
        p_approver_id: managerA.id,
        p_terminal_id: caja.terminal_id,
      });
      expect(error).toBeNull();
      expect(data.ok).toBe(true);
      saleTabId = data.tabId;
      tabIds.push(data.tabId);
      const { data: payment } = await db.from('payments').select('approved_by, processed_by').eq('id', data.paymentId).single();
      expect(payment).toEqual({ approved_by: managerA.id, processed_by: cashier.id });
      const { data: audit } = await db.from('audit_logs').select('actor_id, after').eq('action', 'payment.process').eq('entity_id', data.paymentId).single();
      expect(audit.after.approved_by).toBe(managerA.id);
      // Called with the service key, not a signed-in session: record_audit's auth.uid() is NULL.
      expect(audit.actor_id).toBeNull();
      expect(await attemptRow(cashier)).toBeNull();
    } finally {
      // caja_sessions (like tabs) carries the bump_version_on_update trigger
      // (STALE_VERSION unless new.version = old.version + 1), and the tab the
      // sale just created still references this caja_session_id — release
      // that reference (with its own version bump) before closing and
      // deleting the caja, or both updates below silently no-op/fail.
      if (saleTabId) {
        const { data: tabRow } = await db.from('tabs').select('version').eq('id', saleTabId).single();
        const tabVersion = ((tabRow as { version?: number } | null)?.version ?? 0) + 1;
        await db.from('tabs').update({ caja_session_id: null, version: tabVersion }).eq('id', saleTabId);
      }
      const { data: cajaRow } = await db.from('caja_sessions').select('version').eq('id', caja.id).single();
      const cajaVersion = ((cajaRow as { version?: number } | null)?.version ?? 0) + 1;
      await db.from('caja_sessions').update({ status: 'closed', closed_at: new Date().toISOString(), version: cajaVersion }).eq('id', caja.id);
      await db.from('caja_sessions').delete().eq('id', caja.id);
    }
  });

  it('stores the approver on every leg of a split payment', async () => {
    const tabId = await seedOpenTab();
    const { data, error } = await db.rpc('process_split_payment_atomic', {
      p_tab_id: tabId,
      p_staff_id: cashier.id,
      p_legs: [
        { method: 'cash', amount: 18, tenderedAmount: 18 },
        { method: 'cash', amount: 18, tenderedAmount: 18 },
      ],
      p_expected_total: 36,
      p_idempotency_key: `${TAG}${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      p_discount_scope: 'all',
      p_discount_type: 'percent',
      p_discount_value: 10,
      p_discount_amount: 4.0,
      p_manager_override: true,
      p_manager_pin: managerA.pin,
      p_approver_id: managerA.id,
    });
    expect(error).toBeNull();
    expect(data.ok).toBe(true);
    const { data: payments } = await db.from('payments').select('approved_by').eq('tab_id', tabId);
    expect(payments.length).toBeGreaterThan(0);
    expect(payments.every((p: { approved_by: string }) => p.approved_by === managerA.id)).toBe(true);
    const { data: audit } = await db.from('audit_logs').select('after').eq('action', 'payment.process_split').eq('entity_id', data.paymentGroupId).single();
    expect(audit.after.approved_by).toBe(managerA.id);
  });
});
