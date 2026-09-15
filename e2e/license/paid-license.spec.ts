/**
 * Hermetic license e2e — a paid (non-demo) token has `features: null` (every feature
 * enabled per `isFeatureEnabled`), so nothing should render locked and the demo bar
 * must not appear. Runs against the `gate` project.
 */
import { randomUUID } from 'node:crypto';
import { expect, test } from '../fixtures';
import { loginAs } from '../helpers/auth';
import { seedLicense } from '../helpers/license-e2e';
import { signTestToken } from '../helpers/license-tokens';

test('a paid license unlocks every feature and hides the demo bar', async ({ page }) => {
  const terminalId = randomUUID();
  const token = signTestToken(terminalId);
  await seedLicense(page, terminalId, token);
  await page.route('**/__license/functions/v1/heartbeat', r => r.fulfill({ json: { token } }));

  await loginAs(page, 'admin');
  await expect(page.getByTestId('demo-bar')).toBeHidden();

  await page.goto('/reports');
  await expect(page.getByTestId('locked-feature')).toHaveCount(0);

  await page.goto('/audit');
  await expect(page.getByTestId('feature-locked-page')).toHaveCount(0);
});
