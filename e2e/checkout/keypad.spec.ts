import { expect, test, type Page } from '../fixtures';
import { gotoAuthed, loginAs } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import {
  getInventoryQty,
  openCaja,
  resetTestState,
  setInventoryQty,
  setStockToZero,
} from '../helpers/supabase';

/**
 * Task 7 (settings-guard-keypad-lockfix) — the on-screen checkout keypad
 * composed into CheckoutPanel (Task 6 built the pure feature slice in
 * src/features/checkout-keypad; this is its first live integration).
 *
 * Fixture: "Haldiram's Aloo Bhujia 200g" (supabase/seed.sql), barcode
 * 8901030800007. Its base price (currently 55) is read from the cart line at
 * runtime rather than hardcoded, per the task brief, in case a local DB
 * differs from the checked-in seed.
 */
const PRODUCT_NAME = "Haldiram's Aloo Bhujia 200g";
const PRODUCT_BARCODE = '8901030800007';

function keypadLocator(page: Page) {
  return page.getByTestId('checkout-keypad');
}

async function pressDigits(page: Page, digits: string) {
  const keypad = keypadLocator(page);
  for (const digit of digits) {
    await keypad.getByRole('button', { name: digit, exact: true }).click();
  }
}

/** Parses the first "$1,234.56"-style amount out of a string of rendered text. */
function parseMoney(text: string): number {
  const match = /\$([\d,]+\.\d{2})/.exec(text);
  if (!match) throw new Error(`Could not parse a money amount out of: ${text}`);
  return Number(match[1].replace(/,/g, ''));
}

test.describe('Checkout keypad', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    await openCaja(500);
    await loginAs(page, 'admin');
    await gotoAuthed(page, '/pos');
    await expect(
      page.getByRole('button', { name: new RegExp(`select ${PRODUCT_NAME}`, 'i') })
    ).toBeVisible();
  });

  test('arms a ×N multiplier that repeats the next tile-tap add', async ({ page }) => {
    const keypad = keypadLocator(page);

    await keypad.getByRole('button', { name: '3', exact: true }).click();
    await keypad.getByRole('button', { name: /qty/i }).click();
    await expect(page.getByTestId('keypad-multiplier')).toHaveText('×3');

    await page.getByPlaceholder(/search products/i).fill(PRODUCT_NAME);
    await page.getByRole('button', { name: new RegExp(`select ${PRODUCT_NAME}`, 'i') }).click();

    const cartLine = page.getByTestId('cart-line').filter({ hasText: PRODUCT_NAME });
    await expect(cartLine).toBeVisible();
    await expect(cartLine).toContainText(/×\s*3\b/);

    const unitPrice = parseMoney(await cartLine.innerText());
    const total = parseMoney(await page.getByTestId('cart-total').innerText());
    expect(total).toBeCloseTo(unitPrice * 3, 2);

    // The multiplier is consumed by the add — no badge left armed for
    // whatever gets tapped next.
    await expect(page.getByTestId('keypad-multiplier')).toHaveCount(0);
  });

  test('PLU: typing a known barcode and pressing Add adds one unit', async ({ page }) => {
    await pressDigits(page, PRODUCT_BARCODE);
    await keypadLocator(page)
      .getByRole('button', { name: /plu/i })
      .click();

    const cartLine = page.getByTestId('cart-line').filter({ hasText: PRODUCT_NAME });
    await expect(cartLine).toBeVisible();
    await expect(cartLine).toContainText(/×\s*1\b/);
  });

  test('PLU: a zero-stock hit shows the same risky-add confirm as a tile tap, and the multiplier still applies once confirmed', async ({
    page,
  }) => {
    const quantityBefore = await getInventoryQty(PRODUCT_NAME);
    try {
      await setStockToZero(PRODUCT_NAME);
      // The client already cached the products query (from beforeEach's
      // gotoAuthed) with the pre-zero quantityOnHand — reload so the
      // keypad's risk-flag check sees the fresh stock level, mirroring how
      // e2e/errors/error-scenarios-and-validation.spec.ts's ER6 does a fresh
      // navigation after the same setStockToZero call.
      await page.reload();
      await expect(
        page.getByRole('button', { name: new RegExp(`select ${PRODUCT_NAME}`, 'i') })
      ).toBeVisible();

      const keypad = keypadLocator(page);
      await keypad.getByRole('button', { name: '2', exact: true }).click();
      await keypad.getByRole('button', { name: /qty/i }).click();
      await expect(page.getByTestId('keypad-multiplier')).toHaveText('×2');

      await pressDigits(page, PRODUCT_BARCODE);
      await keypad.getByRole('button', { name: /plu/i }).click();

      // Same toast ProductGrid's own tile-tap risky-add gate shows
      // (getProductRiskFlag/useConfirmRiskyAdd) — not added yet.
      const riskToast = page.getByText(/only 0 left of haldiram's aloo bhujia 200g/i);
      await expect(riskToast).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId('cart-line')).toHaveCount(0);

      await page.getByRole('button', { name: /^add anyway$/i }).click();

      const cartLine = page.getByTestId('cart-line').filter({ hasText: PRODUCT_NAME });
      await expect(cartLine).toBeVisible();
      await expect(cartLine).toContainText(/×\s*2\b/);
    } finally {
      await setInventoryQty(PRODUCT_NAME, quantityBefore);
    }
  });

  test('PLU: an unrecognized code falls back to search instead of adding to the cart', async ({
    page,
  }) => {
    const unknownCode = '9876543210';
    await pressDigits(page, unknownCode);
    await keypadLocator(page)
      .getByRole('button', { name: /plu/i })
      .click();

    await expect(page.locator('[data-sonner-toast]')).toBeVisible();
    await expect(page.getByPlaceholder(/search products/i)).toHaveValue(unknownCode);
    await expect(page.getByTestId('cart-line')).toHaveCount(0);
  });

  test('toggle hides/shows the keypad and the choice survives a reload; the cart stays the only aside', async ({
    page,
  }) => {
    await expect(keypadLocator(page)).toBeVisible();
    await expect(page.locator('aside')).toHaveCount(1);

    await page.getByTestId('keypad-toggle').click();
    await expect(keypadLocator(page)).toBeHidden();
    await expect(page.locator('aside')).toHaveCount(1);

    await page.reload();
    await expect(
      page.getByRole('button', { name: new RegExp(`select ${PRODUCT_NAME}`, 'i') })
    ).toBeVisible();
    await expect(keypadLocator(page)).toBeHidden();

    await page.getByTestId('keypad-toggle').click();
    await expect(keypadLocator(page)).toBeVisible();
    await expect(page.locator('aside')).toHaveCount(1);
  });
});
