import { expect, test, type Page } from '../fixtures';
import { gotoAuthed, loginAs } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import {
  getInventoryQty,
  getServiceClient,
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

// Same fixture name/shape e2e/inventory/loose-weight-hold-sale.spec.ts uses
// for its own "always-present, freely toggleable" weighted product —
// playwright.config.ts runs this suite with workers: 1 / fullyParallel:
// false, so reusing the same name across spec files never races.
// resetTestState() (this file's own beforeEach) blanket-resets
// sold_by_weight=false on every product for test isolation, so the flag is
// set back to true here, in the one test that needs it, not in beforeEach.
const WEIGHTED_PRODUCT_NAME = 'E2E Loose Weight A';
const WEIGHTED_PRICE_PER_KG = 10;

async function ensureWeightedFixture(): Promise<void> {
  const admin = getServiceClient();
  const { data: existing } = await admin
    .from('products')
    .select('id')
    .eq('name', WEIGHTED_PRODUCT_NAME)
    .maybeSingle();

  let productId: string;
  if (existing) {
    productId = existing.id as string;
  } else {
    const { data: anyCategory } = await admin.from('categories').select('id').limit(1).maybeSingle();
    if (!anyCategory) {
      throw new Error('ensureWeightedFixture: no category found to attach the fixture to');
    }
    const { data: created } = await admin
      .from('products')
      .insert({
        name: WEIGHTED_PRODUCT_NAME,
        category_id: anyCategory.id as string,
        base_price: WEIGHTED_PRICE_PER_KG,
      })
      .select('id')
      .maybeSingle();
    if (!created) throw new Error('ensureWeightedFixture: product create failed');
    productId = created.id as string;
  }

  const { error: updateError } = await admin
    .from('products')
    .update({ base_price: WEIGHTED_PRICE_PER_KG, sold_by_weight: true, is_active: true })
    .eq('id', productId);
  if (updateError) throw new Error(`ensureWeightedFixture: product update failed - ${updateError.message}`);

  const { data: existingInventory } = await admin
    .from('inventory')
    .select('id')
    .eq('product_id', productId)
    .maybeSingle();
  if (existingInventory) {
    await admin
      .from('inventory')
      .update({ quantity_on_hand: 10_000 })
      .eq('id', existingInventory.id as string);
  } else {
    const { error } = await admin
      .from('inventory')
      .insert({ product_id: productId, quantity_on_hand: 10_000, low_stock_threshold: 10 });
    if (error) throw new Error(`ensureWeightedFixture: inventory create failed - ${error.message}`);
  }
}

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

  test('selecting a weighted product via the tile disarms an armed multiplier instead of applying it', async ({
    page,
  }) => {
    await ensureWeightedFixture();
    await page.reload();
    await expect(
      page.getByRole('button', { name: new RegExp(`select ${WEIGHTED_PRODUCT_NAME}`, 'i') })
    ).toBeVisible();

    const keypad = keypadLocator(page);
    await keypad.getByRole('button', { name: '3', exact: true }).click();
    await keypad.getByRole('button', { name: /qty/i }).click();
    await expect(page.getByTestId('keypad-multiplier')).toHaveText('×3');

    await page.getByPlaceholder(/search products/i).fill(WEIGHTED_PRODUCT_NAME);
    await page
      .getByRole('button', { name: new RegExp(`select ${WEIGHTED_PRODUCT_NAME}`, 'i') })
      .click();

    // WeightEntryDialog opens with its own numeric keypad (0-9, '.') — must
    // scope to the dialog, since CheckoutKeypad's identically-labelled
    // digit buttons are still in the DOM behind it (merely disabled, not
    // unmounted), and an unscoped getByRole would match both.
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '0', exact: true }).click();
    await dialog.getByRole('button', { name: '.', exact: true }).click();
    await dialog.getByRole('button', { name: '5', exact: true }).click();
    await dialog.getByRole('button', { name: /add to cart/i }).click();

    // The weightEntry.isOpen effect in CheckoutPanel disarms the multiplier
    // the moment the weight dialog opens — badge is gone, and the multiplier
    // was never applied to this (or any) add.
    await expect(page.getByTestId('keypad-multiplier')).toHaveCount(0);

    const cartLine = page.getByTestId('cart-line').filter({ hasText: WEIGHTED_PRODUCT_NAME });
    await expect(cartLine).toBeVisible();
    await expect(cartLine).not.toContainText(/×\s*3\b/);
    await expect(cartLine).toContainText('0.500');

    const expectedPrice = Math.round(WEIGHTED_PRICE_PER_KG * 0.5 * 100) / 100;
    const total = parseMoney(await page.getByTestId('cart-total').innerText());
    expect(total).toBeCloseTo(expectedPrice, 2);
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
