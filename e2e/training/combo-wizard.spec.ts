import { expect, test } from '../fixtures';
import { loginAs } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { getServiceClient, resetTestState } from '../helpers/supabase';
import { caption, clearCaption } from './caption';

/**
 * Training video: an admin builds a "3x2" (buy 3, cheapest free) combo
 * promotion scoped to the Snacks category, end to end in the Promotions
 * dialog. Captioned for the user manual — not part of the CI-critical suite.
 * Run with: npm run test:e2e:training
 */

const NAME = 'Demo 3x2 Snacks Combo';

test.describe('Training: build a combo promotion', () => {
  test.beforeEach(async () => {
    requireIntegrationEnv();
    await resetTestState();
  });

  test.afterEach(async () => {
    const admin = getServiceClient();
    await admin.from('promotions').delete().eq('name', NAME);
  });

  test('admin creates a 3x2 combo promotion', async ({ page }) => {
    await page.goto('/');
    await loginAs(page, 'admin');

    await caption(page, '1. Go to Promotions and start a new promotion');
    await page.goto('/promotions?new=1');
    const dialog = page.getByRole('dialog', { name: /new promotion/i });
    await expect(dialog).toBeVisible();
    await clearCaption(page);

    await caption(page, "2. Choose 'Combo' as the promotion type");
    await dialog.getByTestId('promotion-kind-combo').click();

    await caption(page, '3. Name the combo');
    await dialog.getByLabel(/^name/i).fill(NAME);

    await caption(page, '4. Add a slot: buy 3, targeting the Snacks category');
    await dialog.getByTestId('combo-slot-qty-0').fill('3');
    await dialog.getByRole('button', { name: /select products or categories/i }).click();
    await page.getByPlaceholder(/search products or categories/i).fill('Snacks');
    await page.getByRole('option', { name: 'Snacks', exact: true }).click();
    await page.keyboard.press('Escape');

    await caption(page, "5. Set pricing: 'Cheapest free' — 1 unit free per combo");
    await dialog.getByTestId('combo-pricing-type').click();
    await page.getByRole('option', { name: /cheapest free/i }).click();
    await dialog.getByTestId('combo-pricing-value').fill('1');

    await caption(page, '6. Save — the combo is live immediately (default dates already active)');
    await dialog.getByRole('button', { name: /create promotion/i }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/promotions$/);

    await caption(page, "Done: shown on the list as 'Combo · 1 slot(s)'", 2500);
    await page.getByPlaceholder(/search/i).fill(NAME);
    const row = page.getByRole('row', { name: new RegExp(NAME, 'i') });
    await expect(row).toBeVisible();
    await expect(row.getByText('Combo · 1 slot(s)')).toBeVisible();
    await clearCaption(page);
    await page.waitForTimeout(1000);
  });
});
