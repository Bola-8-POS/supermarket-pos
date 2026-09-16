import { randomUUID } from 'node:crypto';
import { expect, test } from '../fixtures';
import { gotoAuthed, loginAs, staffForRole } from '../../helpers/auth';
import { requireIntegrationEnv } from '../../helpers/requireEnv';
import { getServiceClient, resetTestState } from '../../helpers/supabase';
import { currentTutorialLocale, seedStaffLocale } from '../locale';

/**
 * Phase 34 Plan 02: suppliers domain tutorial. Manager creates a supplier
 * with a linked product, then receives a shipment via the quick-add flow —
 * including a duplicate-barcode rejection on a second line item.
 */

const PREFIX = 'Tutorial suppliers';

// Dual-locale (es-MX/en-US) selectors, mirroring e2e/suppliers/*.spec.ts's
// own inline dual-locale regex convention verbatim (those specs already do
// this correctly — no English-only regex is copied from them unmodified).
const NEW_SUPPLIER_BTN_RE = /new supplier|nuevo proveedor/i;
const SAVE_SUPPLIER_RE = /save supplier|guardar proveedor/i;
const RECEIVE_SHIPMENT_RE = /receive shipment|recibir/i;
const ADD_LINE_ITEM_RE = /add line item|agregar partida/i;
const ADD_PRODUCT_RE = /add product|agregar producto/i;
const ALREADY_IN_CATALOG_RE = /already in your catalog|ya está en tu catálogo/i;

async function seedProductForLink(): Promise<{ id: string; name: string }> {
  const db = getServiceClient();
  const { data: category, error: categoryError } = await db
    .from('categories')
    .select('id')
    .limit(1)
    .single();
  if (categoryError || !category) throw new Error(categoryError?.message ?? 'No category');
  const name = `${PREFIX} product ${randomUUID()}`;
  const { data, error } = await db
    .from('products')
    .insert({ name, category_id: category.id, base_price: 5, is_active: true })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Unable to create product');
  return { id: data.id as string, name };
}

async function seedSupplierForReceiving(): Promise<{ id: string; name: string }> {
  const db = getServiceClient();
  const name = `${PREFIX} supplier ${randomUUID()}`;
  const { data, error } = await db.from('suppliers').insert({ name }).select('id').single();
  if (error || !data) throw new Error(error?.message ?? 'Unable to create supplier');
  return { id: data.id as string, name };
}

test.describe('Tutorial: suppliers', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    const { name } = staffForRole('manager');
    await seedStaffLocale(name, currentTutorialLocale());
    await loginAs(page, 'manager');
  });

  test('manager creates a supplier with a linked product', async ({ page, narrate }) => {
    test.setTimeout(120_000);
    const product = await seedProductForLink();
    const supplierName = `${PREFIX} ${randomUUID()}`;

    await narrate(page, 'Open the suppliers page', async () => {
      await gotoAuthed(page, '/suppliers');
      await expect(page.getByRole('button', { name: NEW_SUPPLIER_BTN_RE }).first()).toBeVisible({
        timeout: 15_000,
      });
    });

    await narrate(page, 'Start a new supplier', async () => {
      await page.getByRole('button', { name: NEW_SUPPLIER_BTN_RE }).first().click();
    });

    const dialog = page.getByRole('dialog');

    await narrate(page, 'Fill in the supplier contact details', async () => {
      await expect(dialog).toBeVisible({ timeout: 10_000 });
      await dialog.getByLabel(/^(name|nombre)\s*\*?$/i).fill(supplierName);
      await dialog.getByLabel(/contact name|nombre de contacto/i).fill('Ravi Patel');
      await dialog.getByLabel(/phone|teléfono/i).fill('+52 55 1234 5678');
    });

    await narrate(page, 'Link an existing product to this supplier', async () => {
      await dialog.getByPlaceholder(/search by name|buscar por nombre/i).fill(product.name);
      const checkbox = dialog.getByRole('checkbox', { name: new RegExp(product.name) });
      await expect(checkbox).toBeVisible({ timeout: 10_000 });
      await checkbox.click();
    });

    await narrate(page, 'Save the supplier', async () => {
      await dialog.getByRole('button', { name: SAVE_SUPPLIER_RE }).click();
      await expect(dialog).toBeHidden({ timeout: 15_000 });
      await expect(page.getByRole('row', { name: new RegExp(supplierName) })).toBeVisible({
        timeout: 15_000,
      });
    });
  });

  test('manager receives a shipment, rejecting a duplicate barcode', async ({ page, narrate }) => {
    test.setTimeout(120_000);
    const supplier = await seedSupplierForReceiving();
    const usedBarcode = `992${String(Date.now()).slice(-10)}`;
    const validProductName = `Everest Chana Masala ${randomUUID()}`;

    await narrate(page, 'Open the suppliers page and start receiving a shipment', async () => {
      await gotoAuthed(page, '/suppliers');
      await page.getByRole('button', { name: RECEIVE_SHIPMENT_RE }).click();
    });

    const dialog = page.getByRole('dialog');

    await narrate(page, 'Choose the supplier and add a line item', async () => {
      await expect(dialog).toBeVisible({ timeout: 10_000 });
      await dialog.getByLabel(/supplier|proveedor/i).selectOption({ label: supplier.name });
      await dialog.getByRole('button', { name: ADD_LINE_ITEM_RE }).click();
      await dialog.getByLabel(/product|producto/i).fill(usedBarcode);
      await dialog.getByRole('button', { name: ADD_PRODUCT_RE }).click();
    });

    await narrate(page, 'Quick-add the new product', async () => {
      await dialog.getByLabel(/^name|^nombre/i).fill(validProductName);
      await dialog.getByLabel(/barcode|código de barras/i).fill(usedBarcode);
      await dialog.getByLabel(/sale price|precio de venta/i).fill('12.34');
      await dialog.getByRole('button', { name: ADD_PRODUCT_RE }).last().click();
      await expect(dialog.getByLabel(/product|producto/i)).toHaveValue(validProductName, {
        timeout: 15_000,
      });
    });

    await narrate(page, 'Enter the received quantity, cost, and expiry', async () => {
      await dialog.getByLabel(/quantity|cantidad/i).fill('4');
      await dialog.getByLabel(/cost price|costo/i).fill('5.67');
      await dialog.getByLabel(/expiry date|fecha de caducidad/i).fill('2030-01-02');
    });

    await narrate(page, 'Add a second line and try an already-used barcode', async () => {
      await dialog.getByRole('button', { name: ADD_LINE_ITEM_RE }).click();
      await dialog
        .getByLabel(/product|producto/i)
        .last()
        .fill(`Parle-G Biscuits ${randomUUID()}`);
      await dialog.getByRole('button', { name: ADD_PRODUCT_RE }).click();
    });

    await narrate(page, 'The duplicate barcode is rejected', async () => {
      await dialog.getByLabel(/^name|^nombre/i).fill(`Haldiram's Namkeen ${randomUUID()}`);
      await dialog.getByLabel(/barcode|código de barras/i).fill(usedBarcode);
      await dialog.getByLabel(/sale price|precio de venta/i).fill('12.34');
      await dialog.getByRole('button', { name: ADD_PRODUCT_RE }).last().click();
      await expect(dialog.getByText(ALREADY_IN_CATALOG_RE)).toBeVisible({ timeout: 15_000 });
    });
  });
});
