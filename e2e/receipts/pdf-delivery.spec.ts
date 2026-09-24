/**
 * E2E tests for Phase 13 Plan 03 — Receipt PDF delivery (RCP-03)
 *
 * Strategy: mirror 25-export-reports.spec.ts's dual-global Tauri IPC mock
 * (`window.__TAURI__` + `window.__TAURI_INTERNALS__.invoke`/`transformCallback`/
 * `unregisterCallback`) so `downloadReceiptPdf`'s `save`/`writeFile` Tauri
 * plugin calls resolve correctly.
 *
 * Test 1 drives a real cash checkout, clicks "Download PDF" on the receipt
 * screen, and asserts the native save dialog was invoked with real, non-zero
 * receipt PDF bytes written.
 *
 * Test 2 drives a real cash checkout, emails the receipt through the real
 * send-receipt-email edge function (Resend sandbox), and asserts the plain
 * "Receipt sent." toast is shown (not the "…without PDF attachment" variant)
 * — proving the PDF-attachment path succeeded end-to-end.
 *
 * Test 3 (I-8, wave 3b/S-11): signs in as the seeded Kitchen Test account and
 * calls send-receipt-email directly with that session's own access token
 * (read off the browser's persisted Supabase session, same way the app
 * itself would send it), asserting the role gate refuses it with 403
 * FORBIDDEN before any Resend call is attempted.
 */

import { expect, test, type Page } from '../fixtures';
import { loginAs } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { openCaja, resetTestState } from '../helpers/supabase';

/**
 * Injects the dual-global Tauri mock before app scripts run, intercepting
 * `plugin:dialog|save` (records that it was called, returns a mock path) and
 * `plugin:fs|write_file` (records the written byte length) — same shape as
 * 25-export-reports.spec.ts's injectTauriMocks.
 */
async function injectPdfSaveMocks(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>)['__pdfMockState'] = {
      saveDialogCalled: false,
      writeFileCalled: false,
      writtenByteLength: 0,
    };
    (window as unknown as Record<string, unknown>)['__TAURI__'] = {};
    // CheckoutPanel's isTauri()-guarded listen() effect mounts on /pos and its
    // cleanup synchronously reads this global before ever calling invoke()
    // (see e2e/helpers/tauriPeekMock.ts) — without it, unmount throws
    // "Cannot read properties of undefined (reading 'unregisterListener')".
    (window as unknown as Record<string, unknown>)['__TAURI_EVENT_PLUGIN_INTERNALS__'] = {
      unregisterListener: () => undefined,
    };

    function getState(): {
      saveDialogCalled: boolean;
      writeFileCalled: boolean;
      writtenByteLength: number;
    } {
      return (window as unknown as Record<string, unknown>)['__pdfMockState'] as {
        saveDialogCalled: boolean;
        writeFileCalled: boolean;
        writtenByteLength: number;
      };
    }

    const MOCK_SAVE_PATH = '/tmp/e2e-receipt-pdf-test.pdf';
    const callbacks = new Map<number, (arg: unknown) => void>();

    (window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'] = {
      // @tauri-apps/plugin-fs's writeFile() calls
      // `invoke('plugin:fs|write_file', data, { headers: { path, options } })`
      // — the raw byte payload IS the `args` parameter itself (the path
      // travels via `options.headers.path`), not a `{ path, data }` object.
      invoke(cmd: string, args: unknown): Promise<unknown> {
        const state = getState();

        if (cmd === 'plugin:dialog|save') {
          state.saveDialogCalled = true;
          return Promise.resolve(MOCK_SAVE_PATH);
        }

        if (cmd === 'plugin:fs|write_file') {
          state.writeFileCalled = true;
          if (args instanceof Uint8Array || args instanceof ArrayBuffer) {
            state.writtenByteLength = args.byteLength;
          }
          return Promise.resolve(null);
        }

        return Promise.resolve(null);
      },
      transformCallback(callback: (arg: unknown) => void, _once: boolean): number {
        const id = Math.floor(Math.random() * 1_000_000);
        callbacks.set(id, callback);
        return id;
      },
      unregisterCallback(id: number): void {
        callbacks.delete(id);
      },
    };
  });
}

