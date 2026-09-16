import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures';
import { loginAs, staffForRole } from '../../helpers/auth';
import { requireIntegrationEnv } from '../../helpers/requireEnv';
import { getServiceClient, openCaja, resetTestState } from '../../helpers/supabase';
import { currentTutorialLocale, seedStaffLocale } from '../locale';
import {
  AMOUNT_TENDERED_RE,
  CHECKOUT_TILE_RE,
  DONE_RE,
  PROCESS_PAYMENT_RE,
  SEARCH_PRODUCTS_PLACEHOLDER_RE,
  selectProductRe,
} from '../i18n-selectors';

/**
 * Phase 34: receipts domain tutorial video. Hardware/Receipt Settings is
 * admin-only, so Test 1 logs in as 'admin'; reprinting from /payments is
 * available to a cashier (mirrors e2e/receipts/reprint.spec.ts), so Test 2
 * logs in as 'cashier'. Reuses the exact __TAURI_INTERNALS__ print mock from
 * reprint.spec.ts rather than writing a new one.
 * Run with: npm run tutorial-videos:record -- e2e/tutorials/receipts
 */

const SETTINGS_TILE_RE = /^(settings|ajustes)$/i;
/** wPanels.json reprint */
const REPRINT_RE = /reprint|reimprimir/i;
const ALOO_BHUJIA = "Haldiram's Aloo Bhujia 200g";

/** Duplicated from e2e/receipts/reprint.spec.ts per this suite's per-file-helper convention. */
async function injectPrintMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>)['__TAURI__'] = {};
    (window as unknown as Record<string, unknown>)['__lastPrintedLines'] = null;
    (window as unknown as Record<string, unknown>)['__TAURI_EVENT_PLUGIN_INTERNALS__'] = {
      unregisterListener: () => undefined,
    };
    (window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'] = {
      invoke(cmd: string, args: unknown): Promise<unknown> {
        if (cmd === 'print_receipt') {
          const argsObj = args as { lines?: string[] };
          (window as unknown as Record<string, unknown>)['__lastPrintedLines'] =
            argsObj.lines ?? null;
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
        (window as unknown as Record<string, unknown>)[`_${String(id)}`] = undefined;
      },
    };
  });
}

async function getLastPrintedLines(page: Page): Promise<string[] | null> {
  return page.evaluate(
    () => (window as unknown as Record<string, unknown>)['__lastPrintedLines'] as string[] | null
  );
}

test.describe('Tutorial: receipts — settings', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    await seedStaffLocale(staffForRole('admin').name, currentTutorialLocale());
    await page.goto('/');
  });

  test('admin edits receipt header/footer with a live preview', async ({ page, narrate }) => {
    await loginAs(page, 'admin');

    await narrate(page, 'Open Settings', async () => {
      await page.getByRole('button', { name: SETTINGS_TILE_RE }).click();
      await expect(page).toHaveURL(/\/settings$/);
    });

    await narrate(page, 'Go to the Hardware tab', async () => {
      await page.getByRole('tab', { name: 'Hardware' }).click();
      await expect(page.locator('#receipt-headerLine2')).toBeVisible({ timeout: 20_000 });
    });

    await narrate(page, 'Edit the receipt header line — the live preview updates immediately', async () => {
      await page.locator('#receipt-headerLine2').fill('Gracias por su compra');
      await expect(page.getByTestId('receipt-live-preview')).toContainText('Gracias por su compra');
    });

    await narrate(page, 'Edit the receipt footer text', async () => {
      // Short enough to fit on one line at the default 32-char paper width —
      // a longer string wraps mid-word in the monospace <pre> preview, which
      // breaks a plain toContainText() substring match.
      await page.locator('#receipt-footerText').fill('Devoluciones en 15 dias');
      await expect(page.getByTestId('receipt-live-preview')).toContainText(
        'Devoluciones en 15 dias'
      );
    });

    await narrate(page, 'Toggle the cashier name off the receipt', async () => {
      await page.locator('#receipt-showCashierName').setChecked(false);
      await expect(page.locator('#receipt-showCashierName')).not.toBeChecked();
    });
  });

});

test.describe('Tutorial: receipts — reprint', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    await seedStaffLocale(staffForRole('cashier').name, currentTutorialLocale());
    await openCaja(500);
    // The __TAURI_INTERNALS__ mock must be registered before the first
    // page.goto() below — CheckoutPanel's isTauri()-guarded effects only
    // read window.__TAURI__ correctly once it's present from the very first
    // navigation onward (registering it later, mid-test, races the app's own
    // caja-open check and can produce a spurious "Caja session is not open").
    await injectPrintMock(page);
    await page.goto('/');
  });

  test('cashier reprints the most recently completed sale', async ({ page, narrate }) => {
    await loginAs(page, 'cashier');

    // Unnarrated setup: mirrors checkout.spec.ts's cash-sale flow, no
    // captions/holds — this is background context for the reprint, not the
    // content being taught.
    await page.getByRole('button', { name: CHECKOUT_TILE_RE }).click();
    await expect(page).toHaveURL(/\/pos$/);
    await page.getByPlaceholder(SEARCH_PRODUCTS_PLACEHOLDER_RE).fill(ALOO_BHUJIA);
    await page.getByRole('button', { name: selectProductRe(ALOO_BHUJIA) }).click();
    await page.getByRole('button', { name: PROCESS_PAYMENT_RE }).first().click();
    await page.getByLabel(AMOUNT_TENDERED_RE).fill('100');
    await page.getByRole('button', { name: PROCESS_PAYMENT_RE }).last().click();
    await expect(page.getByRole('button', { name: DONE_RE })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: DONE_RE }).click();

    const admin = getServiceClient();
    const { data: payment, error } = await admin
      .from('payments')
      .select('id')
      .order('processed_at', { ascending: false })
      .limit(1)
      .single();
    if (error || !payment) throw new Error(error?.message ?? 'No payment found after checkout');
    const paymentId = payment.id as string;

    await narrate(page, 'Open the most recently completed sale', async () => {
      await page.goto(`/payments?id=${paymentId}`);
      const row = page.getByTestId(`payment-row-${paymentId}`);
      await expect(row).toBeVisible({ timeout: 15_000 });
    });

    await narrate(page, 'Reprint the receipt', async () => {
      await page
        .getByTestId(`payment-row-${paymentId}`)
        .getByRole('button', { name: REPRINT_RE })
        .click();
      await expect
        .poll(async () => getLastPrintedLines(page), { timeout: 15_000 })
        .not.toBeNull();
    });
  });
});
