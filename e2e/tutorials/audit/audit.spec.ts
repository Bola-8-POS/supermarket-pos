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
 * Phase 34, Plan 05: audit domain tutorial. Follows the standard
 * DB-seeded-locale pattern from 34-01/34-02/34-03/34-04 (unlike settings.spec.ts,
 * this domain's own content is not the locale switch itself).
 */

const ALOO_BHUJIA = "Haldiram's Aloo Bhujia 200g";

// This domain's cross-domain strings ('checkout tile', 'process payment', ...)
// come from ../i18n-selectors; these two are unique to /audit so they're
// built here from src/shared/lib/i18n/locales/{es-MX,en-US}/{pages,wAdmin,common}.json
// (34-RESEARCH.md LOCALE SAFETY note).
const AUDIT_LOG_HEADING_RE = /^(audit log|registro de auditoría)$/i;
/** wAdmin.json auditLogFilterBar.dateFrom */
const DATE_FROM_LABEL_RE = /^(date from|fecha desde)$/i;
/** wAdmin.json auditLogFilterBar.applyFilters */
const APPLY_FILTERS_RE = /^(apply filters|aplicar filtros)$/i;
/** wAdmin.json auditLogTable.noMatchesTitle */
const NO_MATCHES_RE = /no matches|sin coincidencias/i;
/** common.json before/after (JsonDiffViewer headers) */
const BEFORE_RE = /before|antes/i;
const AFTER_RE = /after|después/i;

test.describe('Tutorial: audit', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    const { name: cashierName } = staffForRole('cashier');
    const { name: adminName } = staffForRole('admin');
    await seedStaffLocale(cashierName, currentTutorialLocale());
    await seedStaffLocale(adminName, currentTutorialLocale());
    await openCaja(500);

    // Unnarrated setup: the audit table is empty on a freshly reset DB, so
    // the narrated portion below needs a real payment.process row to click
    // into (34-RESEARCH.md Pitfall 3). Reuses the cash-sale steps from
    // e2e/tutorials/checkout/checkout.spec.ts Test 1, then logs back in as
    // admin -- /audit is admin-gated.
    await page.goto('/');
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

    await page.goto('/');
    await loginAs(page, 'admin');
  });

  test('admin reviews the audit log and opens a diff sheet', async ({ page, narrate }) => {
    test.setTimeout(90_000);

    await narrate(page, 'Open the audit log', async () => {
      await page.goto('/audit');
      await expect(page.getByRole('heading', { name: AUDIT_LOG_HEADING_RE })).toBeVisible({
        timeout: 15_000,
      });
    });

    const paymentProcessCell = page.getByRole('cell', { name: 'payment.process' }).first();

    await narrate(page, 'Find the sale we just processed', async () => {
      await expect(paymentProcessCell).toBeVisible({ timeout: 15_000 });
    });

    const sheet = page.getByRole('dialog', { name: 'payment.process' });

    await narrate(page, 'Open the diff sheet to see what changed', async () => {
      await paymentProcessCell.click();
      await expect(sheet).toBeVisible({ timeout: 5_000 });
      await expect(sheet.getByText(BEFORE_RE).first()).toBeVisible();
      await expect(sheet.getByText(AFTER_RE).first()).toBeVisible();
    });

    await narrate(page, 'Close the diff sheet', async () => {
      await page.keyboard.press('Escape');
      await expect(sheet).not.toBeVisible({ timeout: 5_000 });
    });
  });

  test('admin narrows results with a date-range filter', async ({ page, narrate }) => {
    test.setTimeout(60_000);

    await narrate(page, 'Open the audit log', async () => {
      await page.goto('/audit');
      await expect(page.getByRole('heading', { name: AUDIT_LOG_HEADING_RE })).toBeVisible({
        timeout: 15_000,
      });
    });

    await narrate(page, 'Narrow results with a date-range filter', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const isoTomorrow = tomorrow.toISOString().slice(0, 10);

      const dateFromInput = page.getByLabel(DATE_FROM_LABEL_RE);
      await expect(dateFromInput).toBeVisible({ timeout: 5_000 });
      await dateFromInput.fill(isoTomorrow);
      await page.getByRole('button', { name: APPLY_FILTERS_RE }).click();
    });

    await narrate(page, 'No entries match a future date', async () => {
      await expect(page.getByText(NO_MATCHES_RE)).toBeVisible({ timeout: 10_000 });
    });
  });
});
