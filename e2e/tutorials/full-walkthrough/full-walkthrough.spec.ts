import { enterPin, loginAs, logout, staffForRole } from '../../helpers/auth';
import { requireIntegrationEnv } from '../../helpers/requireEnv';
import { resetTestState } from '../../helpers/supabase';
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
 * Phase 34 Plan 06: the single long full end-to-end business-day video
 * (VIDEO-03). ONE continuous test, not multiple test() blocks. Every step
 * sequence below is copied verbatim from the cited domain spec that already
 * proved it (caja.spec.ts 34-03, checkout.spec.ts 34-01, payments.spec.ts
 * 34-02, reports.spec.ts 34-03) — no new selectors invented here.
 */

const ALOO_BHUJIA = "Haldiram's Aloo Bhujia 200g";

// --- caja.spec.ts (34-03) selectors, copied verbatim ---
const OPEN_CAJA_RE = /^(open caja|abrir caja)$/i;
const CLOSE_CAJA_RE = /^(close caja|cerrar caja)$/i;
const OPENING_CASH_FIELD_RE = /^(opening cash|fondo inicial)$/i;
const CLOSING_CASH_COUNT_RE = /^(closing cash count|conteo de cierre de caja)$/i;
const CAJA_CLOSED_SUCCESS_RE = /caja closed successfully|caja cerrada correctamente/i;
const CLOSE_SUMMARY_DISMISS_RE = /^(close|cerrar)$/i;

// --- payments.spec.ts (34-02) selectors, copied verbatim ---
const MANAGER_ACCESS_REQUIRED_RE = /manager access required|se requiere acceso de gerente/i;
const REFUND_BTN_RE = /^(refund|reembolso)$/i;
const PROCESS_REFUND_TITLE_RE = /^(process refund|procesar reembolso)$/i;
const SELECT_FOR_REFUND_RE = /^(select|seleccionar) .* (for refund|para reembolso)$/i;
const WRONG_ORDER_RE = /(wrong order|pedido equivocado)/i;
const REQUEST_APPROVAL_RE = /^(request approval|solicitar aprobación)$/i;
const REFUND_PROCESSED_RE = /(refund .* processed|reembolso .* procesado)/i;

// --- reports.spec.ts (34-03) selectors, copied verbatim ---
const DAILY_CAJA_REPORT_RE = /^(daily caja report|reporte diario de caja)$/i;
const TOTAL_REVENUE_RE = /total revenue|ingresos totales/i;
const CASH_RECONCILIATION_RE = /^(cash reconciliation|conciliación de efectivo)$/i;
const TOP_10_PRODUCTS_RE = /^(top 10 products|top 10 productos)$/i;

