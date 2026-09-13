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
import { caption, clearCaption } from './caption';

/**
 * Training video: a cashier rings up three Snacks products, the "3x2"
 * combo auto-applies at checkout, and the receipt shows the discount.
 * Captioned for the user manual — not part of the CI-critical suite.
 * Run with: npm run test:e2e:training
 */

const ALOO_BHUJIA = "Haldiram's Aloo Bhujia 200g";
const PARLE_G = 'Parle-G Biscuits 200g';
const NAVRATTAN_MIX = "Haldiram's Navrattan Mix 200g";
const PROMO_NAME = 'Demo 3x2 Snacks Checkout';

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test.describe('Training: checkout with a combo', () => {
  test.beforeEach(async () => {
    requireIntegrationEnv();
    await resetTestState();
    await setInventoryFarFromExpiry(ALOO_BHUJIA);
    await setInventoryFarFromExpiry(PARLE_G);
    await setInventoryFarFromExpiry(NAVRATTAN_MIX);
  });

  test.afterEach(async () => {
    const admin = getServiceClient();
    await admin.from('promotions').delete().eq('name', PROMO_NAME);
  });

  test('cashier checks out three combo-eligible items and the discount applies', async ({
    page,
  }) => {
    await seedComboPromotion({
      name: PROMO_NAME,
      type: 'cheapest_free',
      value: 1,
      slots: [{ quantity: 3, categoryNames: ['Snacks'] }],
    });
    await openCaja(500);

    await page.goto('/');
    await loginAs(page, 'manager');

    await caption(page, '1. Scan or search the first Snacks item');
    await page.goto('/pos');
    for (const productName of [ALOO_BHUJIA, PARLE_G, NAVRATTAN_MIX]) {
      const searchBox = page.getByPlaceholder(/search products/i);
      await searchBox.fill(productName);
      await page
        .getByRole('button', { name: new RegExp(`select ${escapeRe(productName)}`, 'i') })
        .click();
      await searchBox.fill('');
    }
    await clearCaption(page);

    await caption(page, "2. Three Snacks in cart — combo auto-applies, cheapest item is free");
    const comboApplications = page.getByTestId('combo-applications');
    await expect(comboApplications).toBeVisible();
    await expect(comboApplications).toContainText(PROMO_NAME);

    await caption(page, '3. Cart total already reflects the combo discount');
    await expect(page.getByTestId('cart-total')).toContainText('115.00');

    await caption(page, '4. Take payment as usual');
    await page
      .getByRole('button', { name: /^process payment$/i })
      .first()
      .click();
    await page.getByLabel(/amount tendered/i).fill('1000');
    await clearCaption(page);

    await page
      .getByRole('button', { name: /^process payment$/i })
      .last()
      .click();
    await expect(page.getByRole('button', { name: /done/i })).toBeVisible({ timeout: 30_000 });

    await caption(page, '5. Receipt shows the combo discount line', 2500);
    const receiptPre = page.locator('pre');
    await expect(receiptPre).toContainText(/promotion/i);
    await clearCaption(page);
    await page.waitForTimeout(1000);

    await page.getByRole('button', { name: /done/i }).click();
  });
});
