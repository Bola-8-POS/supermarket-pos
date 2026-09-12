import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Promotion, PromotionComboSlot } from '@shared/lib/domain';
import {
  evaluateCombos,
  isProductComboEligible,
  type ComboCartLine,
  type ComboCategoryLookup,
} from './combo-pricing';

const NOW = new Date('2026-09-01T12:00:00.000Z');
const TZ = 'America/Mexico_City';

let uidCounter = 0;
function uid(): string {
  uidCounter += 1;
  return `cccccccc-cccc-4ccc-8ccc-${uidCounter.toString().padStart(12, '0')}`;
}

function makeSlot(overrides: Partial<PromotionComboSlot> = {}): PromotionComboSlot {
  const promotionId = overrides.promotionId ?? uid();
  return {
    id: uid(),
    promotionId,
    position: 0,
    quantity: 1,
    label: null,
    targets: [{ id: uid(), promotionId, productId: null, categoryId: null, slotId: uid() }],
    ...overrides,
  };
}

function makeCombo(overrides: Partial<Promotion> = {}): Promotion {
  const id = overrides.id ?? uid();
  return {
    id,
    name: 'Test combo',
    targets: [],
    kind: 'combo',
    discountType: 'cheapest_free',
    discountValue: 1,
    startsAt: new Date('2026-08-01T00:00:00.000Z'),
    endsAt: new Date('2026-12-31T23:59:59.000Z'),
    daysOfWeek: null,
    startTime: null,
    endTime: null,
    needsReview: false,
    active: true,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    createdBy: null,
    slots: [makeSlot({ promotionId: id })],
    ...overrides,
  };
}

/** One cart line, `quantity` units of `unitPrice`, all in `categoryId`. */
function line(
  tempId: string,
  unitPrice: number,
  quantity: number,
  categoryId: string,
  overrides: Partial<ComboCartLine> = {}
): ComboCartLine {
  return {
    tempId,
    productId: `product-${tempId}`,
    categoryId,
    quantity,
    unitPrice,
    lineDiscountPerUnit: 0,
    soldByWeight: false,
    comboEligible: true,
    ...overrides,
  };
}

const CATEGORIES: Map<string, ComboCategoryLookup> = new Map([
  ['snacks', { comboEligible: true, parentId: null }],
  ['atta', { comboEligible: true, parentId: null }],
  ['ghee', { comboEligible: true, parentId: null }],
  ['tea', { comboEligible: true, parentId: null }],
]);

/** A slot whose sole target matches an entire category. */
function categorySlot(
  categoryId: string,
  quantity: number,
  overrides: Partial<PromotionComboSlot> = {}
): PromotionComboSlot {
  const promotionId = overrides.promotionId ?? uid();
  return makeSlot({
    promotionId,
    quantity,
    targets: [{ id: uid(), promotionId, productId: null, categoryId, slotId: uid() }],
    ...overrides,
  });
}

