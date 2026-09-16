import type { Page } from '@playwright/test';
import { loginAs } from '../../helpers/auth';
import { requireIntegrationEnv } from '../../helpers/requireEnv';
import { getServiceClient, resetTestState } from '../../helpers/supabase';
import { expect, test } from '../fixtures';

/**
 * Phase 34, Plan 05: settings domain tutorial. Deliberately does NOT import
 * seedStaffLocale/currentTutorialLocale from '../locale' (per 34-RESEARCH.md
 * Pattern 2/Anti-Patterns) — this is the one domain whose own content IS the
 * real Settings -> Language self-service switch, so driving it through the
 * actual UI is the point, not a shortcut to work around.
 */

const TERMINAL_ID = process.env['VITE_TERMINAL_ID'] ?? 'POS-1';
const DEFAULT_LOCK_TIMEOUT_SECONDS = 60;

const LANGUAGE_TAB_RE = /^(idioma|language)$/i;
const LOCK_TAB_RE = /auto-lock timeout|bloqueo automático/i;
const SAVE_RE = /^(save|guardar)$/i;
const DISCARD_RE = /^(discard|descartar)$/i;

async function resetLockTimeout(): Promise<void> {
  const admin = getServiceClient();
  await admin
    .from('terminal_lock_settings')
    .upsert(
      { terminal_id: TERMINAL_ID, lock_timeout_seconds: DEFAULT_LOCK_TIMEOUT_SECONDS },
      { onConflict: 'terminal_id' }
    );
}

/**
 * Adapted from e2e/settings/i18n-locale-switch.spec.ts's switchOwnLocale():
 * drives the real Settings -> Language Select and Save button, idempotent
 * against the Select's own currently-checked option.
 */
async function switchOwnLocale(page: Page, target: 'en-US' | 'es-MX'): Promise<void> {
  const languageTab = page.getByRole('tab', { name: LANGUAGE_TAB_RE });
  await expect(languageTab).toBeVisible({ timeout: 20_000 });
  await languageTab.click();

  const localeSelect = page.locator('#settings-language');
  await expect(localeSelect).toBeVisible({ timeout: 15_000 });
  await localeSelect.click();

  const optionLocator =
    target === 'es-MX'
      ? page.getByRole('option', { name: 'Español (México)' })
      : page.getByRole('option', { name: /^(Inglés \(EE\. UU\.\)|English \(US\))$/ });
  await expect(optionLocator).toBeVisible({ timeout: 10_000 });

  const alreadySelected = (await optionLocator.getAttribute('data-state')) === 'checked';
  if (alreadySelected) {
    await page.keyboard.press('Escape');
    return;
  }

  await optionLocator.click();

  const saveButton = page.getByRole('button', { name: /^(guardar idioma|save language)$/i });
  await expect(saveButton).toBeEnabled({ timeout: 20_000 });
  await saveButton.click();
  await expect(page.locator('[data-sonner-toast]').first()).toBeVisible({ timeout: 15_000 });

  const expectedHeading = target === 'es-MX' ? 'Idioma' : 'Language';
  await expect(page.getByRole('heading', { name: expectedHeading })).toBeVisible({ timeout: 15_000 });
}

test.describe('Tutorial: settings', () => {
  test('admin switches their own locale via Settings -> Language', async ({ page, narrate }) => {
    test.setTimeout(90_000);
    requireIntegrationEnv();
    await resetTestState();
    await page.goto('/');
    await loginAs(page, 'admin');
    await page.goto('/settings');

    // resetTestState() re-pins this shared admin account to en-US
    // (e2e/helpers/supabase.ts) for every OTHER spec's English-text
    // selectors. Establish a known es-MX starting point (unnarrated) before
    // narrating the switch, mirroring i18n-locale-switch.spec.ts's own
    // "force a known baseline" approach.
    await switchOwnLocale(page, 'es-MX');

    await narrate(page, 'Open Settings -> Language', async () => {
      await page.goto('/settings');
      const languageTab = page.getByRole('tab', { name: 'Idioma' });
      await expect(languageTab).toBeVisible({ timeout: 20_000 });
      await languageTab.click();
      await expect(page.getByRole('heading', { name: 'Idioma' })).toBeVisible({ timeout: 15_000 });
    });

    await narrate(page, 'Switch the interface language to English', async () => {
      await switchOwnLocale(page, 'en-US');
    });

    await narrate(
      page,
      'The screen re-renders in English immediately, with no page reload',
      async () => {
        await expect(page.getByRole('tab', { name: 'Language' })).toBeVisible({ timeout: 15_000 });
        await expect(page.getByRole('heading', { name: 'Language' })).toBeVisible();
      }
    );

    await narrate(page, 'Switch back to Spanish', async () => {
      await switchOwnLocale(page, 'es-MX');
    });

    await narrate(page, 'The interface is back in Spanish', async () => {
      await expect(page.getByRole('tab', { name: 'Idioma' })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole('heading', { name: 'Idioma' })).toBeVisible();
    });
  });

  test('a dirty settings tab prompts Save/Discard/Stay on navigation away', async ({
    page,
    narrate,
  }) => {
    test.setTimeout(60_000);
    requireIntegrationEnv();
    await resetLockTimeout();

    // No resetTestState() here: it re-pins the shared admin account back to
    // en-US, which would undo Test 1's deliberate es-MX end state that this
    // test's dual-locale (es-MX/en-US) Save/Discard selectors are built to
    // handle either way. playwright.tutorial.config.ts runs this file
    // single-worker/non-parallel, so Test 1 always finishes first.
    await page.goto('/');
    await loginAs(page, 'admin');
    await page.goto('/settings');

    const lockTab = page.getByRole('tab', { name: LOCK_TAB_RE });
    await expect(lockTab).toBeVisible({ timeout: 20_000 });

    await narrate(page, 'Open the Auto-lock timeout tab', async () => {
      await lockTab.click();
    });

    const threshold = page.locator('#lock-timeout-threshold');
    await expect(threshold).toBeVisible({ timeout: 20_000 });

    await narrate(page, 'Edit the timeout without saving', async () => {
      await threshold.fill('180');
    });

    const dialog = page.getByRole('alertdialog');

    await narrate(page, 'Try to leave the tab -- a confirmation dialog appears', async () => {
      await page.getByRole('tab', { name: LANGUAGE_TAB_RE }).click();
      await expect(dialog).toBeVisible({ timeout: 10_000 });
      await expect(dialog.getByRole('button', { name: SAVE_RE })).toBeVisible();
      await expect(dialog.getByRole('button', { name: DISCARD_RE })).toBeVisible();
    });

    await narrate(page, 'Discard the change and leave', async () => {
      await dialog.getByRole('button', { name: DISCARD_RE }).click();
      await expect(dialog).not.toBeVisible({ timeout: 10_000 });
    });

    await resetLockTimeout();
  });
});
