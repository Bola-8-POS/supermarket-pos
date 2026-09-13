/**
 * E2E spec: Task 1 — Persist idle-lock state across restart (security fix)
 *
 * Root cause: `lock-state-store.ts` was in-memory only, while the Supabase
 * session (`persistSession: true`) and `staff-store.isAuthenticated` (zustand
 * persist) both survive a restart. Closing the app while the idle-lock
 * overlay is up and relaunching used to land on the restored session's route,
 * fully unlocked -- a PIN bypass. This spec proves a relaunch (same
 * localStorage, brand-new JS realm -- the closest a Playwright browser
 * context can get to "quit and relaunch the desktop app") re-shows the
 * overlay instead.
 *
 * Requires .env.local with E2E_*_PIN/NAME and SUPABASE_SERVICE_ROLE_KEY.
 */
import { expect, test } from '../fixtures';
import { enterPin, loginAs } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { getServiceClient, resetTestState } from '../helpers/supabase';

const TERMINAL_ID = process.env.VITE_TERMINAL_ID ?? 'POS-1';
const LOCK_TIMEOUT_SECONDS = 15;

async function seedLockTimeout(): Promise<void> {
  const admin = getServiceClient();
  const { error } = await admin
    .from('terminal_lock_settings')
    .upsert(
      { terminal_id: TERMINAL_ID, lock_timeout_seconds: LOCK_TIMEOUT_SECONDS },
      { onConflict: 'terminal_id' }
    );
  if (error) throw new Error(`seedLockTimeout: ${error.message}`);
}

async function clearLockTimeout(): Promise<void> {
  const admin = getServiceClient();
  await admin.from('terminal_lock_settings').delete().eq('terminal_id', TERMINAL_ID);
}

test.describe('Idle Screen Lock — persists across restart', () => {
  test.beforeEach(async () => {
    requireIntegrationEnv();
    await resetTestState();
    await seedLockTimeout();
  });

  test.afterEach(async () => {
    await clearLockTimeout();
  });

  test('relaunching the app while locked still shows the PIN overlay', async ({ context, page }) => {
    test.setTimeout(120_000);

    await loginAs(page, 'admin');
    await page.goto('/home');
    const overlay = page.getByRole('alertdialog', { name: /screen locked|pantalla bloqueada/i });
    await expect(overlay).toBeVisible({ timeout: 25_000 });

    // "Restart": same browser context (same localStorage), brand-new JS realm.
    await page.close();
    const relaunched = await context.newPage();
    await relaunched.goto('/home');

    const overlay2 = relaunched.getByRole('alertdialog', { name: /screen locked|pantalla bloqueada/i });
    await expect(overlay2).toBeVisible();
    // Route content must not be reachable behind it.
    await relaunched.goto('/pos');
    await expect(relaunched.getByRole('alertdialog', { name: /screen locked|pantalla bloqueada/i })).toBeVisible();
    await expect(relaunched.getByPlaceholder(/search products|buscar productos/i)).not.toBeVisible();

    await enterPin(relaunched, process.env.E2E_ADMIN_PIN ?? '0000');
    await expect(
      relaunched.getByRole('alertdialog', { name: /screen locked|pantalla bloqueada/i })
    ).toBeHidden();
  });

  test('relaunching while unlocked does not lock', async ({ context, page }) => {
    await loginAs(page, 'admin');
    await page.close();
    const relaunched = await context.newPage();
    await relaunched.goto('/home');
    await expect(relaunched.getByRole('heading').first()).toBeVisible();
    await expect(relaunched.getByRole('alertdialog')).toHaveCount(0);
  });
});