test.describe('Tutorial: full business day walkthrough', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    await page.goto('/');
  });

  test('a full business day: open, sell, refund, report, close', async ({ page, narrate }) => {
    test.setTimeout(300_000);
    const locale = currentTutorialLocale();

    // --- Step 1 (caja.spec.ts): manager opens a caja with a drawer float ---
    await seedStaffLocale(staffForRole('manager').name, locale);
    await loginAs(page, 'manager');

    await narrate(page, 'Open the caja with a starting drawer float', async () => {
      await page.goto('/staff');
      await page.getByRole('button', { name: OPEN_CAJA_RE }).click();
      const openDlg = page.getByRole('dialog', { name: OPEN_CAJA_RE });
      await expect(openDlg).toBeVisible({ timeout: 10_000 });
      await openDlg.getByLabel(OPENING_CASH_FIELD_RE).fill('500');
      await openDlg.getByRole('button', { name: OPEN_CAJA_RE }).click();
      await expect(page.getByRole('button', { name: CLOSE_CAJA_RE })).toBeVisible({
        timeout: 30_000,
      });
    });

    // --- Step 2 (checkout.spec.ts Test 1): cashier completes a cash sale ---
    await logout(page);
    await seedStaffLocale(staffForRole('cashier').name, locale);
    await loginAs(page, 'cashier');

    await narrate(page, 'Open the checkout screen', async () => {
      await page.getByRole('button', { name: CHECKOUT_TILE_RE }).click();
      await expect(page).toHaveURL(/\/pos$/);
    });

    await narrate(page, 'Search for a product and add it to the cart', async () => {
      await page.getByPlaceholder(SEARCH_PRODUCTS_PLACEHOLDER_RE).fill(ALOO_BHUJIA);
      await page.getByRole('button', { name: selectProductRe(ALOO_BHUJIA) }).click();
    });

    await narrate(page, 'Take a cash payment', async () => {
      await page.getByRole('button', { name: PROCESS_PAYMENT_RE }).first().click();
      await page.getByLabel(AMOUNT_TENDERED_RE).fill('100');
    });

    await narrate(page, 'Confirm the payment', async () => {
      await page.getByRole('button', { name: PROCESS_PAYMENT_RE }).last().click();
      await expect(page.getByRole('button', { name: DONE_RE })).toBeVisible({ timeout: 30_000 });
      await page.getByRole('button', { name: DONE_RE }).click();
    });

    // --- Step 3 (payments.spec.ts refund test): manager refunds that sale ---
    await logout(page);
    await seedStaffLocale(staffForRole('manager').name, locale);
    await loginAs(page, 'manager');
    const managerPin = process.env['E2E_MANAGER_PIN'] ?? '';

    const refundDialog = page.getByRole('dialog', { name: PROCESS_REFUND_TITLE_RE });

    await narrate(page, 'Open the payments page and start a refund', async () => {
      await page.goto('/payments');
      await expect(page.getByRole('button', { name: REFUND_BTN_RE }).first()).toBeVisible({
        timeout: 20_000,
      });
      await page.getByRole('button', { name: REFUND_BTN_RE }).first().click();
      await expect(refundDialog).toBeVisible({ timeout: 10_000 });
    });

    await narrate(page, 'Select an item and choose a reason', async () => {
      const checkbox = refundDialog.getByRole('checkbox', { name: SELECT_FOR_REFUND_RE }).first();
      await expect(checkbox).toBeVisible({ timeout: 10_000 });
      await checkbox.check();
      await refundDialog.locator('#refund-reason').click();
      await page.getByRole('option', { name: WRONG_ORDER_RE }).click();
    });

    await narrate(page, 'Request manager approval', async () => {
      await page.getByRole('button', { name: REQUEST_APPROVAL_RE }).click();
      const pinDialog = page.getByRole('alertdialog');
      await expect(pinDialog).toBeVisible({ timeout: 8_000 });
      await expect(pinDialog.getByText(MANAGER_ACCESS_REQUIRED_RE)).toBeVisible();
      await enterPin(page, managerPin);
    });

    await narrate(page, 'Refund processed', async () => {
      await expect(page.getByText(REFUND_PROCESSED_RE)).toBeVisible({ timeout: 15_000 });
    });

    // --- Step 4 (reports.spec.ts revenue-review test): admin reviews Reports ---
    await logout(page);
    await seedStaffLocale(staffForRole('admin').name, locale);
    await loginAs(page, 'admin');

    await narrate(page, 'Open the daily caja report', async () => {
      await page.goto('/reports');
      await expect(page.getByRole('heading', { name: DAILY_CAJA_REPORT_RE })).toBeVisible({
        timeout: 20_000,
      });
    });

    await narrate(page, "Review the day's revenue and cash reconciliation", async () => {
      const sel = page.locator('#caja-selector');
      await expect(sel).toBeVisible({ timeout: 20_000 });
      const val = await sel.locator('option').nth(0).getAttribute('value');
      if (val) await sel.selectOption(val);
      await expect(page.getByText(TOTAL_REVENUE_RE)).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole('heading', { name: CASH_RECONCILIATION_RE })).toBeVisible();
      await expect(page.getByRole('heading', { name: TOP_10_PRODUCTS_RE })).toBeVisible();
    });

    // --- Step 5 (caja.spec.ts): manager closes the caja at end of day ---
    await logout(page);
    await seedStaffLocale(staffForRole('manager').name, locale);
    await loginAs(page, 'manager');

    await narrate(page, 'Close the caja at end of day', async () => {
      await page.goto('/staff');
      await page.getByRole('button', { name: CLOSE_CAJA_RE }).click();
      const closeDlg = page.getByRole('dialog', { name: CLOSE_CAJA_RE });
      await expect(closeDlg).toBeVisible({ timeout: 10_000 });
      await closeDlg.getByLabel(CLOSING_CASH_COUNT_RE).fill('600');
      await closeDlg.getByRole('button', { name: CLOSE_CAJA_RE }).click();
      await expect(page.getByText(CAJA_CLOSED_SUCCESS_RE)).toBeVisible({ timeout: 30_000 });
    });

    await narrate(page, 'Review the end-of-day reconciliation summary', async () => {
      const closeSummary = page.getByTestId('caja-close-summary');
      await expect(closeSummary).toBeVisible({ timeout: 10_000 });
      await closeSummary.getByRole('button', { name: CLOSE_SUMMARY_DISMISS_RE }).first().click();
    });
  });
});
