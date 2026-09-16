import type { Page } from '@playwright/test';
import { loginAs, logout, staffForRole } from '../../helpers/auth';
import { requireIntegrationEnv } from '../../helpers/requireEnv';
import { openCaja, resetTestState } from '../../helpers/supabase';
import { expect, test } from '../fixtures';
import {
  AMOUNT_TENDERED_RE,
  CHECKOUT_TILE_RE,
  DONE_RE,
  PROCESS_PAYMENT_RE,
  SEARCH_PRODUCTS_PLACEHOLDER_RE,
  selectProductRe,
} from '../i18n-selectors';
import { currentTutorialLocale, seedStaffLocale } from '../locale';

/**
 * Phase 34 domain video: reports. Reuses the 34-01 harness unmodified — see
 * ../checkout/checkout.spec.ts for the reference shape.
 *
 * RESEARCH.md Pitfall 3: Reports needs its own visible history. beforeEach
 * creates a real checkout, closes the caja, THEN logs back in as admin for
 * the narrated portion — mirroring e2e/reports/report-tabs.spec.ts's fixture
 * shape without driving the checkout UI through a narrate() wrapper (setup,
 * not recorded content).
 */

const ALOO_BHUJIA = "Haldiram's Aloo Bhujia 200g";

const CLOSE_CAJA_RE = /^(close caja|cerrar caja)$/i;
const CLOSING_CASH_COUNT_RE = /^(closing cash count|conteo de cierre de caja)$/i;
const CAJA_CLOSED_SUCCESS_RE = /caja closed successfully|caja cerrada correctamente/i;
const CLOSE_SUMMARY_DISMISS_RE = /^(close|cerrar)$/i;

const DAILY_CAJA_REPORT_RE = /^(daily caja report|reporte diario de caja)$/i;
const PRODUCT_SALES_TAB_RE = /^(product sales|ventas de productos)$/i;
const PAYMENT_METHODS_TAB_RE = /^(payment methods|métodos de pago)$/i;
const TOTAL_REVENUE_RE = /total revenue|ingresos totales/i;
const CASH_RECONCILIATION_RE = /^(cash reconciliation|conciliación de efectivo)$/i;
const TOP_10_PRODUCTS_RE = /^(top 10 products|top 10 productos)$/i;
const EXPORT_BTN_RE = /^(export|exportar)$/i;
const CSV_MENU_ITEM_RE = /^csv$/i;
const EXPORT_SUCCESS_RE = /report exported successfully|reporte exportado correctamente/i;

/** Injects a fake `__TAURI_INTERNALS__` so CSV export (save + write_file)
 * resolves without a real Tauri runtime — mirrors e2e/reports/export.spec.ts. */
async function injectTauriMocks(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'] = {
      invoke(cmd: string): Promise<unknown> {
        if (cmd === 'plugin:dialog|save') {
          return Promise.resolve('/tmp/e2e-tutorial-reports-export.csv');
        }
        if (cmd === 'plugin:fs|write_file') {
          return Promise.resolve(null);
        }
        return Promise.resolve(null);
      },
      transformCallback(callback: (arg: unknown) => void, _once: boolean): number {
        const id = Math.floor(Math.random() * 1_000_000);
        (window as unknown as Record<string, unknown>)[`_${String(id)}`] = callback;
        return id;
      },
      unregisterCallback(id: number): void {
        Reflect.deleteProperty(window as unknown as Record<string, unknown>, `_${String(id)}`);
      },
    };
  });
}

