import { loginAs, staffForRole } from '../../helpers/auth';
import { requireIntegrationEnv } from '../../helpers/requireEnv';
import { getServiceClient, resetTestState, seedOpenTab } from '../../helpers/supabase';
import { expect, test } from '../fixtures';
import { currentTutorialLocale, seedStaffLocale } from '../locale';

/**
 * Phase 34 domain video: caja. Reuses the 34-01 harness unmodified — see
 * ../checkout/checkout.spec.ts for the reference shape. Deliberately does
 * NOT call the shared openCaja() DB helper — the open/close flow through the
 * real UI IS the content being recorded here.
 */

const PRODUCT = 'Parle-G Biscuits 200g';

const OPEN_CAJA_RE = /^(open caja|abrir caja)$/i;
const CLOSE_CAJA_RE = /^(close caja|cerrar caja)$/i;
const OPENING_CASH_FIELD_RE = /^(opening cash|fondo inicial)$/i;
const CLOSING_CASH_COUNT_RE = /^(closing cash count|conteo de cierre de caja)$/i;
const CAJA_CLOSED_SUCCESS_RE = /caja closed successfully|caja cerrada correctamente/i;
const OPEN_TABS_BLOCK_RE = /cannot close caja|no se puede cerrar la caja/i;
const CLOSE_SUMMARY_DISMISS_RE = /^(close|cerrar)$/i;
const REGISTER_ENTRY_RE = /^(register expense \/ income|registrar gasto \/ ingreso)$/i;
// Not anchored — the rendered label appends a required-field asterisk
// ("Amount *"/"Monto *"), so an exact `^...$` match never resolves.
const AMOUNT_LABEL_RE = /^(amount|monto)\b/i;
const CONCEPT_LABEL_RE = /^(concept|concepto)\b/i;
const SAVE_ENTRY_RE = /^(save entry|guardar registro)$/i;
const EXPENSE_RECORDED_RE = /expense recorded|gasto registrado/i;

test.describe('Tutorial: caja', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    await seedStaffLocale(staffForRole('manager').name, currentTutorialLocale());
    await page.goto('/');
    await loginAs(page, 'manager');
  });

  test('manager opens and closes a caja session', async ({ page, narrate }) => {
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

    await narrate(page, 'Register a cash expense during the shift', async () => {
      await page.getByRole('button', { name: REGISTER_ENTRY_RE }).click();
      const dlg = page.getByRole('dialog', { name: REGISTER_ENTRY_RE });
      await expect(dlg).toBeVisible({ timeout: 10_000 });
      await dlg.getByLabel(AMOUNT_LABEL_RE).fill('50');
      await dlg.getByLabel(CONCEPT_LABEL_RE).fill('Limpieza');
      await dlg.getByRole('button', { name: SAVE_ENTRY_RE }).click();
      await expect(page.getByText(EXPENSE_RECORDED_RE)).toBeVisible({ timeout: 15_000 });
    });

    await narrate(page, 'Close the caja at end of day', async () => {
      await page.getByRole('button', { name: CLOSE_CAJA_RE }).click();
      const closeDlg = page.getByRole('dialog', { name: CLOSE_CAJA_RE });
      await expect(closeDlg).toBeVisible({ timeout: 10_000 });
      await closeDlg.getByLabel(CLOSING_CASH_COUNT_RE).fill('450');
      await closeDlg.getByRole('button', { name: CLOSE_CAJA_RE }).click();
      await expect(page.getByText(CAJA_CLOSED_SUCCESS_RE)).toBeVisible({ timeout: 30_000 });
    });

    await narrate(page, 'Review the end-of-day reconciliation summary', async () => {
      const closeSummary = page.getByTestId('caja-close-summary');
      await expect(closeSummary).toBeVisible({ timeout: 10_000 });
      await closeSummary.getByRole('button', { name: CLOSE_SUMMARY_DISMISS_RE }).first().click();
      await expect(page.getByRole('button', { name: OPEN_CAJA_RE })).toBeVisible();
    });
  });

  test('caja cannot be closed while a tab is open', async ({ page, narrate }) => {
    await narrate(page, 'Open the caja', async () => {
      await page.goto('/staff');
      await page.getByRole('button', { name: OPEN_CAJA_RE }).click();
      const openDlg = page.getByRole('dialog', { name: OPEN_CAJA_RE });
      await expect(openDlg).toBeVisible({ timeout: 10_000 });
      await openDlg.getByLabel(OPENING_CASH_FIELD_RE).fill('200');
      await openDlg.getByRole('button', { name: OPEN_CAJA_RE }).click();
      await expect(page.getByRole('button', { name: CLOSE_CAJA_RE })).toBeVisible({
        timeout: 30_000,
      });
    });

    // Unnarrated setup: seed an open tab scoped to the session just opened via
    // the UI above, so close_caja_session's OPEN_TABS_EXIST guard fires.
    const admin = getServiceClient();
    const { data: openSession, error } = await admin
      .from('caja_sessions')
      .select('id')
      .eq('status', 'open')
      .single();
    if (error) {
      throw new Error(`caja tutorial: no open caja session found after opening via UI - ${error.message}`);
    }
    await seedOpenTab({
      customerName: 'Tutorial Caja Block Tab',
      productName: PRODUCT,
      cajaSessionId: openSession.id as string,
    });

    await narrate(page, 'Attempting to close with an open tab is blocked', async () => {
      await page.getByRole('button', { name: CLOSE_CAJA_RE }).click();
      const closeDlg = page.getByRole('dialog', { name: CLOSE_CAJA_RE });
      await expect(closeDlg).toBeVisible({ timeout: 10_000 });
      await closeDlg.getByLabel(CLOSING_CASH_COUNT_RE).fill('200');
      await closeDlg.getByRole('button', { name: CLOSE_CAJA_RE }).click();
      // Generous timeout — video-recorded runs carry more render/encode
      // overhead than the lean CI suite this flow mirrors.
      await expect(page.getByText(OPEN_TABS_BLOCK_RE)).toBeVisible({ timeout: 30_000 });
      await page.keyboard.press('Escape');
    });
  });
});
