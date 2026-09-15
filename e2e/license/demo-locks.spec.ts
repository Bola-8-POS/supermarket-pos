/**
 * Hermetic license e2e — feature-entitlement gating under an active demo license
 * (`features: ['promotions', 'purchase_orders']`, everything else locked). Runs against
 * the `gate` project. See playwright.license.config.ts / e2e/helpers/license-e2e.ts.
 */
import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '../fixtures';
import { loginAs } from '../helpers/auth';
import { CONTINUE_DEMO_RE, seedLicense } from '../helpers/license-e2e';
import { demoToken } from '../helpers/license-tokens';

async function setUpDemo(page: Page): Promise<void> {
  const terminalId = randomUUID();
  const token = demoToken(terminalId);
  await seedLicense(page, terminalId, token);
  await page.route('**/__license/functions/v1/heartbeat', r => r.fulfill({ json: { token } }));
  await loginAs(page, 'admin');
}

test('reports export is locked, upgrade dialog opens and closes via Continue the demo', async ({
  page,
}) => {
  await setUpDemo(page);
  await page.goto('/reports');

  const locked = page.locator('[data-testid="locked-feature"][data-feature="report_export"]');
  await expect(locked).toBeVisible();
  await locked.click();

  const dialog = page.getByTestId('upgrade-dialog');
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId('upgrade-feature-line')).toBeVisible();
  await dialog.getByRole('button', { name: CONTINUE_DEMO_RE }).click();
  await expect(dialog).toBeHidden();
});

test('audit page is replaced by the locked-feature placeholder with a sidebar lock icon', async ({
  page,
}) => {
  await setUpDemo(page);
  await page.goto('/audit');

  await expect(page.getByTestId('feature-locked-page')).toHaveAttribute('data-feature', 'audit_log');
  // Multiple nav items can be entitlement-locked on this demo (audit_log, edit_history, …) —
  // this assertion only needs one lock icon in the sidebar, not specifically Audit's.
  await expect(page.getByTestId('nav-feature-lock-icon').first()).toBeVisible();
});

test('promotions is entitled on the demo plan — no locked-feature controls render', async ({
  page,
}) => {
  await setUpDemo(page);
  await page.goto('/promotions');

  await expect(page.getByTestId('locked-feature')).toHaveCount(0);
});

test('settings license tab shows demo status and a get-full-version CTA', async ({ page }) => {
  await setUpDemo(page);
  await page.goto('/settings');

  await page.getByRole('tab', { name: /licen/i }).click();
  await expect(page.getByTestId('license-status')).toBeVisible();
  await expect(page.getByTestId('license-get-full')).toBeVisible();
});

test('rbac permission toggle is locked — a real click opens the upgrade dialog', async ({
  page,
}) => {
  await setUpDemo(page);
  await page.goto('/rbac');

  const lockedToggle = page
    .locator('[data-testid="locked-feature"][data-feature="rbac_editing"]')
    .first();
  await expect(lockedToggle).toBeVisible();
  await lockedToggle.click();

  await expect(page.getByTestId('upgrade-dialog')).toBeVisible();
});

test('staff creation is locked — a real click on the create button opens the upgrade dialog', async ({
  page,
}) => {
  await setUpDemo(page);
  await page.goto('/staff');

  await page.getByRole('button', { name: /add staff|agregar personal|añadir personal/i }).click();
  const lockedCreate = page
    .locator('[data-testid="locked-feature"][data-feature="staff_management"]')
    .first();
  await expect(lockedCreate).toBeVisible();
  await lockedCreate.click();

  await expect(page.getByTestId('upgrade-dialog')).toBeVisible();
});
