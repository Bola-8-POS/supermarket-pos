import { expect, test } from '../fixtures';
import { loginAs, logout } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { forceCloseAllOpenTabs, getServiceClient, openCaja, resetTestState, seedOpenTab } from '../helpers/supabase';

// Representative single-barcode packaged good from the Indian catalog
// (scripts/seed-dev-data.ts) — distinct from e2e/checkout/'s primary product
// so this file's fixtures don't have to reason about checkout's state.
const PRODUCT = 'Parle-G Biscuits 200g';

test.describe('Caja session management', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    await page.goto('/');
  });

  test('Manager opens caja', async ({ page }) => {
    await loginAs(page, 'manager');
    await page.goto('/staff');
    await expect(page.getByRole('heading', { name: 'Staff', level: 2 }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Open Caja' }).click();
    const openDlg = page.getByRole('dialog', { name: 'Open Caja' });
    await expect(openDlg).toBeVisible();
    await openDlg.getByLabel(/opening cash/i).fill('500');
    await openDlg.getByRole('button', { name: 'Open Caja' }).click();
    await expect(page.getByRole('button', { name: 'Close Caja' })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('section').filter({ hasText: 'Daily business session' })).toContainText('Open');
    await logout(page);
  });

  test('POS is active after caja open', async ({ page }) => {
    await openCaja(100);
    await loginAs(page, 'cashier');
    await page.getByRole('button', { name: /checkout/i }).click();
    await expect(page).toHaveURL(/\/pos$/);
    await page.getByPlaceholder(/search products/i).fill(PRODUCT);
    const productBtn = page.getByRole('button', { name: new RegExp(`select ${PRODUCT}`, 'i') });
    await expect(productBtn).toBeVisible({ timeout: 30_000 });
    await expect(productBtn).toBeEnabled();
    await logout(page);
  });

  test('Cannot close caja with open tabs', async ({ page }) => {
    const cajaSessionId = await openCaja(200);
    await seedOpenTab({ customerName: 'Caja Block Tab', productName: PRODUCT, cajaSessionId });

    await loginAs(page, 'manager');
    await page.goto('/staff');
    await page.getByRole('button', { name: 'Close Caja' }).click();
    const closeDlg = page.getByRole('dialog', { name: 'Close Caja' });
    await expect(closeDlg).toBeVisible();
    await closeDlg.getByLabel(/closing cash count/i).fill('200');
    await closeDlg.getByRole('button', { name: 'Close Caja' }).click();
    await expect(page.getByText(/there are open tabs/i)).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press('Escape');

    // D-11: prove the guard's rejection is a real no-op, not a partial write —
    // the session must still be 'open' on the server after the rejected close.
    const admin = getServiceClient();
    const { data: caja, error } = await admin
      .from('caja_sessions')
      .select('status')
      .eq('id', cajaSessionId)
      .single();
    if (error || !caja) throw new Error(error?.message ?? 'caja session not found');
    expect(caja.status).toBe('open');

    await logout(page);
  });

  test('Manager closes caja', async ({ page }) => {
    const cajaSessionId = await openCaja(300);
    await seedOpenTab({ customerName: 'Close Caja Tab', productName: PRODUCT, cajaSessionId });
    await forceCloseAllOpenTabs();

    await loginAs(page, 'manager');
    await page.goto('/staff');
    await page.getByRole('button', { name: 'Close Caja' }).click();
    const closeDlg = page.getByRole('dialog', { name: 'Close Caja' });
    await closeDlg.getByLabel(/closing cash count/i).fill('300');
    await closeDlg.getByRole('button', { name: 'Close Caja' }).click();
    await expect(page.getByText(/caja closed successfully/i)).toBeVisible({ timeout: 30_000 });

    // Caja-per-terminal (Task 5) added a post-close reconciliation summary
    // dialog on success; it sits on top of the dashboard (background content
    // is aria-hidden while it's open), so it must be dismissed before the
    // "Open Caja" button underneath is reachable again.
    const closeSummary = page.getByTestId('caja-close-summary');
    await expect(closeSummary).toBeVisible({ timeout: 10_000 });
    // The dialog also has a generic "X" dismiss control whose accessible name
    // is also "Close" — scope to the DialogFooter's own action button (first
    // in DOM order) to avoid a strict-mode ambiguity between the two.
    await closeSummary.getByRole('button', { name: /^close$/i }).first().click();

    await expect(page.getByRole('button', { name: 'Open Caja' })).toBeVisible();
    await expect(page.getByText('Closed', { exact: true })).toBeVisible();
    await logout(page);
  });

  test('Pending total shows open-tab revenue after creating a tab with an item', async ({ page }) => {
    const cajaSessionId = await openCaja(100);
    await seedOpenTab({
      customerName: 'Pending Summary Tab',
      withItem: true,
      productName: PRODUCT,
      cajaSessionId,
    });

    await loginAs(page, 'manager');
    await page.goto('/staff');

    // The Pending (open tabs) card must show an amount > $0.00
    const pendingCard = page.locator('div').filter({ hasText: /Pending/i }).first();
    await expect(pendingCard).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(async () => {
        const cardText = await pendingCard.textContent();
        return /\$[1-9]\d*\.\d{2}|\$0\.[1-9]\d/.test(cardText ?? '');
      }, { timeout: 15_000 })
      .toBe(true);

    await logout(page);
  });

  test('Print Summary button is visible when caja is open', async ({ page }) => {
    await openCaja(100);
    await loginAs(page, 'manager');
    await page.goto('/staff');

    const printBtn = page.getByRole('button', { name: /print summary/i });
    await expect(printBtn).toBeVisible({ timeout: 30_000 });

    await logout(page);
  });

  test('5-card summary is hidden when caja is closed', async ({ page }) => {
    // Ensure caja is closed (resetTestState already closes any open caja in beforeEach)
    await loginAs(page, 'manager');
    await page.goto('/staff');

    // With no open caja, print summary button is visible but disabled (AC-3)
    await expect(page.getByRole('button', { name: /print summary/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /print summary/i })).toBeDisabled();
    // exact: true — "Cash" would otherwise substring-match the "cashier" role
    // badge rendered elsewhere on the page since D-16's bartender→cashier rename.
    await expect(page.getByText('Cash', { exact: true })).not.toBeVisible();
    await expect(page.getByText('Card', { exact: true })).not.toBeVisible();
    await expect(page.getByText('Rappi', { exact: true })).not.toBeVisible();
    await expect(page.getByText('Net', { exact: true })).not.toBeVisible();

    await logout(page);
  });
});
