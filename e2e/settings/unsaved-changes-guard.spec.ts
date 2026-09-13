/**
 * E2E spec: Settings unsaved-changes guard (settings-guard-keypad-lockfix branch,
 * commits 7505146/c6d80db/2439114/71bedac).
 *
 * SettingsTabsPanel is now a controlled Radix Tabs component with a shared
 * unsaved-changes registry (src/widgets/SettingsTabsPanel/model/unsaved-changes.tsx).
 * While a mounted tab reports itself dirty, leaving it — by switching tabs,
 * clicking a sidebar link, or closing the app/tab — opens an `alertdialog`
 * with Save/Discard/Cancel actions (UnsavedChangesDialog.tsx) before the
 * navigation is allowed to proceed. Uses the Lock tab (LockSettingsTab.tsx)
 * as the dirty-tracked fixture since it's a simple single-field form that
 * PATCHes/UPSERTs `terminal_lock_settings`.
 *
 * Exercises, in order (mirrors lock-timeout.spec.ts's seed/cleanup pattern):
 *   1. Cancel a tab-switch prompt -- the dirty value and the current tab survive.
 *   2. Discard a tab-switch prompt -- navigation proceeds, but the discarded
 *      tab's own value reverts to the server value on next visit (nothing was
 *      saved).
 *   3. Save a tab-switch prompt -- the PATCH/UPSERT fires and the value
 *      survives a reload.
 *   4. Discard a sidebar-link (app-level navigation guard) prompt.
 *   5. The `beforeunload` browser fallback (Tauri's native onCloseRequested is
 *      unit-tested only, see useCloseGuard.test.ts) -- run on its own page so
 *      closing it doesn't tear down the shared page used by the first 4 steps.
 */
import { expect, test } from '../fixtures';
import { loginAs } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { getServiceClient, resetTestState } from '../helpers/supabase';

const TERMINAL_ID = process.env.VITE_TERMINAL_ID ?? 'POS-1';
const DEFAULT_LOCK_TIMEOUT_SECONDS = 60;

const LOCK_TAB_RE = /auto-lock timeout|bloqueo automático/i;
const SAVE_RE = /^(save|guardar)$/i;
const DISCARD_RE = /^(discard|descartar)$/i;
const CANCEL_RE = /^(cancel|cancelar)$/i;
const HOME_LINK_RE = /^home$|^inicio$/i;

async function resetLockTimeout(): Promise<void> {
  const admin = getServiceClient();
  await admin
    .from('terminal_lock_settings')
    .upsert(
      { terminal_id: TERMINAL_ID, lock_timeout_seconds: DEFAULT_LOCK_TIMEOUT_SECONDS },
      { onConflict: 'terminal_id' }
    );
}

