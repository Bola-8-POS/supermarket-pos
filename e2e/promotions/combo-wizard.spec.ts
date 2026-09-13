import { randomUUID } from 'node:crypto';
import { expect, test } from '../fixtures';
import { loginAs } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { getServiceClient, resetTestState, seedComboPromotion } from '../helpers/supabase';

/**
 * Task 8 (combos-and-terminal-caja): the combo-kind `PromotionDialog` (Task
 * 7's `ComboSlotsEditor`/`ComboPricingSection`) — kind toggle, slot
 * composition + save, cheapest_free's own value-vs-total-quantity
 * validation, the list row's "Combo · N slot(s)" scope cell, and the
 * `?edit=<id>` deep link locking the kind control with the composition
 * prefilled. Picker interaction (open trigger, search, click option, Escape)
 * mirrors promotion-dialog-validation.spec.ts / multi-target-scope.spec.ts.
 */

const uiCreatedPromotionNames: string[] = [];
const seededPromotionIds: string[] = [];

test.describe('Combo promotion dialog: composition, pricing validation, list row, edit prefill', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    await page.goto('/');
    await loginAs(page, 'admin');
  });

  test.afterEach(async () => {
    const admin = getServiceClient();
    if (uiCreatedPromotionNames.length > 0) {
      await admin.from('promotions').delete().in('name', uiCreatedPromotionNames);
      uiCreatedPromotionNames.length = 0;
    }
    if (seededPromotionIds.length > 0) {
      await admin.from('promotions').delete().in('id', seededPromotionIds);
      seededPromotionIds.length = 0;
    }
  });

  test('creates a 3x2 cheapest-free combo scoped to Snacks, shown as "Combo · 1 slot(s)" on the list', async ({
    page,
  }) => {
    const name = 'E2E 3x2 Snacks';
    uiCreatedPromotionNames.push(name);

    await page.goto('/promotions?new=1');
    const dialog = page.getByRole('dialog', { name: /new promotion/i });
    await expect(dialog).toBeVisible();

    await dialog.getByTestId('promotion-kind-combo').click();
    await dialog.getByLabel(/^name/i).fill(name);

    await dialog.getByTestId('combo-slot-qty-0').fill('3');
    await dialog.getByRole('button', { name: /select products or categories/i }).click();
    await page.getByPlaceholder(/search products or categories/i).fill('Snacks');
    await page.getByRole('option', { name: 'Snacks', exact: true }).click();
    await page.keyboard.press('Escape');

    await dialog.getByTestId('combo-pricing-type').click();
    await page.getByRole('option', { name: /cheapest free/i }).click();
    await dialog.getByTestId('combo-pricing-value').fill('1');

    await dialog.getByRole('button', { name: /create promotion/i }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/promotions$/);

    await page.getByPlaceholder(/search/i).fill(name);
    const row = page.getByRole('row', { name: new RegExp(name, 'i') });
    await expect(row).toBeVisible();
    await expect(row.getByText('Combo · 1 slot(s)')).toBeVisible();

    const admin = getServiceClient();
    const { data: promo, error } = await admin
      .from('promotions')
      .select('id, kind')
      .eq('name', name)
      .single();
    if (error) throw new Error(error.message);
    expect(promo.kind).toBe('combo');
    const promotionId = promo.id as string;

    const { data: slots, error: slotErr } = await admin
      .from('promotion_combo_slots')
      .select('id, quantity')
      .eq('promotion_id', promotionId);
    if (slotErr) throw new Error(slotErr.message);
    expect(slots).toHaveLength(1);
    expect(slots?.[0]?.quantity).toBe(3);
    const slotId = slots?.[0]?.id as string;

    const { data: targets, error: targetErr } = await admin
      .from('promotion_targets')
      .select('slot_id, category_id')
      .eq('promotion_id', promotionId);
    if (targetErr) throw new Error(targetErr.message);
    expect(targets).toHaveLength(1);
    expect(targets?.[0]?.slot_id).toBe(slotId);
    expect(targets?.[0]?.category_id).not.toBeNull();
  });

  test('cheapest_free equal to the total slot quantity is rejected — shows the validation error, never saves', async ({
    page,
  }) => {
    const name = `E2E combo-invalid-pricing ${randomUUID()}`;
    uiCreatedPromotionNames.push(name);

    await page.goto('/promotions?new=1');
    const dialog = page.getByRole('dialog', { name: /new promotion/i });
    await expect(dialog).toBeVisible();

    await dialog.getByTestId('promotion-kind-combo').click();
    await dialog.getByLabel(/^name/i).fill(name);
    await dialog.getByTestId('combo-slot-qty-0').fill('3');
    await dialog.getByRole('button', { name: /select products or categories/i }).click();
    await page.getByPlaceholder(/search products or categories/i).fill('Snacks');
    await page.getByRole('option', { name: 'Snacks', exact: true }).click();
    await page.keyboard.press('Escape');

    await dialog.getByTestId('combo-pricing-type').click();
    await page.getByRole('option', { name: /cheapest free/i }).click();
    // Total slot quantity is 3 — cheapest_free must stay STRICTLY under that
    // (isComboPricingValid), so a value of 3 is invalid (would give away
    // every unit in the combo).
    await dialog.getByTestId('combo-pricing-value').fill('3');

    await dialog.getByRole('button', { name: /create promotion/i }).click();
    await expect(dialog.getByText(/enter a valid value for this pricing type/i)).toBeVisible();
    await expect(dialog).toBeVisible();

    const admin = getServiceClient();
    const { data } = await admin.from('promotions').select('id').eq('name', name).maybeSingle();
    expect(data).toBeNull();
  });

  test('?edit=<id> locks the kind control and prefills the composition', async ({ page }) => {
    const name = `E2E combo-edit-prefill ${randomUUID()}`;
    const promotionId = await seedComboPromotion({
      name,
      type: 'cheapest_free',
      value: 1,
      slots: [{ quantity: 2, categoryNames: ['Snacks'] }],
    });
    seededPromotionIds.push(promotionId);

    await page.goto(`/promotions?edit=${promotionId}`);
    const dialog = page.getByRole('dialog', { name: /edit promotion/i });
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    await expect(dialog.getByTestId('promotion-kind-combo')).toBeDisabled();
    await expect(dialog.getByTestId('promotion-kind-discount')).toBeDisabled();
    await expect(dialog.getByTestId('combo-slot-qty-0')).toHaveValue('2');
    // "Snacks" also appears a second time in the summary rail's "2 × Snacks"
    // live-preview line (StepReview) — .first() targets the composition
    // picker's selected-target chip specifically.
    await expect(dialog.getByText('Snacks', { exact: true }).first()).toBeVisible();
  });
});
