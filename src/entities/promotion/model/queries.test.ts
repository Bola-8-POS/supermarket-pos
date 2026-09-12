import { describe, expect, it } from 'vitest';
import type { Tables } from '@shared/lib/supabase.types';
import { mapPromotionRow } from './queries';

/** Row shape returned by the `*, promotion_targets(*), promotion_combo_slots(*)` nested-join select. */
type PromotionRowWithTargets = Tables<'promotions'> & {
  promotion_targets: Tables<'promotion_targets'>[] | null;
  promotion_combo_slots: Tables<'promotion_combo_slots'>[] | null;
};

const PROMOTION_ID = '11111111-1111-4111-8111-111111111111';
const SLOT_A_ID = '22222222-2222-4222-8222-222222222222';
const SLOT_B_ID = '33333333-3333-4333-8333-333333333333';
const TARGET_A_ID = '44444444-4444-4444-8444-444444444444';
const TARGET_B_ID = '55555555-5555-4555-8555-555555555555';
const TARGET_TOP_ID = '66666666-6666-4666-8666-666666666666';
const CATEGORY_A_ID = '77777777-7777-4777-8777-777777777777';
const PRODUCT_B_ID = '88888888-8888-4888-8888-888888888888';
const PRODUCT_TOP_ID = '99999999-9999-4999-8999-999999999999';

function baseRow(overrides: Partial<PromotionRowWithTargets> = {}): PromotionRowWithTargets {
  return {
    id: PROMOTION_ID,
    name: 'Test promo',
    kind: 'discount',
    discount_type: 'percent',
    discount_value: 20,
    starts_at: '2026-08-01T00:00:00.000Z',
    ends_at: '2026-12-31T23:59:59.000Z',
    days_of_week: null,
    start_time: null,
    end_time: null,
    needs_review: false,
    active: true,
    created_at: '2026-08-01T00:00:00.000Z',
    created_by: null,
    updated_at: '2026-08-01T00:00:00.000Z',
    promotion_targets: [],
    promotion_combo_slots: [],
    ...overrides,
  };
}

describe('mapPromotionRow', () => {
  it('nests two combo slots sorted by position (1,0 -> 0,1) with only their own targets', () => {
    const row = baseRow({
      kind: 'combo',
      discount_type: 'bundle_price',
      promotion_combo_slots: [
        { id: SLOT_A_ID, promotion_id: PROMOTION_ID, position: 1, quantity: 2, label: 'Chips' },
        { id: SLOT_B_ID, promotion_id: PROMOTION_ID, position: 0, quantity: 1, label: 'Soda' },
      ],
      promotion_targets: [
        {
          id: TARGET_A_ID,
          promotion_id: PROMOTION_ID,
          product_id: null,
          category_id: CATEGORY_A_ID,
          slot_id: SLOT_A_ID,
          created_at: '2026-08-01T00:00:00.000Z',
        },
        {
          id: TARGET_B_ID,
          promotion_id: PROMOTION_ID,
          product_id: PRODUCT_B_ID,
          category_id: null,
          slot_id: SLOT_B_ID,
          created_at: '2026-08-01T00:00:00.000Z',
        },
      ],
    });

    const result = mapPromotionRow(row);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.slots).toHaveLength(2);
    // Sorted by position: slot at position 0 (Soda/SLOT_B_ID) first.
    expect(result.data.slots[0]?.id).toBe(SLOT_B_ID);
    expect(result.data.slots[0]?.position).toBe(0);
    expect(result.data.slots[0]?.targets).toEqual([
      {
        id: TARGET_B_ID,
        promotionId: PROMOTION_ID,
        productId: PRODUCT_B_ID,
        categoryId: null,
        slotId: SLOT_B_ID,
      },
    ]);
    expect(result.data.slots[1]?.id).toBe(SLOT_A_ID);
    expect(result.data.slots[1]?.position).toBe(1);
    expect(result.data.slots[1]?.targets).toEqual([
      {
        id: TARGET_A_ID,
        promotionId: PROMOTION_ID,
        productId: null,
        categoryId: CATEGORY_A_ID,
        slotId: SLOT_A_ID,
      },
    ]);
  });

  it('leaves slot-less targets at the top level and never duplicates a slot-scoped target there', () => {
    const row = baseRow({
      kind: 'combo',
      discount_type: 'bundle_price',
      promotion_combo_slots: [
        { id: SLOT_A_ID, promotion_id: PROMOTION_ID, position: 0, quantity: 1, label: null },
      ],
      promotion_targets: [
        {
          id: TARGET_TOP_ID,
          promotion_id: PROMOTION_ID,
          product_id: PRODUCT_TOP_ID,
          category_id: null,
          slot_id: null,
          created_at: '2026-08-01T00:00:00.000Z',
        },
        {
          id: TARGET_A_ID,
          promotion_id: PROMOTION_ID,
          product_id: null,
          category_id: CATEGORY_A_ID,
          slot_id: SLOT_A_ID,
          created_at: '2026-08-01T00:00:00.000Z',
        },
      ],
    });

    const result = mapPromotionRow(row);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.targets).toEqual([
      {
        id: TARGET_TOP_ID,
        promotionId: PROMOTION_ID,
        productId: PRODUCT_TOP_ID,
        categoryId: null,
        slotId: null,
      },
    ]);
    expect(result.data.slots[0]?.targets).toEqual([
      {
        id: TARGET_A_ID,
        promotionId: PROMOTION_ID,
        productId: null,
        categoryId: CATEGORY_A_ID,
        slotId: SLOT_A_ID,
      },
    ]);
  });

  it('defaults kind="discount" and slots=[] for a legacy row with no combo slots', () => {
    const row = baseRow();
    const result = mapPromotionRow(row);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.kind).toBe('discount');
    expect(result.data.slots).toEqual([]);
  });
});
