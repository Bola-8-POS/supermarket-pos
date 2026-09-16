import { expect, test } from '../fixtures';
import { enterPin, loginAs, staffForRole } from '../../helpers/auth';
import { requireIntegrationEnv } from '../../helpers/requireEnv';
import { getServiceClient, openCaja, resetTestState } from '../../helpers/supabase';
import { currentTutorialLocale, seedStaffLocale } from '../locale';
import { AMOUNT_TENDERED_RE, DONE_RE, PROCESS_PAYMENT_RE } from '../i18n-selectors';

/**
 * Phase 34 Plan 02: payments domain tutorial. Manager unlocks and completes
 * a payment from the /payments page, then processes a manager-PIN-gated
 * refund on a paid sale.
 */

// Dual-locale (es-MX/en-US) selectors specific to the payments domain — built
// inline per 34-01's guidance, not shared cross-domain via i18n-selectors.ts.
const PAYMENTS_TILE_RE = /^(payments|pagos)$/i;
const TABS_AWAITING_PAYMENT_RE = /tabs awaiting payment|cuentas por pagar/i;
const VERIFY_PIN_RE = /verify pin to process payment|verificar pin para procesar el pago/i;
const MANAGER_ACCESS_REQUIRED_RE = /manager access required|se requiere acceso de gerente/i;
const RECEIPT_HEADING_RE = /^(receipt|recibo)$/i;
const REFUND_BTN_RE = /^(refund|reembolso)$/i;
const PROCESS_REFUND_TITLE_RE = /^(process refund|procesar reembolso)$/i;
const SELECT_FOR_REFUND_RE = /^(select|seleccionar) .* (for refund|para reembolso)$/i;
const WRONG_ORDER_RE = /(wrong order|pedido equivocado)/i;
const REQUEST_APPROVAL_RE = /^(request approval|solicitar aprobación)$/i;
const REFUND_PROCESSED_RE = /(refund .* processed|reembolso .* procesado)/i;

/** Finds or creates an open shift, mirroring e2e/payments/payment-pane.spec.ts. */
async function ensureOpenShift(
  admin: ReturnType<typeof getServiceClient>
): Promise<{ id: string; staff_id: string }> {
  const { data: existing } = await admin
    .from('shifts')
    .select('id, staff_id')
    .is('clock_out', null)
    .limit(1)
    .maybeSingle();
  if (existing) return existing as { id: string; staff_id: string };

  const { data: mgr } = await admin
    .from('profiles')
    .select('id')
    .eq('role', 'manager')
    .limit(1)
    .maybeSingle();
  if (!mgr) throw new Error('ensureOpenShift: no manager profile found');

  const { data: shift, error } = await admin
    .from('shifts')
    .insert({ staff_id: mgr.id, clock_in: new Date().toISOString() })
    .select('id, staff_id')
    .single();
  if (error || !shift)
    throw new Error(`ensureOpenShift: failed to create shift — ${error?.message ?? 'no row'}`);
  return shift as { id: string; staff_id: string };
}

/** Seeds an open tab with one item, mirroring e2e/payments/payment-pane.spec.ts's local helper. */
async function seedOpenTab(customerName: string): Promise<string> {
  const admin = getServiceClient();
  const shift = await ensureOpenShift(admin);

  const { data: caja } = await admin
    .from('caja_sessions')
    .select('id')
    .eq('status', 'open')
    .maybeSingle();
  if (!caja) throw new Error('seedOpenTab: no open caja session — run openCaja first');

  const { data: tab, error: tabErr } = await admin
    .from('tabs')
    .insert({
      customer_name: customerName,
      staff_id: shift.staff_id,
      shift_id: shift.id,
      caja_session_id: caja.id,
      status: 'open',
    })
    .select('id')
    .single();
  if (tabErr || !tab) throw new Error(`seedOpenTab failed: ${tabErr?.message ?? 'no row'}`);

  const { data: product } = await admin
    .from('products')
    .select('id, base_price')
    .eq('name', "Haldiram's Aloo Bhujia 200g")
    .maybeSingle();
  if (product) {
    const { data: order } = await admin
      .from('orders')
      .insert({ tab_id: tab.id, staff_id: shift.staff_id, status: 'served' })
      .select('id')
      .single();
    if (order) {
      await admin.from('order_items').insert({
        order_id: order.id,
        product_id: product.id,
        quantity: 1,
        unit_price: product.base_price,
        modifier_price_delta: 0,
      });
    }
  }

  return tab.id as string;
}

