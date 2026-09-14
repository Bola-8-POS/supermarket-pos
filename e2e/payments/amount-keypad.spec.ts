import { expect, test, type Page } from '../fixtures';
import { loginAs } from '../helpers/auth';
import { openCaja, resetTestState } from '../helpers/supabase';
import { requireIntegrationEnv } from '../helpers/requireEnv';

/**
 * The on-screen numeric amount keypad on the Payment page (cash tender
 * entry) — replaces the earlier PLU/qty keypad that was on the cart-building
 * checkout screen (src/features/checkout-keypad, removed) and made no sense
 * once the user reached the payment step.
 */
function keypadLocator(page: Page) {
  return page.getByTestId('amount-keypad');
}

async function goToCashPayment(page: Page) {
  // Navigate directly rather than clicking the Home page's "Checkout" tile —
  // that tile doesn't exist once already on /pos (e.g. after a reload), and
  // the sidebar's own "Checkout" entry is a nav link, not a button.
  await page.goto('/pos');
  await page.getByPlaceholder(/search products/i).fill("Haldiram's Aloo Bhujia 200g");
  await page.getByRole('button', { name: /select haldiram's aloo bhujia 200g/i }).click();
  await page
    .getByRole('button', { name: /^process payment$/i })
    .first()
    .click();
}

test.describe('Payment amount keypad', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    await openCaja(500);
    await page.goto('/');
    await loginAs(page, 'cashier');
    await goToCashPayment(page);
  });

  test('is visible by default on the Payment page, not on the cart-building screen', async ({
    page,
  }) => {
    await expect(keypadLocator(page)).toBeVisible();
    // Cash is the default method — "Amount tendered" is the field it feeds.
    await expect(page.getByLabel(/amount tendered/i)).toBeVisible();
  });

  test('pressing digits shifts them into the amount tendered field as cents', async ({ page }) => {
    const keypad = keypadLocator(page);
    await keypad.getByRole('button', { name: '5', exact: true }).click();
    await keypad.getByRole('button', { name: '0', exact: true }).click();
    await expect(page.getByLabel(/amount tendered/i)).toHaveValue('0.50');

    await keypad.getByRole('button', { name: '0', exact: true }).click();
    await keypad.getByRole('button', { name: '0', exact: true }).click();
    await expect(page.getByLabel(/amount tendered/i)).toHaveValue('50.00');
  });

  test('backspace drops the rightmost cent and Clear resets to zero', async ({ page }) => {
    const keypad = keypadLocator(page);
    await keypad.getByRole('button', { name: '1', exact: true }).click();
    await keypad.getByRole('button', { name: '0', exact: true }).click();
    await keypad.getByRole('button', { name: '0', exact: true }).click();
    await expect(page.getByLabel(/amount tendered/i)).toHaveValue('1.00');

    await keypad.getByRole('button', { name: 'Backspace' }).click();
    await expect(page.getByLabel(/amount tendered/i)).toHaveValue('0.10');

    await keypad.getByRole('button', { name: 'Clear' }).click();
    await expect(page.getByLabel(/amount tendered/i)).toHaveValue('0.00');
  });

  test('a quick-tender tap and the keypad share the same amount tendered value', async ({
    page,
  }) => {
    await page.getByTestId('quick-tender-100').click();
    await expect(page.getByLabel(/amount tendered/i)).toHaveValue('100.00');

    // Keypad digit entry continues from that value (digit-shift, not reset).
    await keypadLocator(page).getByRole('button', { name: '5', exact: true }).click();
    await expect(page.getByLabel(/amount tendered/i)).toHaveValue('1000.05');
  });

  test('toggle hides/shows the keypad and the choice survives a reload', async ({ page }) => {
    await expect(keypadLocator(page)).toBeVisible();

    await page.getByTestId('amount-keypad-toggle').click();
    await expect(keypadLocator(page)).toBeHidden();

    await page.reload();
    await goToCashPayment(page);
    await expect(keypadLocator(page)).toBeHidden();

    await page.getByTestId('amount-keypad-toggle').click();
    await expect(keypadLocator(page)).toBeVisible();
  });
});
