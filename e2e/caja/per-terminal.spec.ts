import { expect, test } from '../fixtures';
import { loginAs } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { getServiceClient, openCaja, resetTestState } from '../helpers/supabase';

// Representative single-barcode packaged good from the Indian catalog
// (scripts/seed-dev-data.ts) — same product e2e/checkout/happy-path.spec.ts uses.
const PRODUCT = "Haldiram's Aloo Bhujia 200g";

test.describe('caja per terminal', () => {
  test.beforeEach(async () => {
    requireIntegrationEnv();
    await resetTestState();
  });

  test('two terminals hold independent open cajas; sale binds to its own terminal', async ({
    browser,
  }) => {
    // Terminal A — default POS-1, logged in as admin (avoids two contexts
    // sharing one manager's shift/PIN-login race).
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    await loginAs(pageA, 'admin');
    await pageA.goto('/staff');
    await pageA.getByRole('button', { name: 'Open Caja' }).click();
    const openDlgA = pageA.getByRole('dialog', { name: 'Open Caja' });
    await expect(openDlgA).toBeVisible();
    await openDlgA.getByLabel(/opening cash/i).fill('100');
    await openDlgA.getByRole('button', { name: 'Open Caja' }).click();
    await expect(pageA.getByRole('button', { name: 'Close Caja' })).toBeVisible({ timeout: 30_000 });
    await expect(pageA.getByTestId('caja-terminal-badge')).toContainText('POS-1');

    // Terminal B — POS-2, logged in as manager.
    const ctxB = await browser.newContext();
    await ctxB.addInitScript(() => {
      localStorage.setItem('pos.terminal_id', 'POS-2');
    });
    const pageB = await ctxB.newPage();
    await loginAs(pageB, 'manager');
    await pageB.goto('/staff');
    await pageB.getByRole('button', { name: 'Open Caja' }).click();
    const openDlgB = pageB.getByRole('dialog', { name: 'Open Caja' });
    await expect(openDlgB).toBeVisible();
    await openDlgB.getByLabel(/opening cash/i).fill('50');
    await openDlgB.getByRole('button', { name: 'Open Caja' }).click();
    await expect(pageB.getByRole('button', { name: 'Close Caja' })).toBeVisible({ timeout: 30_000 });
    await expect(pageB.getByTestId('caja-terminal-badge')).toContainText('POS-2');

    const db = getServiceClient();
    const { data: open } = await db.from('caja_sessions').select('terminal_id').eq('status', 'open');
    expect((open ?? []).map(r => r.terminal_id).sort()).toEqual(['POS-1', 'POS-2']);

    // A cash sale on POS-2 lands on POS-2's own caja session (mirrors
    // e2e/checkout/happy-path.spec.ts's cash-payment flow). Navigate directly
    // to /pos — the "Checkout" nav button only lives on /home, and pageB is
    // currently on /staff.
    await pageB.goto('/pos');
    await expect(pageB).toHaveURL(/\/pos$/);
    await pageB.getByPlaceholder(/search products/i).fill(PRODUCT);
    await pageB.getByRole('button', { name: new RegExp(`select ${PRODUCT}`, 'i') }).click();
    await pageB
      .getByRole('button', { name: /^process payment$/i })
      .first()
      .click();
    await pageB.getByLabel(/amount tendered/i).fill('100');
    await pageB
      .getByRole('button', { name: /^process payment$/i })
      .last()
      .click();
    await expect(pageB.getByRole('button', { name: /done/i })).toBeVisible({ timeout: 30_000 });
    await pageB.getByRole('button', { name: /done/i }).click();

    const { data: sessB } = await db
      .from('caja_sessions')
      .select('id')
      .eq('terminal_id', 'POS-2')
      .eq('status', 'open')
      .single();
    const { data: tab } = await db
      .from('tabs')
      .select('caja_session_id')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    expect(tab?.caja_session_id).toBe(sessB?.id);

    // Closing POS-2 leaves POS-1 untouched; post-close summary dialog shows.
    await pageB.goto('/staff');
    await pageB.getByRole('button', { name: 'Close Caja' }).click();
    const closeDlgB = pageB.getByRole('dialog', { name: 'Close Caja' });
    await expect(closeDlgB).toBeVisible();
    await closeDlgB.getByLabel(/closing cash count/i).fill('50');
    await closeDlgB.getByRole('button', { name: 'Close Caja' }).click();
    await expect(pageB.getByTestId('caja-close-summary')).toBeVisible({ timeout: 30_000 });
    await expect(pageB.getByTestId('caja-close-variance')).toBeVisible();

    const { data: stillOpen } = await db.from('caja_sessions').select('terminal_id').eq('status', 'open');
    expect((stillOpen ?? []).map(r => r.terminal_id)).toEqual(['POS-1']);

    await ctxA.close();
    await ctxB.close();
  });

  test('second open on the same terminal is refused', async ({ page }) => {
    await openCaja(100); // helper, POS-1
    await page.goto('/');
    await loginAs(page, 'manager');
    await page.goto('/staff');
    await expect(page.getByRole('button', { name: 'Close Caja' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Open Caja' })).toBeHidden();

    // DB-level guard: a second 'open' row for the same terminal is rejected
    // by the caja_sessions_one_open_per_terminal unique index (23505), not
    // just hidden in the UI.
    const db = getServiceClient();
    const { data: mgr } = await db.from('profiles').select('id').eq('role', 'manager').limit(1).single();
    const { error } = await db
      .from('caja_sessions')
      .insert({ opened_by: mgr?.id, opening_cash: 10, status: 'open', terminal_id: 'POS-1' });
    expect(error?.code).toBe('23505');
  });
});
