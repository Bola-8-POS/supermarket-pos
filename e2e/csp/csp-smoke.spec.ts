/**
 * Runs the web build under its real Content-Security-Policy (the `vite
 * preview` header `vite.config.ts` sets from `WEB_CSP`, plus
 * `CSP_EXTRA_CONNECT` so the local Supabase stack's actual origin is
 * reachable — see `playwright.csp.config.ts`) and drives one real flow that
 * exercises the riskiest CSP surface: a Supabase-backed page load, then a
 * `@react-pdf/renderer` PDF export, which compiles `yoga-layout`'s
 * WebAssembly module and would be silently blocked by a `script-src` missing
 * `'wasm-unsafe-eval'`.
 *
 * `@tauri-apps/plugin-dialog`'s `save()` and `@tauri-apps/plugin-fs`'s
 * `writeFile()` (what `useExportReport` calls) both route through
 * `window.__TAURI_INTERNALS__.invoke(...)`, which does not exist in a plain
 * browser — the web build has no Tauri runtime. A fake `__TAURI_INTERNALS__`
 * is injected here (same technique `e2e/reports/export.spec.ts` uses for the
 * normal suite) so the export flow completes; unlike that suite, the fake
 * `write_file` handler here turns the exported bytes into a real browser
 * download (Blob + `<a download>`) instead of just recording them, so the
 * PDF actually reaches the WebAssembly-compiling code path under the page's
 * live CSP and the test can wait for a genuine `download` event. Injecting
 * this mock does not relax or disable the CSP itself — the browser still
 * enforces it against every real script/style/connect/wasm load the page
 * makes; the mock only stands in for the two IPC calls a Tauri-only build
 * would otherwise need a desktop runtime for.
 */
import { expect, test } from '../fixtures';
import { loginAs, logout } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { openCaja, resetTestState } from '../helpers/supabase';

async function injectDownloadingTauriMock(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'] = {
      invoke(cmd: string, args: unknown): Promise<unknown> {
        if (cmd === 'plugin:dialog|save') {
          return Promise.resolve('e2e-csp-caja-report.pdf');
        }
        if (cmd === 'plugin:fs|write_file') {
          const argsObj = args as Record<string, unknown>;
          const data = argsObj['data'];
          const bytes = data instanceof Uint8Array ? data : new Uint8Array();
          const blob = new Blob([bytes], { type: 'application/octet-stream' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = 'e2e-csp-caja-report.pdf';
          document.body.appendChild(link);
          link.click();
          link.remove();
          return Promise.resolve(null);
        }
        return Promise.resolve(null);
      },
    };
  });
}

test.describe('Web build under its Content-Security-Policy', () => {
  test('reaches Supabase, renders the caja report and exports a PDF with no CSP violation', async ({
    page,
  }) => {
    requireIntegrationEnv();
    await resetTestState();
    await openCaja(500);

    const cspMessages: string[] = [];
    page.on('console', (msg) => {
      cspMessages.push(msg.text());
    });

    await injectDownloadingTauriMock(page);

    await loginAs(page, 'manager');

    await page.goto('/reports');
    await expect(page.getByRole('heading', { name: /daily caja report/i })).toBeVisible({ timeout: 20_000 });

    const sessionSelector = page.locator('#caja-selector');
    await expect(sessionSelector).toBeVisible({ timeout: 20_000 });
    const firstValue = await sessionSelector.locator('option').first().getAttribute('value');
    if (firstValue) {
      await sessionSelector.selectOption(firstValue);
    }
    await expect(page.getByRole('heading', { name: 'Cash Reconciliation' })).toBeVisible({ timeout: 30_000 });

    const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
    await page.getByRole('button', { name: /export/i }).first().click();
    await page.getByRole('menuitem', { name: /pdf/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('.pdf');

    await logout(page);

    const violation = cspMessages.find((text) => text.includes('Content Security Policy'));
    expect(violation, `console carried a CSP violation: ${violation ?? ''}`).toBeUndefined();
  });
});
