import { expect, test } from '../fixtures';
import { loginAs, staffForRole } from '../../helpers/auth';
import { requireIntegrationEnv } from '../../helpers/requireEnv';
import { openCaja, resetTestState } from '../../helpers/supabase';
import { currentTutorialLocale, seedStaffLocale } from '../locale';
import {
  AMOUNT_TENDERED_RE,
  CHECKOUT_TILE_RE,
  CONFIRM_CARD_PAYMENT_RE,
  DONE_RE,
  PROCESS_PAYMENT_RE,
  SEARCH_PRODUCTS_PLACEHOLDER_RE,
  selectProductRe,
} from '../i18n-selectors';

/**
 * Phase 34 tracer: proves the full record -> pace -> .webm -> ffmpeg -> .mp4
 * pipeline end-to-end on the checkout domain, es-MX default. Not part of the
 * CI-critical suite — run via `npm run tutorial-videos:record`.
 */

const ALOO_BHUJIA = "Haldiram's Aloo Bhujia 200g";

test.describe('Tutorial: checkout', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    const { name } = staffForRole('cashier');
    await seedStaffLocale(name, currentTutorialLocale());
    await openCaja(500);
    await page.goto('/');
    await loginAs(page, 'cashier');
  });

  test('cashier completes a cash sale', async ({ page, narrate }) => {
    await narrate(page, 'Open the checkout screen', async () => {
      await page.getByRole('button', { name: CHECKOUT_TILE_RE }).click();
      await expect(page).toHaveURL(/\/pos$/);
    });

    await narrate(page, 'Search for a product and add it to the cart', async () => {
      await page.getByPlaceholder(SEARCH_PRODUCTS_PLACEHOLDER_RE).fill(ALOO_BHUJIA);
      await page.getByRole('button', { name: selectProductRe(ALOO_BHUJIA) }).click();
    });

    await narrate(page, 'Take a cash payment', async () => {
      await page
        .getByRole('button', { name: PROCESS_PAYMENT_RE })
        .first()
        .click();
      await page.getByLabel(AMOUNT_TENDERED_RE).fill('100');
    });

    await narrate(page, 'Confirm the payment', async () => {
      await page
        .getByRole('button', { name: PROCESS_PAYMENT_RE })
        .last()
        .click();
      await expect(page.getByRole('button', { name: DONE_RE })).toBeVisible({ timeout: 30_000 });
      await page.getByRole('button', { name: DONE_RE }).click();
    });
  });

  test('card payment as an alternative tender', async ({ page, narrate }) => {
    await narrate(page, 'Open the checkout screen', async () => {
      await page.getByRole('button', { name: CHECKOUT_TILE_RE }).click();
      await expect(page).toHaveURL(/\/pos$/);
    });

    await narrate(page, 'Search for a product and add it to the cart', async () => {
      await page.getByPlaceholder(SEARCH_PRODUCTS_PLACEHOLDER_RE).fill(ALOO_BHUJIA);
      await page.getByRole('button', { name: selectProductRe(ALOO_BHUJIA) }).click();
    });

    await narrate(page, 'Pay by card instead of cash', async () => {
      await page
        .getByRole('button', { name: PROCESS_PAYMENT_RE })
        .first()
        .click();
      await page.getByTestId('payment-btn-card').click();
      await page.getByRole('button', { name: CONFIRM_CARD_PAYMENT_RE }).click();
    });

    await narrate(page, 'Sale complete', async () => {
      await expect(page.getByRole('button', { name: DONE_RE })).toBeVisible({ timeout: 30_000 });
      await page.getByRole('button', { name: DONE_RE }).click();
    });
  });
});