test.describe('Settings unsaved-changes guard', () => {
  test.beforeEach(async () => {
    requireIntegrationEnv();
    await resetTestState();
    await resetLockTimeout();
  });

  test.afterEach(async () => {
    await resetLockTimeout();
  });

  test('cancel keeps the dirty tab, discard reverts it, save persists it, and a sidebar link honours the same guard', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'admin');
    await page.goto('/settings');
    await page.getByRole('tab', { name: LOCK_TAB_RE }).click();

    const threshold = page.locator('#lock-timeout-threshold');
    await expect(threshold).toBeVisible({ timeout: 20_000 });

    // --- Scenario 1: Cancel -- dirty value and current tab both survive. ---
    await threshold.fill('120');
    await page.getByRole('tab', { name: /language|idioma/i }).click();

    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByRole('button', { name: SAVE_RE })).toBeVisible();
    await expect(dialog.getByRole('button', { name: DISCARD_RE })).toBeVisible();
    await expect(dialog.getByRole('button', { name: CANCEL_RE })).toBeVisible();

    await dialog.getByRole('button', { name: CANCEL_RE }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });
    await expect(threshold).toBeVisible();
    await expect(threshold).toHaveValue('120');

    // --- Scenario 2: Discard -- navigation proceeds; the Lock tab's own
    // (never-saved) value reverts to the server value on the next visit. ---
    await page.getByRole('tab', { name: /language|idioma/i }).click();
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await dialog.getByRole('button', { name: DISCARD_RE }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#settings-language')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('tab', { name: LOCK_TAB_RE }).click();
    await expect(threshold).toBeVisible({ timeout: 15_000 });
    await expect(threshold).toHaveValue(String(DEFAULT_LOCK_TIMEOUT_SECONDS));

    // --- Scenario 3: Save -- the PATCH/UPSERT fires and survives a reload. ---
    await threshold.fill('150');
    await page.getByRole('tab', { name: /language|idioma/i }).click();
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    const saveRequest = page.waitForResponse(
      resp =>
        resp.url().includes('/rest/v1/terminal_lock_settings') && resp.request().method() !== 'GET'
    );
    await dialog.getByRole('button', { name: SAVE_RE }).click();
    await saveRequest;
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });

    await page.reload();
    await page.goto('/settings');
    await page.getByRole('tab', { name: LOCK_TAB_RE }).click();
    await expect(threshold).toHaveValue('150', { timeout: 20_000 });

    // --- Scenario 4: Discard through the sidebar's app-level navigation
    // guard (not a tab switch) -- same dialog, different trigger. ---
    await threshold.fill('200');
    await page.getByRole('link', { name: HOME_LINK_RE }).click();
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await dialog.getByRole('button', { name: DISCARD_RE }).click();
    await expect(page).toHaveURL(/\/home$/, { timeout: 15_000 });
  });

  // The brief's literal scenario 5 (`page.close({ runBeforeUnload: true })`
  // plus a `page.once('dialog', ...)` listener) never surfaces a dialog in
  // this sandbox: confirmed down to the raw CDP level (`Page.enable` +
  // listening for `Page.javascriptDialogOpening` directly, bypassing
  // Playwright's own dialog wrapper) against both the agent-browser Chrome-
  // for-Testing binary this config auto-detects AND Playwright's own bundled
  // Chromium, headless AND headed — a minimal repro page with nothing but a
  // `beforeunload` handler calling `preventDefault()` closes silently with
  // zero CDP dialog events every time. That's a property of this Chromium
  // build/sandbox, not of this app or this spec (see task-5-report.md for
  // the repro). Verify the same real, live-mounted `useCloseGuard` browser
  // fallback (src/widgets/SettingsTabsPanel/model/useCloseGuard.ts) the
  // native dialog would have exercised, by dispatching a real
  // `beforeunload` Event at the window and reading `defaultPrevented` --
  // unlike the hook's own unit test (useCloseGuard.test.ts), this proves
  // the listener is actually wired up end-to-end through the mounted
  // SettingsTabsPanel + a genuinely dirty Lock tab, not just the hook in
  // isolation.
  test('the beforeunload fallback prevents unload while the Lock tab is dirty, and stops once it is not', async ({
    context,
  }) => {
    test.setTimeout(60_000);
    // A fresh page/context.newPage() so this test's own navigation doesn't
    // interfere with the shared `page` fixture used by the scenario above.
    const guardPage = await context.newPage();
    await loginAs(guardPage, 'admin');
    await guardPage.goto('/settings');
    await guardPage.getByRole('tab', { name: LOCK_TAB_RE }).click();

    const threshold = guardPage.locator('#lock-timeout-threshold');
    await expect(threshold).toBeVisible({ timeout: 20_000 });

    const dispatchBeforeUnload = () =>
      guardPage.evaluate(() => {
        const event = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      });

    // Clean tab: nothing should prevent unload yet.
    expect(await dispatchBeforeUnload()).toBe(false);

    await threshold.fill('210');
    expect(await dispatchBeforeUnload()).toBe(true);

    // Discard the change (via the tab-switch prompt, the same mechanism
    // scenario 2 above exercises) and confirm the guard disengages again --
    // proves this is driven by the live dirty flag, not a one-shot latch.
    await guardPage.getByRole('tab', { name: /language|idioma/i }).click();
    const guardDialog = guardPage.getByRole('alertdialog');
    await expect(guardDialog).toBeVisible({ timeout: 10_000 });
    await guardDialog.getByRole('button', { name: DISCARD_RE }).click();
    await expect(guardDialog).not.toBeVisible({ timeout: 10_000 });

    expect(await dispatchBeforeUnload()).toBe(false);
  });
});