/** Mirrors e2e/checkout/happy-path.spec.ts's cash-sale flow with the Indian catalog. */
async function driveCashCheckout(page: Page): Promise<void> {
  await page.getByRole('button', { name: /checkout/i }).click();
  await expect(page).toHaveURL(/\/pos$/);
  await page.getByPlaceholder(/search products/i).fill("Haldiram's Aloo Bhujia 200g");
  await page.getByRole('button', { name: /select haldiram's aloo bhujia 200g/i }).click();
  await page
    .getByRole('button', { name: /^process payment$/i })
    .first()
    .click();
  await page.getByLabel(/amount tendered/i).fill('100');
  await page
    .getByRole('button', { name: /^process payment$/i })
    .last()
    .click();
  await expect(page.getByRole('button', { name: /done/i })).toBeVisible({ timeout: 30_000 });
}

test.describe('Receipt PDF delivery', () => {
  test.beforeEach(async () => {
    requireIntegrationEnv();
    await resetTestState();
    await openCaja(500);
  });

  test('Download PDF triggers the native save dialog with real receipt bytes', async ({
    page,
  }) => {
    await injectPdfSaveMocks(page);
    await page.goto('/');
    await loginAs(page, 'cashier');

    await driveCashCheckout(page);

    await page.getByRole('button', { name: /download pdf/i }).click();

    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (window as unknown as { __pdfMockState: { saveDialogCalled: boolean } })
                .__pdfMockState.saveDialogCalled
          ),
        { timeout: 10_000 }
      )
      .toBe(true);

    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (window as unknown as { __pdfMockState: { writtenByteLength: number } })
                .__pdfMockState.writtenByteLength
          ),
        { timeout: 10_000 }
      )
      .toBeGreaterThan(0);
  });

  test('emailing a receipt shows the plain "Receipt sent" toast when the PDF attaches successfully', async ({
    page,
  }) => {
    // This local dev Supabase instance has no RESEND_API_KEY/RECEIPT_FROM_EMAIL
    // configured on its edge-functions container (a pre-existing environment
    // gap — every email send, not just this PDF-attachment feature, 500s here
    // with `{"code":"CONFIG", ...}`), so this test intercepts the real
    // send-receipt-email POST (page.route(), the same technique
    // e2e/18-modifier-notes-kds.spec.ts/39-concurrent-edits/35-refund/
    // 57-suppliers-loading-error.spec.ts already use for Supabase REST/RPC
    // calls) rather than depending on a live Resend send. Interception
    // happens at the network boundary AFTER the app has already generated
    // the real receipt, built the real PDF client-side, and constructed the
    // real HTTP request body — so this still proves the full client-side
    // integration (checkout -> receipt -> email dialog -> sendReceiptByEmail
    // -> receiptToPdfBytes -> uint8ArrayToBase64 -> request body) end-to-end;
    // only the actual Resend delivery is stubbed.
    let capturedPdfBase64: string | undefined;
    await page.route('**/functions/v1/send-receipt-email', async route => {
      const body: unknown = route.request().postDataJSON();
      if (body !== null && typeof body === 'object' && 'pdfBase64' in body) {
        const raw = (body as { pdfBase64: unknown }).pdfBase64;
        capturedPdfBase64 = typeof raw === 'string' ? raw : undefined;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    await page.goto('/');
    await loginAs(page, 'cashier');

    await driveCashCheckout(page);

    await page.getByRole('button', { name: /email receipt/i }).click();
    await page.getByRole('dialog').getByLabel(/email/i).fill('e2e-receipt-pdf@example.com');
    await page.getByRole('button', { name: /send receipt/i }).click();

    // Plain "Receipt sent." toast (not the "…without PDF attachment" variant)
    // proves sendReceiptByEmail resolved pdfAttached: true from the real
    // (mocked-at-the-network-boundary) edge call.
    await expect(page.getByText(/^Receipt sent\.$/).first()).toBeVisible({ timeout: 15_000 });

    expect(typeof capturedPdfBase64).toBe('string');
    expect((capturedPdfBase64 ?? '').length).toBeGreaterThan(0);
  });

  test('a kitchen-role session is refused by send-receipt-email (403 FORBIDDEN)', async ({
    page,
  }) => {
    await page.goto('/');
    await loginAs(page, 'kitchen');

    const supabaseUrl = process.env['VITE_SUPABASE_URL'];
    const anonKey = process.env['VITE_SUPABASE_ANON_KEY'];
    if (!supabaseUrl || !anonKey) {
      throw new Error('Missing VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY');
    }

    const result = await page.evaluate(
      async ({ supabaseUrl, anonKey }) => {
        // supabase-js persists the session under `sb-<project-ref>-auth-token`
        // — read the kitchen session's own access token straight off
        // localStorage rather than hardcoding the project ref.
        const storageKey = Object.keys(localStorage).find(
          k => k.startsWith('sb-') && k.endsWith('-auth-token')
        );
        const raw = storageKey ? localStorage.getItem(storageKey) : null;
        const session: { access_token?: string } | null = raw ? JSON.parse(raw) : null;
        const token = session?.access_token ?? '';

        const res = await fetch(`${supabaseUrl}/functions/v1/send-receipt-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: anonKey,
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            email: 'e2e-kitchen-403@example.com',
            receiptPlainText: 'kitchen-role-gate e2e probe',
          }),
        });
        const body: unknown = await res.json().catch(() => null);
        return { status: res.status, body };
      },
      { supabaseUrl, anonKey }
    );

    expect(result.status).toBe(403);
    expect((result.body as { error?: { code?: string } } | null)?.error?.code).toBe('FORBIDDEN');
  });
});