test.describe('Tutorial: reports', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    await seedStaffLocale(staffForRole('cashier').name, currentTutorialLocale());
    await seedStaffLocale(staffForRole('manager').name, currentTutorialLocale());
    await seedStaffLocale(staffForRole('admin').name, currentTutorialLocale());
    await openCaja(500);
    await page.goto('/');

    // Unnarrated setup: a real completed sale, then a closed caja session, so
    // the narrated admin walkthrough below has real history to review.
    await loginAs(page, 'cashier');
    await page.getByRole('button', { name: CHECKOUT_TILE_RE }).click();
    await expect(page).toHaveURL(/\/pos$/);
    await page.getByPlaceholder(SEARCH_PRODUCTS_PLACEHOLDER_RE).fill(ALOO_BHUJIA);
    await page.getByRole('button', { name: selectProductRe(ALOO_BHUJIA) }).click();
    await page.getByRole('button', { name: PROCESS_PAYMENT_RE }).first().click();
    await page.getByLabel(AMOUNT_TENDERED_RE).fill('100');
    await page.getByRole('button', { name: PROCESS_PAYMENT_RE }).last().click();
    await expect(page.getByRole('button', { name: DONE_RE })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: DONE_RE }).click();
    await logout(page);

    await loginAs(page, 'manager');
    await page.goto('/staff');
    await page.getByRole('button', { name: CLOSE_CAJA_RE }).click();
    const closeDlg = page.getByRole('dialog', { name: CLOSE_CAJA_RE });
    await expect(closeDlg).toBeVisible({ timeout: 10_000 });
    await closeDlg.getByLabel(CLOSING_CASH_COUNT_RE).fill('600');
    await closeDlg.getByRole('button', { name: CLOSE_CAJA_RE }).click();
    await expect(page.getByText(CAJA_CLOSED_SUCCESS_RE)).toBeVisible({ timeout: 30_000 });
    const closeSummary = page.getByTestId('caja-close-summary');
    await expect(closeSummary).toBeVisible({ timeout: 10_000 });
    await closeSummary.getByRole('button', { name: CLOSE_SUMMARY_DISMISS_RE }).first().click();
    await logout(page);
  });

  test("admin reviews a closed session's revenue and product sales", async ({ page, narrate }) => {
    await loginAs(page, 'admin');

    await narrate(page, 'Open the daily caja report', async () => {
      await page.goto('/reports');
      await expect(page.getByRole('heading', { name: DAILY_CAJA_REPORT_RE })).toBeVisible({
        timeout: 20_000,
      });
    });

    await narrate(page, 'Pick the session that was just closed', async () => {
      const sel = page.locator('#caja-selector');
      await expect(sel).toBeVisible({ timeout: 20_000 });
      const val = await sel.locator('option').nth(0).getAttribute('value');
      if (val) await sel.selectOption(val);
      await expect(page.getByText(TOTAL_REVENUE_RE)).toBeVisible({ timeout: 30_000 });
    });

    await narrate(page, 'Review revenue and cash reconciliation', async () => {
      await expect(page.getByRole('heading', { name: CASH_RECONCILIATION_RE })).toBeVisible();
      await expect(page.getByRole('heading', { name: TOP_10_PRODUCTS_RE })).toBeVisible();
    });

    await narrate(page, 'Switch to Product Sales for a per-product breakdown', async () => {
      await page.getByRole('tab', { name: PRODUCT_SALES_TAB_RE }).click();
      await expect(page.getByRole('tabpanel', { name: PRODUCT_SALES_TAB_RE })).toBeVisible({
        timeout: 20_000,
      });
    });
  });

  test('admin exports a report to CSV', async ({ page, narrate }) => {
    await injectTauriMocks(page);
    await loginAs(page, 'admin');

    await narrate(page, 'Open the Payment Methods report', async () => {
      await page.goto('/reports');
      await expect(page.getByRole('heading', { name: DAILY_CAJA_REPORT_RE })).toBeVisible({
        timeout: 20_000,
      });
      await page.getByRole('tab', { name: PAYMENT_METHODS_TAB_RE }).click();
      const tabPanel = page.getByRole('tabpanel');
      await expect(tabPanel).toBeVisible({ timeout: 20_000 });
    });

    await narrate(page, 'Export the report as CSV', async () => {
      const tabPanel = page.getByRole('tabpanel');
      const exportBtn = tabPanel.getByRole('button', { name: EXPORT_BTN_RE });
      await expect(exportBtn).toBeVisible({ timeout: 20_000 });
      await exportBtn.click();
      const csvItem = page.getByRole('menuitem', { name: CSV_MENU_ITEM_RE });
      await expect(csvItem).toBeVisible({ timeout: 5_000 });
      await csvItem.click();
    });

    await narrate(page, 'The export completes and saves the file', async () => {
      await expect(page.getByText(EXPORT_SUCCESS_RE)).toBeVisible({ timeout: 20_000 });
    });
  });
});