describe('evaluateCombos', () => {
  it('3x2 (cheapest_free, one slot qty 3 on category snacks): frees the cheapest of the 3 units', () => {
    const comboId = uid();
    const combo = makeCombo({
      id: comboId,
      discountType: 'cheapest_free',
      discountValue: 1,
      slots: [categorySlot('snacks', 3, { promotionId: comboId })],
    });
    const lines = [
      line('A', 10, 1, 'snacks'),
      line('B', 20, 1, 'snacks'),
      line('C', 30, 1, 'snacks'),
    ];
    const result = evaluateCombos(lines, [combo], NOW, TZ, CATEGORIES);

    expect(result.applications).toHaveLength(1);
    const app = result.applications[0];
    expect(app?.gross).toBe(10);
    expect(app?.net).toBe(10);
    expect(result.netSavings).toBe(10);
    const byTempId = new Map(app?.units.map(u => [u.tempId, u.discountAmount]));
    expect(byTempId.get('A')).toBe(10);
    expect(byTempId.get('B')).toBe(0);
    expect(byTempId.get('C')).toBe(0);
  });

  it('3x2 with 4 units 10/20/30/40: picks the 3 highest-priced (20,30,40), frees the cheapest of those (20)', () => {
    const comboId = uid();
    const combo = makeCombo({
      id: comboId,
      discountType: 'cheapest_free',
      discountValue: 1,
      slots: [categorySlot('snacks', 3, { promotionId: comboId })],
    });
    const lines = [
      line('A', 10, 1, 'snacks'),
      line('B', 20, 1, 'snacks'),
      line('C', 30, 1, 'snacks'),
      line('D', 40, 1, 'snacks'),
    ];
    const result = evaluateCombos(lines, [combo], NOW, TZ, CATEGORIES);

    expect(result.applications).toHaveLength(1);
    expect(result.netSavings).toBe(20);
    const app = result.applications[0];
    const byTempId = new Map(app?.units.map(u => [u.tempId, u.discountAmount]));
    expect(byTempId.get('A')).toBeUndefined(); // cheapest unit (10) never consumed
    expect(byTempId.get('B')).toBe(20); // cheapest of the 3 consumed (20,30,40)
    expect(byTempId.get('C')).toBe(0);
    expect(byTempId.get('D')).toBe(0);
  });

  it('6 identically-priced units produce two applications', () => {
    const comboId = uid();
    const combo = makeCombo({
      id: comboId,
      discountType: 'cheapest_free',
      discountValue: 1,
      slots: [categorySlot('snacks', 3, { promotionId: comboId })],
    });
    const lines = [line('A', 10, 6, 'snacks')];
    const result = evaluateCombos(lines, [combo], NOW, TZ, CATEGORIES);
    expect(result.applications).toHaveLength(2);
    expect(result.netSavings).toBe(20);
  });

  it('bundle_price 199 over slots [atta 100][ghee 120][tea 40]: gross 61, allocation sums to 61 exactly, remainder on last', () => {
    const comboId = uid();
    const combo = makeCombo({
      id: comboId,
      discountType: 'bundle_price',
      discountValue: 199,
      slots: [
        categorySlot('atta', 1, { promotionId: comboId, position: 0 }),
        categorySlot('ghee', 1, { promotionId: comboId, position: 1 }),
        categorySlot('tea', 1, { promotionId: comboId, position: 2 }),
      ],
    });
    const lines = [line('A', 100, 1, 'atta'), line('B', 120, 1, 'ghee'), line('C', 40, 1, 'tea')];
    const result = evaluateCombos(lines, [combo], NOW, TZ, CATEGORIES);

    expect(result.applications).toHaveLength(1);
    const app = result.applications[0];
    expect(app?.gross).toBe(61);
    const sum = app?.units.reduce((s, u) => s + u.discountAmount, 0);
    expect(sum).toBe(61);
  });

  it('bundle_price higher than the sum of slot prices produces no application', () => {
    const comboId = uid();
    const combo = makeCombo({
      id: comboId,
      discountType: 'bundle_price',
      discountValue: 500,
      slots: [
        categorySlot('atta', 1, { promotionId: comboId, position: 0 }),
        categorySlot('ghee', 1, { promotionId: comboId, position: 1 }),
        categorySlot('tea', 1, { promotionId: comboId, position: 2 }),
      ],
    });
    const lines = [line('A', 100, 1, 'atta'), line('B', 120, 1, 'ghee'), line('C', 40, 1, 'tea')];
    const result = evaluateCombos(lines, [combo], NOW, TZ, CATEGORIES);
    expect(result.applications).toHaveLength(0);
    expect(result.netSavings).toBe(0);
  });

  it('percent 10 over two slots: each unit gets 10% of its own price', () => {
    const comboId = uid();
    const combo = makeCombo({
      id: comboId,
      discountType: 'percent',
      discountValue: 10,
      slots: [
        categorySlot('atta', 1, { promotionId: comboId, position: 0 }),
        categorySlot('ghee', 1, { promotionId: comboId, position: 1 }),
      ],
    });
    const lines = [line('A', 100, 1, 'atta'), line('B', 50, 1, 'ghee')];
    const result = evaluateCombos(lines, [combo], NOW, TZ, CATEGORIES);

    expect(result.applications).toHaveLength(1);
    const app = result.applications[0];
    expect(app?.discountRate).toBe(10);
    const byTempId = new Map(app?.units.map(u => [u.tempId, u.discountAmount]));
    expect(byTempId.get('A')).toBe(10);
    expect(byTempId.get('B')).toBe(5);
    expect(app?.gross).toBe(15);
  });

  it('fixed 15 over Σ 40 allocates 15 proportionally; fixed 100 over Σ 40 caps gross at 40', () => {
    const comboIdSmall = uid();
    const small = makeCombo({
      id: comboIdSmall,
      discountType: 'fixed',
      discountValue: 15,
      slots: [
        categorySlot('atta', 1, { promotionId: comboIdSmall, position: 0 }),
        categorySlot('ghee', 1, { promotionId: comboIdSmall, position: 1 }),
      ],
    });
    const lines = [line('A', 25, 1, 'atta'), line('B', 15, 1, 'ghee')];
    const smallResult = evaluateCombos(lines, [small], NOW, TZ, CATEGORIES);
    expect(smallResult.applications).toHaveLength(1);
    const smallApp = smallResult.applications[0];
    expect(smallApp?.gross).toBe(15);
    expect(smallApp?.units.reduce((s, u) => s + u.discountAmount, 0)).toBe(15);

    const comboIdBig = uid();
    const big = makeCombo({
      id: comboIdBig,
      discountType: 'fixed',
      discountValue: 100,
      slots: [
        categorySlot('atta', 1, { promotionId: comboIdBig, position: 0 }),
        categorySlot('ghee', 1, { promotionId: comboIdBig, position: 1 }),
      ],
    });
    const bigResult = evaluateCombos(lines, [big], NOW, TZ, CATEGORIES);
    expect(bigResult.applications).toHaveLength(1);
    expect(bigResult.applications[0]?.gross).toBe(40);
  });

  it('net rule: units already carrying lineDiscountPerUnit totalling >= combo gross produce no application', () => {
    const comboId = uid();
    const combo = makeCombo({
      id: comboId,
      discountType: 'fixed',
      discountValue: 10,
      slots: [categorySlot('snacks', 1, { promotionId: comboId })],
    });
    const lines = [line('A', 20, 1, 'snacks', { lineDiscountPerUnit: 15 })];
    const result = evaluateCombos(lines, [combo], NOW, TZ, CATEGORIES);
    expect(result.applications).toHaveLength(0);
  });

  it('a weight-sold line never participates', () => {
    const comboId = uid();
    const combo = makeCombo({
      id: comboId,
      discountType: 'cheapest_free',
      discountValue: 1,
      slots: [categorySlot('snacks', 1, { promotionId: comboId })],
    });
    const lines = [line('A', 10, 1, 'snacks', { soldByWeight: true })];
    const result = evaluateCombos(lines, [combo], NOW, TZ, CATEGORIES);
    expect(result.applications).toHaveLength(0);
  });

  it('a product with comboEligible:false is ignored', () => {
    const comboId = uid();
    const combo = makeCombo({
      id: comboId,
      discountType: 'cheapest_free',
      discountValue: 1,
      slots: [categorySlot('snacks', 1, { promotionId: comboId })],
    });
    const lines = [line('A', 10, 1, 'snacks', { comboEligible: false })];
    const result = evaluateCombos(lines, [combo], NOW, TZ, CATEGORIES);
    expect(result.applications).toHaveLength(0);
  });

  it('a product under an ineligible parent category is ignored', () => {
    const nestedCategories: Map<string, ComboCategoryLookup> = new Map([
      ['grandparent', { comboEligible: false, parentId: null }],
      ['parent', { comboEligible: true, parentId: 'grandparent' }],
      ['child', { comboEligible: true, parentId: 'parent' }],
    ]);
    const comboId = uid();
    const combo = makeCombo({
      id: comboId,
      discountType: 'cheapest_free',
      discountValue: 1,
      slots: [categorySlot('child', 1, { promotionId: comboId })],
    });
    const lines = [line('A', 10, 1, 'child')];
    const result = evaluateCombos(lines, [combo], NOW, TZ, nestedCategories);
    expect(result.applications).toHaveLength(0);
  });

  it('inactive combo is ignored', () => {
    const comboId = uid();
    const combo = makeCombo({
      id: comboId,
      active: false,
      discountType: 'cheapest_free',
      discountValue: 1,
      slots: [categorySlot('snacks', 1, { promotionId: comboId })],
    });
    const lines = [line('A', 10, 1, 'snacks')];
    expect(evaluateCombos(lines, [combo], NOW, TZ, CATEGORIES).applications).toHaveLength(0);
  });

  it('out-of-date-range combo is ignored', () => {
    const comboId = uid();
    const combo = makeCombo({
      id: comboId,
      startsAt: new Date('2026-09-02T00:00:00.000Z'),
      endsAt: new Date('2026-12-31T00:00:00.000Z'),
      discountType: 'cheapest_free',
      discountValue: 1,
      slots: [categorySlot('snacks', 1, { promotionId: comboId })],
    });
    const lines = [line('A', 10, 1, 'snacks')];
    expect(evaluateCombos(lines, [combo], NOW, TZ, CATEGORIES).applications).toHaveLength(0);
  });

  it('wrong day-of-week combo is ignored', () => {
    // NOW is a Tuesday (dayOfWeek=2) in America/Mexico_City.
    const comboId = uid();
    const combo = makeCombo({
      id: comboId,
      daysOfWeek: [0, 1], // Sun, Mon only
      discountType: 'cheapest_free',
      discountValue: 1,
      slots: [categorySlot('snacks', 1, { promotionId: comboId })],
    });
    const lines = [line('A', 10, 1, 'snacks')];
    expect(evaluateCombos(lines, [combo], NOW, TZ, CATEGORIES).applications).toHaveLength(0);
  });

  it('a unit is not reused when it matches two slots’ target sets', () => {
    const comboId = uid();
    const combo = makeCombo({
      id: comboId,
      discountType: 'cheapest_free',
      discountValue: 1,
      slots: [
        categorySlot('snacks', 1, { promotionId: comboId, position: 0 }),
        categorySlot('snacks', 1, { promotionId: comboId, position: 1 }),
      ],
    });
    // Only 2 units total available for two 1-slot demands -> exactly fillable, no double count.
    const lines = [line('A', 10, 1, 'snacks'), line('B', 20, 1, 'snacks')];
    const result = evaluateCombos(lines, [combo], NOW, TZ, CATEGORIES);
    expect(result.applications).toHaveLength(1);
    const app = result.applications[0];
    expect(app?.units).toHaveLength(2);
    const tempIds = app?.units.map(u => u.tempId).sort();
    expect(tempIds).toEqual(['A', 'B']);
  });

  it('fast-check: unit consumption, per-unit discount, allocation sum, and net invariants hold', () => {
    const categoryNames = ['snacks', 'atta', 'ghee'] as const;
    const linesArb = fc.array(
      fc.record({
        tempId: fc.uuid(),
        priceCents: fc.integer({ min: 100, max: 5000 }),
        quantity: fc.integer({ min: 1, max: 3 }),
        category: fc.constantFrom(...categoryNames),
      }),
      { minLength: 2, maxLength: 6 }
    );

    const comboSpecArb = fc.record({
      id: fc.uuid(),
      discountType: fc.constantFrom<'percent' | 'fixed' | 'bundle_price' | 'cheapest_free'>(
        'percent',
        'fixed',
        'bundle_price',
        'cheapest_free'
      ),
      discountValue: fc.integer({ min: 1, max: 40 }),
      slotQty: fc.integer({ min: 1, max: 2 }),
      slotCount: fc.integer({ min: 1, max: 2 }),
      category: fc.constantFrom(...categoryNames),
      createdAtOffset: fc.integer({ min: -30, max: 0 }),
    });

    fc.assert(
      fc.property(
        linesArb,
        fc.array(comboSpecArb, { minLength: 0, maxLength: 3 }),
        (lineSpecs, comboSpecs) => {
          const lines: ComboCartLine[] = lineSpecs.map(spec => ({
            tempId: spec.tempId,
            productId: `product-${spec.tempId}`,
            categoryId: spec.category,
            quantity: spec.quantity,
            unitPrice: spec.priceCents / 100,
            lineDiscountPerUnit: 0,
            soldByWeight: false,
            comboEligible: true,
          }));

          const combos: Promotion[] = comboSpecs.map(spec => {
            const discountValue =
              spec.discountType === 'percent'
                ? Math.min(spec.discountValue, 90)
                : spec.discountType === 'cheapest_free'
                  ? spec.slotQty * spec.slotCount // deliberately >= total qty sometimes; impl caps defensively
                  : spec.discountValue;
            const slots: PromotionComboSlot[] = Array.from({ length: spec.slotCount }, (_, i) =>
              categorySlot(spec.category, spec.slotQty, { promotionId: spec.id, position: i })
            );
            return makeCombo({
              id: spec.id,
              discountType: spec.discountType,
              discountValue,
              slots,
              createdAt: new Date(NOW.getTime() + spec.createdAtOffset * 86_400_000),
            });
          });

          const result = evaluateCombos(lines, combos, NOW, TZ, CATEGORIES);

          // netSavings === Σ net
          const expectedNetSavings = result.applications.reduce((s, a) => s + a.net, 0);
          expect(result.netSavings).toBeCloseTo(expectedNetSavings, 6);

          const consumedCountByTempId = new Map<string, number>();
          for (const app of result.applications) {
            expect(app.net).toBeGreaterThan(0);
            expect(app.net).toBeLessThanOrEqual(app.gross + 1e-9);

            const priceByTempId = new Map(lines.map(l => [l.tempId, l.unitPrice]));
            let sumAllocation = 0;
            for (const unit of app.units) {
              sumAllocation += unit.discountAmount;
              const price = priceByTempId.get(unit.tempId) ?? 0;
              // every discountAmount <= unitPrice
              expect(unit.discountAmount).toBeLessThanOrEqual(price + 1e-9);
              expect(unit.discountAmount).toBeGreaterThanOrEqual(-1e-9);
              consumedCountByTempId.set(
                unit.tempId,
                (consumedCountByTempId.get(unit.tempId) ?? 0) + 1
              );
            }
            // Σ units.discountAmount === gross per application
            expect(sumAllocation).toBeCloseTo(app.gross, 6);
          }

          // no tempId unit allocated more times than its quantity (no over-consumption)
          for (const l of lines) {
            expect(consumedCountByTempId.get(l.tempId) ?? 0).toBeLessThanOrEqual(l.quantity);
          }
        }
      )
    );
  });
});

describe('isProductComboEligible', () => {
  it('true when the product and its whole category chain are eligible', () => {
    expect(
      isProductComboEligible({ comboEligible: true, categoryId: 'snacks' }, CATEGORIES)
    ).toBe(true);
  });

  it('false when the product itself is marked ineligible', () => {
    expect(
      isProductComboEligible({ comboEligible: false, categoryId: 'snacks' }, CATEGORIES)
    ).toBe(false);
  });

  it('false when any ancestor up to 3 levels is ineligible (3-deep chain)', () => {
    const chain: Map<string, ComboCategoryLookup> = new Map([
      ['grandparent', { comboEligible: false, parentId: null }],
      ['parent', { comboEligible: true, parentId: 'grandparent' }],
      ['child', { comboEligible: true, parentId: 'parent' }],
    ]);
    expect(isProductComboEligible({ comboEligible: true, categoryId: 'child' }, chain)).toBe(
      false
    );
  });

  it('a missing category lookup is treated as eligible, not a crash', () => {
    const empty: Map<string, ComboCategoryLookup> = new Map();
    expect(isProductComboEligible({ comboEligible: true, categoryId: 'unknown' }, empty)).toBe(
      true
    );
  });
});
