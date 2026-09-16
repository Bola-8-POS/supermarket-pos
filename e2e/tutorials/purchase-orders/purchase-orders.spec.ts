import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '../fixtures';
import { loginAs, staffForRole } from '../../helpers/auth';
import { requireIntegrationEnv } from '../../helpers/requireEnv';
import { getServiceClient, resetTestState } from '../../helpers/supabase';
import { currentTutorialLocale, seedStaffLocale } from '../locale';

/**
 * Phase 34: purchase-orders domain tutorial video. PO creation is manager+
 * per CLAUDE.md, so every scenario logs in as 'manager'. Selectors here
 * reuse e2e/purchase-orders/purchase-orders.spec.ts's own dual-locale
 * (es-MX/en-US) regexes verbatim — that spec's PO dialog labels are already
 * i18n-safe, unlike the promotions/receipts reference specs.
 * Run with: npm run tutorial-videos:record -- e2e/tutorials/purchase-orders
 */

const PURCHASE_ORDERS_TILE_RE = /^(purchase orders|órdenes de compra)$/i;
const NEW_PO_RE = /new purchase order|nueva orden de compra/i;
const SAVE_DRAFT_RE = /save draft|guardar borrador/i;
const ADD_LINE_ITEM_RE = /add line item|agregar partida/i;
const SUPPLIER_LABEL_RE = /supplier|proveedor/i;
const PRODUCT_LABEL_RE = /product|producto/i;
const QUANTITY_LABEL_RE = /quantity|cantidad/i;
const COST_PRICE_LABEL_RE = /cost price|costo/i;
const SEARCH_PO_PLACEHOLDER_RE = /search purchase orders|buscar órdenes de compra/i;
const SUGGEST_REORDER_RE = /suggest reorder from low stock|sugerir reorden por bajo stock/i;

const PREFIX = 'E2E Tutorial PO';

/**
 * Seeds a supplier, a product linked to it via supplier_products, and an
 * inventory row for that product — mirrors
 * e2e/purchase-orders/purchase-orders.spec.ts's own local helper
 * (duplicated locally per this suite's per-file-helper convention).
 */
async function seedSupplierAndProduct(quantityOnHand: number): Promise<{
  db: SupabaseClient;
  supplierId: string;
  supplierName: string;
  productId: string;
  productName: string;
}> {
  const db = getServiceClient();
  const supplierName = `${PREFIX} supplier ${randomUUID()}`;
  const { data: supplier, error: supplierError } = await db
    .from('suppliers')
    .insert({ name: supplierName })
    .select('id')
    .single();
  if (supplierError || !supplier)
    throw new Error(supplierError?.message ?? 'Unable to create supplier');

  const { data: category, error: categoryError } = await db
    .from('categories')
    .select('id')
    .limit(1)
    .single();
  if (categoryError || !category) throw new Error(categoryError?.message ?? 'No category available');

  const productName = `MDH Chana Masala ${randomUUID()}`;
  const { data: product, error: productError } = await db
    .from('products')
    .insert({ name: productName, category_id: category.id, base_price: 10, is_active: true })
    .select('id')
    .single();
  if (productError || !product) throw new Error(productError?.message ?? 'Unable to create product');

  const { error: linkError } = await db
    .from('supplier_products')
    .insert({ supplier_id: supplier.id, product_id: product.id });
  if (linkError) throw new Error(linkError.message);

  const { error: invError } = await db
    .from('inventory')
    .insert({ product_id: product.id, quantity_on_hand: quantityOnHand });
  if (invError) throw new Error(invError.message);

  return {
    db,
    supplierId: supplier.id as string,
    supplierName,
    productId: product.id as string,
    productName,
  };
}

/** Suppliers/purchase_order_items/purchase_orders use ON DELETE RESTRICT — children first. */
async function cleanupSupplierAndProduct(
  db: SupabaseClient,
  supplierId: string,
  productId: string
): Promise<void> {
  const { data: pos } = await db.from('purchase_orders').select('id').eq('supplier_id', supplierId);
  const poIds = (pos ?? []).map((p: { id: string }) => p.id);
  if (poIds.length > 0) {
    await db.from('purchase_order_items').delete().in('purchase_order_id', poIds);
    await db.from('purchase_orders').delete().in('id', poIds);
  }
  await db.from('shipments').delete().eq('supplier_id', supplierId);
  await db.from('supplier_products').delete().eq('supplier_id', supplierId);
  await db.from('products').delete().eq('id', productId);
  await db.from('suppliers').delete().eq('id', supplierId);
}

