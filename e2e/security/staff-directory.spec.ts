import { expect, test } from '@playwright/test';
import { WHO_ARE_YOU_RE, loginAs } from '../helpers/auth';

test.describe('Staff directory', () => {
  test('the sign-in screen loads the staff list without credential fields', async ({ page }) => {
    const bodies: string[] = [];
    const paths: string[] = [];
    page.on('response', res => {
      const url = res.url();
      if (url.includes('/rest/v1/staff_directory') || url.includes('/rest/v1/profiles')) {
        paths.push(new URL(url).pathname);
        void res.text().then(t => bodies.push(t)).catch(() => undefined);
      }
    });

    await page.goto('/login');
    await expect(page.getByRole('heading', { name: WHO_ARE_YOU_RE })).toBeVisible({ timeout: 60_000 });
    await page.waitForLoadState('networkidle');

    expect(paths.some(p => p.endsWith('/staff_directory'))).toBe(true);
    expect(paths.some(p => p.endsWith('/profiles'))).toBe(false);
    for (const body of bodies) {
      expect(body).not.toMatch(/"pin"\s*:/);
      expect(body).not.toMatch(/"email"\s*:/);
    }
  });

  test('the persisted staff record holds no credential fields after sign-in', async ({ page }) => {
    await loginAs(page, 'cashier');
    const raw = await page.evaluate(() => window.localStorage.getItem('staff-store'));
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string) as { state: { currentStaff: Record<string, unknown> | null } };
    expect(parsed.state.currentStaff).toBeTruthy();
    expect(parsed.state.currentStaff).not.toHaveProperty('pin');
    expect(parsed.state.currentStaff).not.toHaveProperty('email');
  });
});
