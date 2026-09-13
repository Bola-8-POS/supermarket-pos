import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures';
import { loginAs } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import {
  getServiceClient,
  resetTestState,
  setCategoryComboEligible,
  setProductComboEligible,
} from '../helpers/supabase';

/**
 * Task 8 (combos-and-terminal-caja): product- and category-level
 * combo_eligible toggles (Task 1/2 schema, Task 7 UI checkboxes) actually
 * filter the combo composition picker on `/promotions?new=1` — an
 * ineligible product/category must not be selectable as combo-slot
 * composition, and must reappear once eligibility is restored.
 *
 * Both fixtures are reset back to combo_eligible=true in
 * e2e/helpers/supabase.ts's resetTestState() as a defense-in-depth backstop
 * (this spec also restores them itself on the happy path), since
 * combo-checkout.spec.ts's 3x2 fixture depends on the Snacks category and
 * every one of its products staying combo-eligible by default.
 */

const PARLE_G = 'Parle-G Biscuits 200g'; // Snacks product used only for the product-level toggle here
const SNACKS_CATEGORY = 'Snacks';

/** Navigates to /inventory → Catalog → the requested sub-tab (Products or Categories). */
async function navigateToCatalog(page: Page, subTab: 'products' | 'categories'): Promise<void> {
  await page.goto('/inventory');
  await page.getByRole('tab', { name: 'Catalog' }).click();
  await page.getByRole('tab', { name: 'Products' }).click();
  if (subTab === 'categories') {
    await page.getByRole('tab', { name: 'Categories' }).click();
  }
}

/**
 * Scopes to the real Radix category dialog, excluding the always-mounted
 * AgentPanel (`aria-modal="false"`) — same exclusion categories.spec.ts
 * already uses for the identical strict-mode collision.
 */
function categoryDialog(page: Page) {
  return page.locator('[role="dialog"]:not([aria-modal="false"])');
}

test.describe('Combo eligibility toggles filter the combo composition picker', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    await page.goto('/');
    await loginAs(page, 'admin');
  });

  test.afterEach(async () => {
    await setProductComboEligible(PARLE_G, true);
    await setCategoryComboEligible(SNACKS_CATEGORY, true);
  });

  test('a product turned combo-ineligible disappears from the picker, and reappears once restored', async ({
    page,
  }) => {
    await navigateToCatalog(page, 'products');
    await page.getByPlaceholder('Search products…').fill(PARLE_G);
    const row = page.getByRole('row', { name: new RegExp(PARLE_G) });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.getByRole('button', { name: 'Edit' }).click();

    const productDialog = page.getByRole('dialog', { name: 'Edit product' });
    await expect(productDialog).toBeVisible({ timeout: 10_000 });
    const comboCheckbox = productDialog.getByRole('checkbox', { name: /combo eligible/i });
    await expect(comboCheckbox).toBeChecked();
    await comboCheckbox.uncheck();
    await productDialog.getByRole('button', { name: /save|update/i }).click();
    await expect(productDialog).not.toBeVisible({ timeout: 10_000 });

    const admin = getServiceClient();
    const { data: afterOff } = await admin
      .from('products')
      .select('combo_eligible')
      .eq('name', PARLE_G)
      .single();
    expect(afterOff?.combo_eligible).toBe(false);

    await page.goto('/promotions?new=1');
    const promoDialog = page.getByRole('dialog', { name: /new promotion/i });
    await expect(promoDialog).toBeVisible();
    await promoDialog.getByTestId('promotion-kind-combo').click();
    await promoDialog.getByRole('button', { name: /select products or categories/i }).click();
    await page.getByPlaceholder(/search products or categories/i).fill(PARLE_G);
    await expect(page.getByRole('option', { name: new RegExp(PARLE_G, 'i') })).toHaveCount(0);
    await page.keyboard.press('Escape');

    // Restore eligibility via the same UI round trip, then confirm the
    // picker offers it again.
    await navigateToCatalog(page, 'products');
    await page.getByPlaceholder('Search products…').fill(PARLE_G);
    const rowAgain = page.getByRole('row', { name: new RegExp(PARLE_G) });
    await expect(rowAgain).toBeVisible({ timeout: 10_000 });
    await rowAgain.getByRole('button', { name: 'Edit' }).click();
    const reopenDialog = page.getByRole('dialog', { name: 'Edit product' });
    await expect(reopenDialog).toBeVisible({ timeout: 10_000 });
    await reopenDialog.getByRole('checkbox', { name: /combo eligible/i }).check();
    await reopenDialog.getByRole('button', { name: /save|update/i }).click();
    await expect(reopenDialog).not.toBeVisible({ timeout: 10_000 });

    const { data: afterOn } = await admin
      .from('products')
      .select('combo_eligible')
      .eq('name', PARLE_G)
      .single();
    expect(afterOn?.combo_eligible).toBe(true);

    await page.goto('/promotions?new=1');
    const promoDialog2 = page.getByRole('dialog', { name: /new promotion/i });
    await expect(promoDialog2).toBeVisible();
    await promoDialog2.getByTestId('promotion-kind-combo').click();
    await promoDialog2.getByRole('button', { name: /select products or categories/i }).click();
    await page.getByPlaceholder(/search products or categories/i).fill(PARLE_G);
    await expect(page.getByRole('option', { name: new RegExp(PARLE_G, 'i') })).toBeVisible();
  });

  test('a category turned combo-ineligible disappears from the picker', async ({ page }) => {
    await navigateToCatalog(page, 'categories');
    await page.getByRole('button', { name: `Edit ${SNACKS_CATEGORY}` }).click();

    const dialog = categoryDialog(page);
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    const comboCheckbox = dialog.getByRole('checkbox', { name: /combo eligible/i });
    await expect(comboCheckbox).toBeChecked();
    await comboCheckbox.uncheck();
    await dialog.getByRole('button', { name: /save/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });

    const admin = getServiceClient();
    const { data: afterOff } = await admin
      .from('categories')
      .select('combo_eligible')
      .eq('name', SNACKS_CATEGORY)
      .single();
    expect(afterOff?.combo_eligible).toBe(false);

    // "No combos" tag on the now-ineligible category row.
    await expect(page.getByText('No combos')).toBeVisible();

    await page.goto('/promotions?new=1');
    const promoDialog = page.getByRole('dialog', { name: /new promotion/i });
    await expect(promoDialog).toBeVisible();
    await promoDialog.getByTestId('promotion-kind-combo').click();
    await promoDialog.getByRole('button', { name: /select products or categories/i }).click();
    await page.getByPlaceholder(/search products or categories/i).fill(SNACKS_CATEGORY);
    await expect(
      page.getByRole('option', { name: new RegExp(`^${SNACKS_CATEGORY}$`, 'i') })
    ).toHaveCount(0);
  });
});
