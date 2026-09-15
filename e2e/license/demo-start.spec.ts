/**
 * Hermetic license e2e — the free-demo self-service path from a cold/unlicensed terminal.
 * Runs against the `gate` project (port 1522, VITE_LICENSE_ENFORCE=true, TEST-ONLY signing
 * key). Every license-server call is intercepted with `page.route()` — no real server, no
 * POS Supabase DB — see playwright.license.config.ts and e2e/helpers/license-e2e.ts.
 */
import { randomUUID } from 'node:crypto';
import { expect, test } from '../fixtures';
import { loginAs } from '../helpers/auth';
import { seedTerminal } from '../helpers/license-e2e';
import { demoToken } from '../helpers/license-tokens';

test('gate offers a free demo and the app opens with the demo bar', async ({ page }) => {
  const terminalId = randomUUID();
  await seedTerminal(page, terminalId);
  await page.route('**/__license/functions/v1/start-demo', r =>
    r.fulfill({ json: { token: demoToken(terminalId), license_key: 'DEMO-0000-0000-0001' } })
  );
  await page.route('**/__license/functions/v1/heartbeat', r =>
    r.fulfill({ json: { token: demoToken(terminalId) } })
  );

  await page.goto('/login');
  await expect(page.getByTestId('license-gate')).toHaveAttribute('data-reason', 'unlicensed');
  await page.getByTestId('start-demo-button').click();
  await expect(page.getByTestId('license-gate')).toBeHidden();
  await expect(page.getByTestId('demo-login-hint')).toBeVisible();

  await loginAs(page, 'admin');
  await expect(page.getByTestId('demo-bar')).toHaveAttribute('data-days-left', '14');
});

test('a used terminal shows the mapped DEMO_ALREADY_USED copy', async ({ page }) => {
  await seedTerminal(page, randomUUID());
  await page.route('**/__license/functions/v1/start-demo', r =>
    r.fulfill({ status: 403, json: { error: 'DEMO_ALREADY_USED', message: 'used' } })
  );

  await page.goto('/login');
  await page.getByTestId('start-demo-button').click();
  await expect(page.getByTestId('license-activation-error')).toContainText(
    /ya usó su demo|already used its demo/i
  );
});
