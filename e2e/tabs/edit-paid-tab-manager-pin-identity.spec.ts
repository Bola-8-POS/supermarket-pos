/**
 * E2E spec: Phase 28 Plan 02 — folded todo
 * (.planning/todos/pending/audit-manager-pin-identity-in-remaining-rpcs.md)
 *
 * Proves the edit_paid_tab identity-re-key fix (mirrors G-27-13/T-28-04): a
 * cashier session that gets a REAL manager to type their own PIN into
 * ManagerPinDialog now succeeds — before this plan's migration, edit_paid_tab
 * had no approver argument at all (today: p_approval_id, the manager
 * prompt's approval ticket) and authorized off the CALLER's own
 * auth.uid() session role, so this exact scenario failed with AUTH_FORBIDDEN
 * despite the correct PIN being entered.
 *
 * Requires bar-pos/.env.local (or equivalent env) with E2E_*_PIN/NAME and
 * SUPABASE_SERVICE_ROLE_KEY.
 */
import { expect, test } from '../fixtures';
import { gotoAuthed, loginAs, logout } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { getServiceClient, openCaja, resetTestState } from '../helpers/supabase';

interface SeededPaidTab {
  tabId: string;
  paymentId: string;
  orderItemId: string;
}

async function seedPaidTab(
  db: ReturnType<typeof getServiceClient>,
  unitPrice: number
): Promise<SeededPaidTab> {
  const { data: profile } = await db
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .limit(1)
    .single();

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
    const { data: newShift } = await db
      .from('shifts')
      .insert({ staff_id: profile.id, opening_cash: 0 })
      .select('id')
      .single();
    shiftId = newShift.id as string;
  }

  const { data: tab } = await db
    .from('tabs')
    .insert({
      customer_name: `E2E Edit Paid Tab Identity Test ${String(Date.now())}`,
      staff_id: profile.id,
      shift_id: shiftId,
      status: 'open',
      is_deleted: false,
    })
    .select('id')
    .single();

  const { data: order } = await db
    .from('orders')
    .insert({ tab_id: tab.id, staff_id: profile.id, status: 'pending' })
    .select('id')
    .single();

  const { data: product } = await db
    .from('products')
    .select('id')
    .eq('is_active', true)
    .limit(1)
    .single();

  const { data: items } = await db
    .from('order_items')
    .insert({
      order_id: order.id,
      product_id: product.id,
      quantity: 1,
      unit_price: unitPrice,
      modifier_price_delta: 0,
    })
    .select('id');
  const orderItemId = (items as { id: string }[])[0]?.id as string;

  const { error: tabUpdateErr } = await db
    .from('tabs')
    .update({ status: 'paid', closed_at: new Date().toISOString(), version: 2 })
    .eq('id', tab.id);
  if (tabUpdateErr) {
    throw new Error(`seedPaidTab: tabs update to paid failed: ${tabUpdateErr.message}`);
  }

  const { data: payment, error: payErr } = await db
    .from('payments')
    .insert({
      tab_id: tab.id,
      amount: unitPrice,
      method: 'cash',
      is_refund: false,
      processed_by: profile.id,
      idempotency_key: `e2e-seed-edit-paid-identity-${(tab.id as string).slice(0, 8)}`,
    })
    .select('id')
    .single();
  if (payErr || !payment) {
    throw new Error(`seedPaidTab: payments insert failed: ${payErr?.message ?? 'no row'}`);
  }

  return { tabId: tab.id as string, paymentId: payment.id as string, orderItemId };
}

async function enterManagerPin(page: import('@playwright/test').Page, pin: string): Promise<void> {
  for (const ch of pin) {
    const label = ch === '0' ? 'Key 0' : `Key ${ch}`;
    const btn = page.getByRole('button', { name: label });
    const isVisible = await btn.isVisible().catch(() => false);
    if (isVisible) {
      await btn.click();
    } else {
      await page.keyboard.type(ch);
    }
  }
}

test.beforeEach(async ({ page }) => {
  requireIntegrationEnv();
  await resetTestState();
  await openCaja(500);
  await page.goto('/');
});

test.afterEach(async ({ page }) => {
  await logout(page).catch(() => undefined);
});

test('cashier session + a genuine manager PIN succeeds on edit_paid_tab (folded todo, mirrors G-27-13)', async ({
  page,
}) => {
  test.setTimeout(90_000);

  const db = getServiceClient();
  const seeded = await seedPaidTab(db, 15.0);
  const managerPin = process.env['E2E_MANAGER_PIN'] ?? '';

  await loginAs(page, 'cashier');
  await gotoAuthed(page, '/payments');

  const row = page.getByTestId(`payment-row-${seeded.paymentId}`);
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.getByRole('button', { name: /edit ticket|editar ticket/i }).click();

  const dialog = page.getByRole('dialog', { name: /edit paid ticket|editar ticket pagado/i });
  await expect(dialog).toBeVisible({ timeout: 10_000 });

  const priceInput = dialog.locator(`#edit-price-${seeded.orderItemId}`);
  await expect(priceInput).toBeVisible({ timeout: 10_000 });
  await priceInput.fill('20');

  await dialog.locator('#edit-paid-tab-reason').fill('E2E cashier + manager PIN identity check');
  await dialog.getByRole('button', { name: /save correction|guardar corrección/i }).click();

  const pinDialog = page.getByRole('alertdialog');
  await expect(pinDialog).toBeVisible({ timeout: 8_000 });

  // The genuine manager's PIN — not the logged-in cashier's own identity.
  // Before Task 1's fix, edit_paid_tab had no approver argument (today:
  // p_approval_id, the manager prompt's approval ticket) and
  // authorized off the CALLER's own auth.uid() session role, so this exact
  // flow failed with AUTH_FORBIDDEN despite the correct PIN being entered.
  await enterManagerPin(page, managerPin);

  await expect(
    page.getByText(/ticket correction saved|corrección de ticket guardada/i)
  ).toBeVisible({ timeout: 15_000 });

  const { data: item } = await db
    .from('order_items')
    .select('unit_price')
    .eq('id', seeded.orderItemId)
    .single();
  expect(Number((item as { unit_price: number }).unit_price)).toBeCloseTo(20, 1);
});
