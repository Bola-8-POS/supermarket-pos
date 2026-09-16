import { expect, test } from '../fixtures';
import { loginAs, staffForRole } from '../../helpers/auth';
import { requireIntegrationEnv } from '../../helpers/requireEnv';
import { getServiceClient, resetTestState } from '../../helpers/supabase';
import { currentTutorialLocale, seedStaffLocale } from '../locale';

/**
 * Phase 34: promotions domain tutorial video. `manage_promotions` is
 * admin-only, so every scenario logs in as 'admin'. Selectors that aren't
 * already covered by ../i18n-selectors.ts are built here as dual-locale
 * (es-MX/en-US) regexes, sourced from src/shared/lib/i18n/locales/*\/wAdmin.json
 * and pages.json — never copied verbatim from an English-only reference spec.
 * Run with: npm run tutorial-videos:record -- e2e/tutorials/promotions
 */

const PROMOTIONS_TILE_RE = /^(promotions|promociones)$/i;
/** pages.json promotions.newPromotion / promotionFormDialog.createTitle */
const NEW_PROMOTION_RE = /^(new promotion|nueva promoción)$/i;
/** promotionFormDialog.nameLabel */
const NAME_LABEL_RE = /^(name|nombre)/i;
/** promotionFormDialog.discountPercentLabel */
const DISCOUNT_PERCENT_LABEL_RE = /discount percent|porcentaje de descuento/i;
/** promotionsListPanel.scopeStoreWide / scope.storeWideLabel */
const STORE_WIDE_RE = /store-wide|toda la tienda/i;
/** promotionFormDialog.scope.pickerPlaceholder */
const SELECT_PRODUCTS_OR_CATEGORIES_RE =
  /select products or categories|selecciona productos o categorías/i;
/** promotionFormDialog.scope.searchPlaceholder */
const SEARCH_PRODUCTS_OR_CATEGORIES_PLACEHOLDER_RE =
  /search products or categories|buscar productos o categorías/i;
/** promotionFormDialog.createPromotion */
const CREATE_PROMOTION_RE = /create promotion|crear promoción/i;
/** comboPricingSection cheapest_free option label */
const CHEAPEST_FREE_RE = /cheapest free|el más barato gratis/i;

const PERCENT_PROMO_NAME = 'E2E Tutorial 15% off Snacks';
const COMBO_PROMO_NAME = 'E2E Tutorial 3x2 Snacks';

test.describe('Tutorial: promotions', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    const { name } = staffForRole('admin');
    await seedStaffLocale(name, currentTutorialLocale());
    await page.goto('/');
    await loginAs(page, 'admin');
  });

  test.afterEach(async () => {
    const admin = getServiceClient();
    await admin.from('promotions').delete().in('name', [PERCENT_PROMO_NAME, COMBO_PROMO_NAME]);
  });

  test('admin creates a percent-off promotion scoped to a category', async ({ page, narrate }) => {
    await narrate(page, 'Open Promotions', async () => {
      await page.getByRole('button', { name: PROMOTIONS_TILE_RE }).click();
      await expect(page).toHaveURL(/\/promotions$/);
    });

    await narrate(page, 'Start a new promotion', async () => {
      await page.getByRole('button', { name: NEW_PROMOTION_RE }).first().click();
    });

    const dialog = page.getByRole('dialog', { name: NEW_PROMOTION_RE });
    await expect(dialog).toBeVisible();

    await narrate(page, 'Name the promotion and set a 15% discount', async () => {
      await dialog.getByLabel(NAME_LABEL_RE).fill(PERCENT_PROMO_NAME);
      await dialog.getByLabel(DISCOUNT_PERCENT_LABEL_RE).fill('15');
    });

    await narrate(page, 'Scope the promotion to the Snacks category', async () => {
      await dialog.getByRole('checkbox', { name: STORE_WIDE_RE }).uncheck();
      await dialog.getByRole('button', { name: SELECT_PRODUCTS_OR_CATEGORIES_RE }).click();
      await page.getByPlaceholder(SEARCH_PRODUCTS_OR_CATEGORIES_PLACEHOLDER_RE).fill('Snacks');
      await page.getByRole('option', { name: 'Snacks', exact: true }).click();
      await page.keyboard.press('Escape');
    });

    await narrate(page, 'Save the promotion', async () => {
      await dialog.getByRole('button', { name: CREATE_PROMOTION_RE }).click();
      await expect(dialog).toBeHidden();
    });

    await narrate(page, 'The new promotion appears on the list', async () => {
      await page.getByPlaceholder(/search/i).fill(PERCENT_PROMO_NAME);
      await expect(
        page.getByRole('row', { name: new RegExp(PERCENT_PROMO_NAME, 'i') })
      ).toBeVisible();
    });
  });

  test('admin builds a 3x2 combo promotion', async ({ page, narrate }) => {
    await narrate(page, 'Open Promotions', async () => {
      await page.getByRole('button', { name: PROMOTIONS_TILE_RE }).click();
      await expect(page).toHaveURL(/\/promotions$/);
    });

    await narrate(page, 'Start a new combo promotion', async () => {
      await page.getByRole('button', { name: NEW_PROMOTION_RE }).first().click();
    });

    const dialog = page.getByRole('dialog', { name: NEW_PROMOTION_RE });
    await expect(dialog).toBeVisible();

    await narrate(page, 'Switch to a Combo promotion', async () => {
      await dialog.getByTestId('promotion-kind-combo').click();
      await dialog.getByLabel(NAME_LABEL_RE).fill(COMBO_PROMO_NAME);
    });

    await narrate(page, 'Build a 3-unit combo slot scoped to Snacks', async () => {
      await dialog.getByTestId('combo-slot-qty-0').fill('3');
      await dialog.getByRole('button', { name: SELECT_PRODUCTS_OR_CATEGORIES_RE }).click();
      await page.getByPlaceholder(SEARCH_PRODUCTS_OR_CATEGORIES_PLACEHOLDER_RE).fill('Snacks');
      await page.getByRole('option', { name: 'Snacks', exact: true }).click();
      await page.keyboard.press('Escape');
    });

    await narrate(page, 'Set cheapest-item-free pricing', async () => {
      await dialog.getByTestId('combo-pricing-type').click();
      await page.getByRole('option', { name: CHEAPEST_FREE_RE }).click();
      await dialog.getByTestId('combo-pricing-value').fill('1');
    });

    await narrate(page, 'Save the combo', async () => {
      await dialog.getByRole('button', { name: CREATE_PROMOTION_RE }).click();
      await expect(dialog).toBeHidden();
    });

    await narrate(page, 'The combo appears on the promotions list', async () => {
      await page.getByPlaceholder(/search/i).fill(COMBO_PROMO_NAME);
      const row = page.getByRole('row', { name: new RegExp(COMBO_PROMO_NAME, 'i') });
      await expect(row).toBeVisible();
      await expect(row.getByText(/combo · 1 (slot\(s\)|espacio\(s\))/i)).toBeVisible();
    });
  });
});
