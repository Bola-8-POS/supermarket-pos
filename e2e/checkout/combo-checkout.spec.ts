import { expect, test } from '../fixtures';
import { loginAs } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import {
  getServiceClient,
  openCaja,
  resetTestState,
  seedComboPromotion,
  setInventoryFarFromExpiry,
} from '../helpers/supabase';

/**
 * Task 8 (combos-and-terminal-caja): a real 3x2 "cheapest free" combo,
 * scoped to the Snacks category, priced live at checkout by
 * process_direct_sale_atomic's combo pass (Task 4) — not the client's own
 * mirrored evaluateCombos, which is preview-only. Uses three real Snacks
 * products from scripts/seed-dev-data.ts with distinct base_price values
 * (55/35/60) so "cheapest free" has an unambiguous winner (Parle-G, $35).
 *
 * Floor guard check (see task-8-brief.md): revenue for this application is
 * Σprice − cheapest = (55+35+60) − 35 = $115; Σcost = 40+25+45 = $110.
 * 115 >= 110 clears process_direct_sale_atomic's below-cost floor guard
 * (checked once per whole combo application, not per row) with no manager
 * override needed.
 */

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const ALOO_BHUJIA = "Haldiram's Aloo Bhujia 200g"; // base_price 55
const PARLE_G = 'Parle-G Biscuits 200g'; // base_price 35 — cheapest of the three
const NAVRATTAN_MIX = "Haldiram's Navrattan Mix 200g"; // base_price 60

const seededPromotionIds: string[] = [];

test.describe('Combo checkout: 3x2 cheapest-free on Snacks, priced by the server, snapshotted on order_items', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    // A near-expiry-alert spec elsewhere mutates a shared seeded product's
    // inventory.expiry_date directly, and resetTestState doesn't restore it
    // (see setInventoryFarFromExpiry's own comment) — pin all three fixture
    // products far from expiry so the store's near-expiry auto-discount
    // never stacks with (and silently shrinks) this combo's own savings.
    await setInventoryFarFromExpiry(ALOO_BHUJIA);
    await setInventoryFarFromExpiry(PARLE_G);
    await setInventoryFarFromExpiry(NAVRATTAN_MIX);
    await openCaja(500);
    await page.goto('/');
    await loginAs(page, 'manager');
  });

  test.afterEach(async () => {
    if (seededPromotionIds.length === 0) return;
    const admin = getServiceClient();
    await admin.from('promotions').delete().in('id', seededPromotionIds);
    seededPromotionIds.length = 0;
  });

  test('adding one of each of 3 Snacks products applies the combo, and checkout snapshots it on the paid order', async ({
    page,
  }) => {
    const promotionId = await seedComboPromotion({
      name: `E2E 3x2 Snacks Checkout`,
      type: 'cheapest_free',
      value: 1,
      slots: [{ quantity: 3, categoryNames: ['Snacks'] }],
    });
    seededPromotionIds.push(promotionId);

    await page.goto('/pos');
    for (const productName of [ALOO_BHUJIA, PARLE_G, NAVRATTAN_MIX]) {
      const searchBox = page.getByPlaceholder(/search products/i);
      await searchBox.fill(productName);
      await page
        .getByRole('button', { name: new RegExp(`select ${escapeRe(productName)}`, 'i') })
        .click();
      await searchBox.fill('');
    }

    const comboApplications = page.getByTestId('combo-applications');
    await expect(comboApplications).toBeVisible();
    await expect(comboApplications).toContainText('E2E 3x2 Snacks Checkout');
    await expect(page.getByTestId('combo-savings')).toContainText('35.00');
    await expect(page.getByTestId('cart-total')).toContainText('115.00');

    await page
      .getByRole('button', { name: /^process payment$/i })
      .first()
      .click();
    await page.getByLabel(/amount tendered/i).fill('1000');

    const receiptPre = page.locator('pre');
    await page
      .getByRole('button', { name: /^process payment$/i })
      .last()
      .click();
    await expect(page.getByRole('button', { name: /done/i })).toBeVisible({ timeout: 30_000 });

    // Receipt preview (buildThermalReceiptText, receipt.json's "promotion"
    // label) shows a discount line for the free unit: "Promotion  -$35.00".
    await expect(receiptPre).toContainText(/promotion/i);
    await expect(receiptPre).toContainText('35.00');

    const admin = getServiceClient();
    const { data: tabRows, error: tabErr } = await admin
      .from('tabs')
      .select('id')
      .order('created_at', { ascending: false })
      .limit(1);
    if (tabErr) throw new Error(tabErr.message);
    const tabId = tabRows?.[0]?.id as string | undefined;
    expect(tabId).toBeTruthy();

    const { data: orderRows, error: orderErr } = await admin
      .from('orders')
      .select('id')
      .eq('tab_id', tabId as string)
      .order('created_at', { ascending: false })
      .limit(1);
    if (orderErr) throw new Error(orderErr.message);
    const orderId = orderRows?.[0]?.id as string | undefined;
    expect(orderId).toBeTruthy();

    const { data: items, error: itemsErr } = await admin
      .from('order_items')
      .select('unit_price, promotion_id')
      .eq('order_id', orderId as string);
    if (itemsErr) throw new Error(itemsErr.message);
    const freeRow = items?.find(i => Number(i.unit_price) === 0);
    expect(freeRow).toBeTruthy();
    expect(freeRow?.promotion_id).toBe(promotionId);

    await page.getByRole('button', { name: /done/i }).click();
  });
});