test.describe('Tutorial: purchase orders', () => {
  test.beforeEach(async () => {
    requireIntegrationEnv();
    await resetTestState();
    await seedStaffLocale(staffForRole('manager').name, currentTutorialLocale());
  });

  test('manager creates a purchase order manually', async ({ page, narrate }) => {
    const { db, supplierId, supplierName, productId, productName } = await seedSupplierAndProduct(20);
    try {
      await page.goto('/');
      await loginAs(page, 'manager');

      await narrate(page, 'Open Purchase Orders', async () => {
        await page.getByRole('button', { name: PURCHASE_ORDERS_TILE_RE }).click();
        await expect(page).toHaveURL(/\/purchase-orders$/);
      });

      await narrate(page, 'Start a new purchase order', async () => {
        await page.getByRole('button', { name: NEW_PO_RE }).first().click();
      });

      const dialog = page.getByRole('dialog').filter({ hasText: NEW_PO_RE });
      await expect(dialog).toBeVisible();

      await narrate(page, 'Pick the supplier', async () => {
        await dialog.getByLabel(SUPPLIER_LABEL_RE).selectOption({ label: supplierName });
      });

      await narrate(page, 'Add a line item: product, quantity, cost', async () => {
        await dialog.getByRole('button', { name: ADD_LINE_ITEM_RE }).click();
        await dialog.getByLabel(PRODUCT_LABEL_RE).fill(productName);
        await dialog.getByLabel(QUANTITY_LABEL_RE).fill('5');
        await dialog.getByLabel(COST_PRICE_LABEL_RE).fill('3.50');
      });

      await narrate(page, 'Save the draft purchase order', async () => {
        await dialog.getByRole('button', { name: SAVE_DRAFT_RE }).click();
        await expect(dialog).toBeHidden();
      });

      await narrate(page, 'The new draft appears in the purchase orders list', async () => {
        await page.getByPlaceholder(SEARCH_PO_PLACEHOLDER_RE).fill(supplierName);
        await expect(page.getByRole('row', { name: new RegExp(supplierName) })).toBeVisible();
      });
    } finally {
      await cleanupSupplierAndProduct(db, supplierId, productId);
    }
  });

  test('manager generates a suggest-reorder draft from low stock', async ({ page, narrate }) => {
    const { db, supplierId, supplierName, productId, productName } = await seedSupplierAndProduct(3);
    try {
      await page.goto('/');
      await loginAs(page, 'manager');

      await narrate(page, 'Open Purchase Orders', async () => {
        await page.getByRole('button', { name: PURCHASE_ORDERS_TILE_RE }).click();
        await expect(page).toHaveURL(/\/purchase-orders$/);
      });

      await narrate(page, 'Start a new purchase order for the low-stock supplier', async () => {
        await page.getByRole('button', { name: NEW_PO_RE }).first().click();
      });

      const dialog = page.getByRole('dialog').filter({ hasText: NEW_PO_RE });
      await expect(dialog).toBeVisible();

      await narrate(page, 'Pick the supplier', async () => {
        await dialog.getByLabel(SUPPLIER_LABEL_RE).selectOption({ label: supplierName });
      });

      await narrate(page, 'Suggest Reorder pre-fills the quantity from low stock', async () => {
        const suggestBtn = dialog.getByRole('button', { name: SUGGEST_REORDER_RE });
        await expect(suggestBtn).toBeEnabled();
        await expect(async () => {
          await suggestBtn.click();
          await expect(dialog.getByLabel(PRODUCT_LABEL_RE)).toHaveValue(productName, {
            timeout: 1_000,
          });
        }).toPass({ timeout: 15_000 });
      });

      await narrate(page, 'Edit the suggested quantity before saving', async () => {
        await dialog.getByLabel(QUANTITY_LABEL_RE).fill('9');
      });

      await narrate(page, 'Save the draft', async () => {
        await dialog.getByRole('button', { name: SAVE_DRAFT_RE }).click();
        await expect(dialog).toBeHidden();
      });
    } finally {
      await cleanupSupplierAndProduct(db, supplierId, productId);
    }
  });
});
