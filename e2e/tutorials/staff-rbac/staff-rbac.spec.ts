import { enterPin, loginAs, logout, staffForRole, WHO_ARE_YOU_RE } from '../../helpers/auth';
import { requireIntegrationEnv } from '../../helpers/requireEnv';
import { deleteTestStaff, openCaja, resetTestState } from '../../helpers/supabase';
import { expect, test } from '../fixtures';
import { currentTutorialLocale, seedStaffLocale } from '../locale';

/**
 * Phase 34 domain video: staff & RBAC. Reuses the 34-01 harness unmodified —
 * see ../checkout/checkout.spec.ts for the reference shape.
 */

const NEW_STAFF_NAME = 'Tutorial-New-Cashier';
const NEW_STAFF_PIN = '135790';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const ADD_STAFF_TRIGGER_RE = /^(add staff|agregar personal)$/i;
const NAME_LABEL_RE = /^(name|nombre)$/i;
const CONFIRM_PIN_LABEL_RE = /^(confirm pin|confirmar pin)$/i;
const CREATE_STAFF_RE = /^(create staff|crear personal)$/i;
const SET_NEW_PIN_HEADING_RE = /set a new pin|establece un nuevo pin/i;

test.describe('Tutorial: staff & RBAC', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    await seedStaffLocale(staffForRole('admin').name, currentTutorialLocale());
    await seedStaffLocale(staffForRole('cashier').name, currentTutorialLocale());
    await openCaja(500);
    await page.goto('/');
  });

  test.afterEach(async () => {
    await deleteTestStaff(NEW_STAFF_NAME).catch(() => undefined);
  });

  test('admin adds a new staff member with a forced PIN change', async ({ page, narrate }) => {
    await loginAs(page, 'admin');

    await narrate(page, 'Open the Staff page', async () => {
      await page.goto('/staff');
      await expect(page.getByRole('button', { name: ADD_STAFF_TRIGGER_RE })).toBeVisible({
        timeout: 15_000,
      });
    });

    const dialog = page.getByRole('dialog');

    await narrate(page, 'Add a new staff member', async () => {
      await page.getByRole('button', { name: ADD_STAFF_TRIGGER_RE }).click();
      await expect(dialog).toBeVisible({ timeout: 10_000 });
      await dialog.getByLabel(NAME_LABEL_RE).fill(NEW_STAFF_NAME);
      // "PIN" is identical in both locales; exact match disambiguates from
      // "Confirm PIN"/"Confirmar PIN".
      await dialog.getByLabel('PIN', { exact: true }).fill(NEW_STAFF_PIN);
      await dialog.getByLabel(CONFIRM_PIN_LABEL_RE).fill(NEW_STAFF_PIN);
      await dialog.locator('#create-staff-role').click();
      await page.getByRole('option', { name: 'cashier', exact: true }).click();
    });

    await narrate(page, 'Create the account', async () => {
      await dialog.getByRole('button', { name: CREATE_STAFF_RE }).click();
      await expect(page.getByText(NEW_STAFF_NAME, { exact: true })).toBeVisible({
        timeout: 15_000,
      });
    });

    await narrate(page, 'New staff members must set their own PIN on first login', async () => {
      await logout(page);
      await page.goto('/login');
      // Generous timeout — video-recorded runs carry more render/encode
      // overhead than the lean CI suite this flow mirrors.
      await expect(page.getByRole('heading', { name: WHO_ARE_YOU_RE })).toBeVisible({
        timeout: 30_000,
      });
      await page.getByRole('button', { name: new RegExp(escapeRegExp(NEW_STAFF_NAME), 'i') }).click();
      await expect(
        page.getByRole('heading', { name: new RegExp(`^${escapeRegExp(NEW_STAFF_NAME)}$`, 'i') })
      ).toBeVisible({ timeout: 15_000 });
      await enterPin(page, NEW_STAFF_PIN);
      await expect(page.getByRole('heading', { name: SET_NEW_PIN_HEADING_RE })).toBeVisible({
        timeout: 10_000,
      });
    });
  });

  test('a cashier is redirected away from the RBAC page', async ({ page, narrate }) => {
    await loginAs(page, 'cashier');

    await narrate(page, 'A cashier cannot access Roles & Permissions', async () => {
      await page.goto('/rbac');
      await expect(page).toHaveURL(/\/home/, { timeout: 15_000 });
    });
  });
});
