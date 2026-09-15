/**
 * Hermetic license e2e — the online-demo build (`VITE_DEMO_AUTO_START=true`) self-provisions
 * a demo instead of showing the "start demo" button, and self-heals an expired/invalid demo
 * by minting a fresh terminal id and starting a new one. Runs against the `auto-start`
 * project (port 1523) — see playwright.license.config.ts.
 */
import { randomUUID } from 'node:crypto';
import { expect, test } from '../fixtures';
import { seedLicense } from '../helpers/license-e2e';
import { demoToken } from '../helpers/license-tokens';

test('a fresh terminal auto-provisions a demo with no start-demo button ever rendered', async ({
  page,
}) => {
  // A slight artificial delay makes the "preparing" state observable instead of racing
  // past it — a real license server round-trip is never instant either.
  await page.route('**/__license/functions/v1/start-demo', async route => {
    await new Promise(r => setTimeout(r, 300));
    const body = JSON.parse(route.request().postData() ?? '{}') as { terminal_id: string };
    return route.fulfill({
      json: { token: demoToken(body.terminal_id), license_key: 'DEMO-0000-0000-0002' },
    });
  });
  await page.route('**/__license/functions/v1/heartbeat', route => {
    const body = JSON.parse(route.request().postData() ?? '{}') as { terminal_id?: string };
    return route.fulfill({ json: { token: demoToken(body.terminal_id ?? randomUUID()) } });
  });

  await page.goto('/login');
  await expect(page.getByTestId('license-gate-preparing')).toBeVisible();
  // While the gate self-provisions, the manual activation form (and its demo button) never
  // mounts at all — this build never asks a store owner to click anything.
  await expect(page.getByTestId('start-demo-button')).toHaveCount(0);
  await expect(page.getByTestId('license-gate-preparing')).toBeHidden();
  await expect(page.getByTestId('demo-login-hint')).toBeVisible();
  await expect(page.getByTestId('start-demo-button')).toHaveCount(0);
});

test('an expired demo self-resets to a new terminal id and starts a new demo', async ({
  page,
}) => {
  const seededTerminalId = randomUUID();
  const expiredToken = demoToken(seededTerminalId, -1);
  await seedLicense(page, seededTerminalId, expiredToken);

  const startDemoTerminalIds: string[] = [];
  await page.route('**/__license/functions/v1/start-demo', route => {
    const body = JSON.parse(route.request().postData() ?? '{}') as { terminal_id: string };
    startDemoTerminalIds.push(body.terminal_id);
    return route.fulfill({
      json: { token: demoToken(body.terminal_id), license_key: 'DEMO-0000-0000-0003' },
    });
  });
  await page.route('**/__license/functions/v1/heartbeat', route => {
    const body = JSON.parse(route.request().postData() ?? '{}') as { terminal_id?: string };
    return route.fulfill({ json: { token: demoToken(body.terminal_id ?? randomUUID()) } });
  });

  await page.goto('/login');
  await expect(page.getByTestId('license-gate-preparing')).toBeHidden({ timeout: 15_000 });
  await expect(page.getByTestId('demo-login-hint')).toBeVisible();

  expect(startDemoTerminalIds.length).toBeGreaterThan(0);
  for (const id of startDemoTerminalIds) {
    expect(id).not.toBe(seededTerminalId);
  }
});
