import { expect, test } from '../fixtures';
import { gotoAuthed, loginAs, staffForRole } from '../../helpers/auth';
import { requireIntegrationEnv } from '../../helpers/requireEnv';
import { resetTestState, setInventoryExpiryDaysFromNow } from '../../helpers/supabase';
import { currentTutorialLocale, seedStaffLocale } from '../locale';

/**
 * Phase 34 Plan 02: inventory domain tutorial. Manager adjusts stock with a
 * required reason, then a near-expiry alert is shown flagging a product
 * whose expiry date falls inside the configured threshold window.
 */

const NEAR_EXPIRY_PRODUCT = "Haldiram's Aloo Bhujia 200g";

// Dual-locale (es-MX/en-US) selectors — built inline per 34-01's
// RESEARCH.md/PLAN.md guidance, since these strings are specific to the
// inventory domain and not shared cross-domain via i18n-selectors.ts.
const INVENTORY_HEADING_RE = /^(inventory|inventario)$/i;
const ADJUST_BTN_RE = /^(adjust|ajustar)$/i;
const QUANTITY_DELTA_LABEL_RE = /^(quantity delta|delta de cantidad)$/i;
const REASON_LABEL_RE = /^(reason|motivo)$/i;
const APPLY_BTN_RE = /^(apply|aplicar)$/i;
const STOCK_UPDATED_RE = /(stock updated|existencia actualizada)/i;
const NEAR_EXPIRY_TAB_RE = /^(near expiry|próxima caducidad)$/i;

test.describe('Tutorial: inventory', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    const { name } = staffForRole('manager');
    await seedStaffLocale(name, currentTutorialLocale());
    await loginAs(page, 'manager');
  });

  test('manager navigates the inventory hub and adjusts stock with a reason', async ({
    page,
    narrate,
  }) => {
    await narrate(page, 'Open the inventory hub', async () => {
      await gotoAuthed(page, '/inventory');
      await expect(page.getByRole('heading', { name: INVENTORY_HEADING_RE })).toBeVisible({
        timeout: 15_000,
      });
    });

    await narrate(page, 'Open the stock adjustment dialog', async () => {
      await page.getByRole('button', { name: ADJUST_BTN_RE }).first().click();
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 });
    });

    const dialog = page.getByRole('dialog');

    await narrate(page, 'Select a product and record a delivery of 5 units', async () => {
      await page.locator('#batch-product').selectOption({ index: 1 });
      await dialog.getByLabel(QUANTITY_DELTA_LABEL_RE).fill('5');
      await dialog.getByLabel(REASON_LABEL_RE).selectOption('delivery');
    });

    await narrate(page, 'Apply the adjustment with its reason', async () => {
      await dialog.getByRole('button', { name: APPLY_BTN_RE }).click();
      await expect(page.getByText(STOCK_UPDATED_RE)).toBeVisible({ timeout: 15_000 });
    });
  });

  test('a product nearing its expiry threshold is flagged', async ({ page, narrate }) => {
    // Default near-expiry threshold is 14 days (useNearExpiryAlerts) — 5 days
    // out is comfortably inside the window without depending on the store's
    // configured value.
    await setInventoryExpiryDaysFromNow(NEAR_EXPIRY_PRODUCT, 5);

    await narrate(page, 'Open the inventory hub', async () => {
      await gotoAuthed(page, '/inventory');
      await expect(page.getByRole('heading', { name: INVENTORY_HEADING_RE })).toBeVisible({
        timeout: 15_000,
      });
    });

    await narrate(page, 'Open the Near Expiry tab', async () => {
      await page.getByRole('tab', { name: NEAR_EXPIRY_TAB_RE }).click();
    });

    await narrate(page, 'The flagged product appears with its days remaining', async () => {
      await expect(page.getByText(NEAR_EXPIRY_PRODUCT)).toBeVisible({ timeout: 15_000 });
    });
  });
});