/** Seeds a fully paid tab with real order_items, mirroring e2e/payments/refund.spec.ts's seedPaidTab. */
async function seedPaidTab(
  db: ReturnType<typeof getServiceClient>,
  itemCount: number,
  unitPrice: number
): Promise<{ paymentId: string; productId: string }> {
  const { data: profile } = await db
    .from('profiles')
    .select('id')
    .eq('role', 'manager')
    .limit(1)
    .single();
  if (!profile) throw new Error('seedPaidTab: no manager profile found');

  let shiftId: string;
  const { data: existingShift } = await db
    .from('shifts')
    .select('id')
    .is('clock_out', null)
    .limit(1)
    .maybeSingle();
  if (existingShift) {
    shiftId = existingShift.id as string;
  } else {
    const { data: newShift, error } = await db
      .from('shifts')
      .insert({ staff_id: profile.id, opening_cash: 0 })
      .select('id')
      .single();
    if (error || !newShift) throw new Error(`seedPaidTab: shift create failed - ${error?.message}`);
    shiftId = newShift.id as string;
  }

  const { data: tab, error: tabErr } = await db
    .from('tabs')
    .insert({
      customer_name: 'Tutorial Refund Test',
      staff_id: profile.id,
      shift_id: shiftId,
      status: 'open',
      is_deleted: false,
    })
    .select('id')
    .single();
  if (tabErr || !tab) throw new Error(`seedPaidTab: tab insert failed - ${tabErr?.message}`);

  const { data: order, error: orderErr } = await db
    .from('orders')
    .insert({ tab_id: tab.id, staff_id: profile.id, status: 'pending' })
    .select('id')
    .single();
  if (orderErr || !order) throw new Error(`seedPaidTab: order insert failed - ${orderErr?.message}`);

  const { data: product, error: productErr } = await db
    .from('products')
    .select('id')
    .eq('is_active', true)
    .limit(1)
    .single();
  if (productErr || !product)
    throw new Error(`seedPaidTab: no active product found - ${productErr?.message}`);

  const inserts = Array.from({ length: itemCount }, () => ({
    order_id: order.id,
    product_id: product.id,
    quantity: 1,
    unit_price: unitPrice,
    modifier_price_delta: 0,
  }));
  const { error: itemsErr } = await db.from('order_items').insert(inserts);
  if (itemsErr) throw new Error(`seedPaidTab: order_items insert failed - ${itemsErr.message}`);

  // tabs carries a bump_version_on_update trigger requiring every UPDATE to
  // advance `version` by exactly +1 — a freshly inserted tab starts at
  // version 1, so this update must set version: 2.
  const { error: tabUpdateErr } = await db
    .from('tabs')
    .update({ status: 'paid', closed_at: new Date().toISOString(), version: 2 })
    .eq('id', tab.id);
  if (tabUpdateErr) throw new Error(`seedPaidTab: tabs update to paid failed - ${tabUpdateErr.message}`);

  const { data: payment, error: payErr } = await db
    .from('payments')
    .insert({
      tab_id: tab.id,
      amount: itemCount * unitPrice,
      method: 'cash',
      is_refund: false,
      processed_by: profile.id,
      idempotency_key: `e2e-tutorial-refund-${(tab.id as string).slice(0, 8)}`,
    })
    .select('id')
    .single();
  if (payErr || !payment) throw new Error(`seedPaidTab: payments insert failed - ${payErr?.message}`);

  return { paymentId: payment.id as string, productId: product.id as string };
}

test.describe('Tutorial: payments', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    const { name } = staffForRole('manager');
    await seedStaffLocale(name, currentTutorialLocale());
    await openCaja(500);
    await page.goto('/');
    await loginAs(page, 'manager');
  });

  test('manager unlocks and completes a payment from the Payments page', async ({
    page,
    narrate,
  }) => {
    test.setTimeout(120_000);
    await seedOpenTab('Tutorial Payment Test');

    await narrate(page, 'Open the Payments page', async () => {
      await page.goto('/home');
      await page.getByRole('button', { name: PAYMENTS_TILE_RE }).click();
      await expect(page).toHaveURL(/\/payments/, { timeout: 15_000 });
      await expect(page.getByText(TABS_AWAITING_PAYMENT_RE)).toBeVisible({ timeout: 15_000 });
    });

    const list = page.getByTestId('tabs-waiting-for-payment');

    await narrate(page, 'Select the open tab', async () => {
      await expect(list.getByText('Tutorial Payment Test')).toBeVisible({ timeout: 20_000 });
      await list.getByRole('button', { name: /tab Tutorial Payment Test/i }).click();
      await expect(page.getByRole('button', { name: VERIFY_PIN_RE })).toBeVisible({
        timeout: 10_000,
      });
    });

    await narrate(page, 'Unlock the payment form with a manager PIN', async () => {
      await page.getByRole('button', { name: VERIFY_PIN_RE }).click();
      const pinDialog = page.getByRole('alertdialog', { name: MANAGER_ACCESS_REQUIRED_RE });
      await expect(pinDialog).toBeVisible({ timeout: 10_000 });
      const managerPin = process.env['E2E_MANAGER_PIN'] ?? '';
      await enterPin(page, managerPin);
      await expect(pinDialog).not.toBeVisible({ timeout: 10_000 });
    });

    await narrate(page, 'Take a cash payment', async () => {
      await expect(page.getByTestId('payment-btn-cash')).toBeVisible({ timeout: 15_000 });
      await page.getByTestId('payment-btn-cash').click();
      await page.getByLabel(AMOUNT_TENDERED_RE).fill('500');
      await page.getByRole('button', { name: PROCESS_PAYMENT_RE }).click();
    });

    await narrate(page, 'Payment complete', async () => {
      await expect(page.getByRole('heading', { name: RECEIPT_HEADING_RE })).toBeVisible({
        timeout: 90_000,
      });
      await page.getByRole('button', { name: DONE_RE }).click();
    });
  });

  test('manager processes a refund with the PIN gate', async ({ page, narrate }) => {
    test.setTimeout(120_000);
    const db = getServiceClient();
    await seedPaidTab(db, 2, 10);
    const managerPin = process.env['E2E_MANAGER_PIN'] ?? '';

    await narrate(page, 'Open the payments page', async () => {
      await page.goto('/payments');
      await expect(page.getByRole('button', { name: REFUND_BTN_RE }).first()).toBeVisible({
        timeout: 20_000,
      });
    });

    const refundDialog = page.getByRole('dialog', { name: PROCESS_REFUND_TITLE_RE });

    await narrate(page, 'Start a refund on the paid sale', async () => {
      await page.getByRole('button', { name: REFUND_BTN_RE }).first().click();
      await expect(refundDialog).toBeVisible({ timeout: 10_000 });
    });

    await narrate(page, 'Select an item and choose a reason', async () => {
      const checkbox = refundDialog.getByRole('checkbox', { name: SELECT_FOR_REFUND_RE }).first();
      await expect(checkbox).toBeVisible({ timeout: 10_000 });
      await checkbox.check();
      await refundDialog.locator('#refund-reason').click();
      await page.getByRole('option', { name: WRONG_ORDER_RE }).click();
    });

    await narrate(page, 'Request manager approval', async () => {
      await page.getByRole('button', { name: REQUEST_APPROVAL_RE }).click();
      const pinDialog = page.getByRole('alertdialog');
      await expect(pinDialog).toBeVisible({ timeout: 8_000 });
      await expect(pinDialog.getByText(MANAGER_ACCESS_REQUIRED_RE)).toBeVisible();
      await enterPin(page, managerPin);
    });

    await narrate(page, 'Refund processed', async () => {
      await expect(page.getByText(REFUND_PROCESSED_RE)).toBeVisible({ timeout: 15_000 });
    });
  });
});
