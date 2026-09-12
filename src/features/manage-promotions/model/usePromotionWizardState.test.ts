import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Promotion } from '@entities/promotion';

// ============================================================================
// MOCKS
// ============================================================================

const createMutateAsync = vi.fn().mockResolvedValue({ ok: true, data: null });
const updateMutateAsync = vi.fn().mockResolvedValue({ ok: true, data: null });

vi.mock('@entities/promotion', () => ({
  useMutationCreatePromotion: () => ({ mutateAsync: createMutateAsync, isPending: false }),
  useMutationUpdatePromotion: () => ({ mutateAsync: updateMutateAsync, isPending: false }),
}));

// Import after the mock so the hook under test picks up the mocked entity module.
const { usePromotionWizardState } = await import('./usePromotionWizardState');

// ============================================================================
// HELPERS
// ============================================================================

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

function makePromotion(overrides: Partial<Promotion> = {}): Promotion {
  return {
    id: 'promo-1',
    name: 'Existing Promo',
    targets: [],
    kind: 'discount',
    discountType: 'percent',
    discountValue: 10,
    startsAt: new Date('2026-01-01T00:00:00Z'),
    endsAt: new Date('2026-12-31T23:59:59Z'),
    daysOfWeek: null,
    startTime: null,
    endTime: null,
    needsReview: false,
    active: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    createdBy: null,
    slots: [],
    ...overrides,
  };
}

// ============================================================================
// TESTS — Scope step validity (D-08 partial)
// ============================================================================

describe('usePromotionWizardState — Scope step validity (D-08 partial)', () => {
  it('defaults storeWide to true, so isScopeStepValid is true on a fresh create-mode wizard', () => {
    const { result } = renderHook(() => usePromotionWizardState(null), { wrapper });
    expect(result.current.storeWide).toBe(true);
    expect(result.current.isScopeStepValid()).toBe(true);
  });

  it('isScopeStepValid returns false when storeWide is false and both selection arrays are empty', () => {
    const { result } = renderHook(() => usePromotionWizardState(null), { wrapper });
    act(() => {
      result.current.handleStoreWideChange(false);
    });
    expect(result.current.isScopeStepValid()).toBe(false);
  });

  it('isScopeStepValid returns true when storeWide is false but a product is selected', () => {
    const { result } = renderHook(() => usePromotionWizardState(null), { wrapper });
    act(() => {
      result.current.handleStoreWideChange(false);
    });
    act(() => {
      result.current.handleScopeSelectionChange({ productIds: ['p-1'], categoryIds: [] });
    });
    expect(result.current.isScopeStepValid()).toBe(true);
  });

  it('isScopeStepValid returns true when storeWide is false but a category is selected', () => {
    const { result } = renderHook(() => usePromotionWizardState(null), { wrapper });
    act(() => {
      result.current.handleStoreWideChange(false);
    });
    act(() => {
      result.current.handleScopeSelectionChange({ productIds: [], categoryIds: ['c-1'] });
    });
    expect(result.current.isScopeStepValid()).toBe(true);
  });

  it('checking storeWide clears both selectedProductIds and selectedCategoryIds', () => {
    const { result } = renderHook(() => usePromotionWizardState(null), { wrapper });
    act(() => {
      result.current.handleStoreWideChange(false);
    });
    act(() => {
      result.current.handleScopeSelectionChange({ productIds: ['p-1'], categoryIds: ['c-1'] });
    });
    expect(result.current.selectedProductIds).toEqual(['p-1']);
    expect(result.current.selectedCategoryIds).toEqual(['c-1']);

    act(() => {
      result.current.handleStoreWideChange(true);
    });
    expect(result.current.selectedProductIds).toEqual([]);
    expect(result.current.selectedCategoryIds).toEqual([]);
    expect(result.current.storeWide).toBe(true);
  });

  it('unchecking storeWide leaves selection arrays empty — does not restore a prior selection', () => {
    const { result } = renderHook(() => usePromotionWizardState(null), { wrapper });
    act(() => {
      result.current.handleStoreWideChange(false);
    });
    act(() => {
      result.current.handleScopeSelectionChange({ productIds: ['p-1'], categoryIds: [] });
    });
    act(() => {
      result.current.handleStoreWideChange(true); // clears selection
    });
    act(() => {
      result.current.handleStoreWideChange(false); // uncheck again
    });
    expect(result.current.selectedProductIds).toEqual([]);
    expect(result.current.selectedCategoryIds).toEqual([]);
    expect(result.current.storeWide).toBe(false);
  });
});

// ============================================================================
// TESTS — save() targets payload assembly
// ============================================================================

describe('usePromotionWizardState — save() targets payload assembly', () => {
  it('sends an empty targets array when storeWide is true (create mode)', async () => {
    createMutateAsync.mockClear();
    const { result } = renderHook(() => usePromotionWizardState(null), { wrapper });
    act(() => {
      result.current.setName('Friends & Family');
      result.current.setDiscountPercentStr('20');
    });
    await act(async () => {
      await result.current.save();
    });
    expect(createMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ targets: [] })
    );
  });

  it('sends product/category target rows when storeWide is false with a mixed selection (create mode)', async () => {
    createMutateAsync.mockClear();
    const { result } = renderHook(() => usePromotionWizardState(null), { wrapper });
    act(() => {
      result.current.setName('Rice Sale');
      result.current.setDiscountPercentStr('15');
    });
    act(() => {
      result.current.handleStoreWideChange(false);
    });
    act(() => {
      result.current.handleScopeSelectionChange({
        productIds: ['p-1'],
        categoryIds: ['c-1'],
      });
    });
    await act(async () => {
      await result.current.save();
    });
    expect(createMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        targets: [
          { productId: 'p-1', categoryId: null },
          { productId: null, categoryId: 'c-1' },
        ],
      })
    );
  });

  it('sends the multi-target set on update (edit mode)', async () => {
    updateMutateAsync.mockClear();
    const promotion = makePromotion({
      targets: [
        {
          id: 't-1',
          promotionId: 'promo-1',
          productId: 'p-existing',
          categoryId: null,
        },
      ],
    });
    const { result } = renderHook(() => usePromotionWizardState(promotion), { wrapper });
    act(() => {
      result.current.handleScopeSelectionChange({
        productIds: ['p-existing', 'p-new'],
        categoryIds: [],
      });
    });
    await act(async () => {
      await result.current.save();
    });
    expect(updateMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'promo-1',
        targets: [
          { productId: 'p-existing', categoryId: null },
          { productId: 'p-new', categoryId: null },
        ],
      })
    );
  });
});

// ============================================================================
// TESTS — edit-mode prefill from promotion.targets
// ============================================================================

describe('usePromotionWizardState — edit-mode scope prefill', () => {
  it('prefills storeWide=true when the promotion has zero targets', () => {
    const promotion = makePromotion({ targets: [] });
    const { result } = renderHook(() => usePromotionWizardState(promotion), { wrapper });
    expect(result.current.storeWide).toBe(true);
    expect(result.current.selectedProductIds).toEqual([]);
    expect(result.current.selectedCategoryIds).toEqual([]);
  });

  it('prefills storeWide=false and splits product/category ids when the promotion has targets', () => {
    const promotion = makePromotion({
      targets: [
        { id: 't-1', promotionId: 'promo-1', productId: 'p-1', categoryId: null },
        { id: 't-2', promotionId: 'promo-1', productId: null, categoryId: 'c-1' },
      ],
    });
    const { result } = renderHook(() => usePromotionWizardState(promotion), { wrapper });
    expect(result.current.storeWide).toBe(false);
    expect(result.current.selectedProductIds).toEqual(['p-1']);
    expect(result.current.selectedCategoryIds).toEqual(['c-1']);
  });
});

// ============================================================================
// TESTS — Validity & Recurrence step validity (D-04/D-05, full isStepValid
// predicate machine)
// ============================================================================

describe('usePromotionWizardState — Validity step validity (D-04/D-05)', () => {
  it('is valid by default (recurring off, default forward date range)', () => {
    const { result } = renderHook(() => usePromotionWizardState(null), { wrapper });
    expect(result.current.recurring).toBe(false);
    expect(result.current.isValidityStepValid()).toBe(true);
  });

  it('is false when the end date is before the start date', () => {
    const { result } = renderHook(() => usePromotionWizardState(null), { wrapper });
    act(() => {
      result.current.handleDateRangeChange('2026-06-10', '2026-06-01');
    });
    expect(result.current.isValidityStepValid()).toBe(false);
  });

  it('is false when recurring is on with no days and no time window configured', () => {
    const { result } = renderHook(() => usePromotionWizardState(null), { wrapper });
    act(() => {
      result.current.handleRecurringChange(true);
    });
    expect(result.current.isValidityStepValid()).toBe(false);
  });

  it('is true when recurring is on with only a day-of-week selected (no time window)', () => {
    const { result } = renderHook(() => usePromotionWizardState(null), { wrapper });
    act(() => {
      result.current.handleRecurringChange(true);
    });
    act(() => {
      result.current.toggleDayOfWeek(1);
    });
    expect(result.current.isValidityStepValid()).toBe(true);
  });

  it('is true when recurring is on with only a time window set (no day-of-week restriction)', () => {
    const { result } = renderHook(() => usePromotionWizardState(null), { wrapper });
    act(() => {
      result.current.handleRecurringChange(true);
    });
    act(() => {
      result.current.setStartTime('16:00');
      result.current.setEndTime('18:00');
    });
    expect(result.current.isValidityStepValid()).toBe(true);
  });

  it('is false when recurring is on and endTime <= startTime (D-05, same-day only)', () => {
    const { result } = renderHook(() => usePromotionWizardState(null), { wrapper });
    act(() => {
      result.current.handleRecurringChange(true);
    });
    act(() => {
      result.current.setStartTime('18:00');
      result.current.setEndTime('16:00');
    });
    expect(result.current.isValidityStepValid()).toBe(false);
  });

  it('toggling recurring off clears daysOfWeek/startTime/endTime to null', () => {
    const { result } = renderHook(() => usePromotionWizardState(null), { wrapper });
    act(() => {
      result.current.handleRecurringChange(true);
    });
    act(() => {
      result.current.toggleDayOfWeek(2);
      result.current.setStartTime('16:00');
      result.current.setEndTime('18:00');
    });
    expect(result.current.daysOfWeek).toEqual([2]);
    act(() => {
      result.current.handleRecurringChange(false);
    });
    expect(result.current.daysOfWeek).toBeNull();
    expect(result.current.startTime).toBeNull();
    expect(result.current.endTime).toBeNull();
  });

  it('edit-mode prefills recurring=true when the promotion has daysOfWeek or a time window set', () => {
    const promotion = makePromotion({ daysOfWeek: [1, 3], startTime: null, endTime: null });
    const { result } = renderHook(() => usePromotionWizardState(promotion), { wrapper });
    expect(result.current.recurring).toBe(true);
    expect(result.current.daysOfWeek).toEqual([1, 3]);
  });

  it('edit-mode prefills recurring=false when the promotion has no recurrence fields set', () => {
    const promotion = makePromotion({ daysOfWeek: null, startTime: null, endTime: null });
    const { result } = renderHook(() => usePromotionWizardState(promotion), { wrapper });
    expect(result.current.recurring).toBe(false);
  });
});

// ============================================================================
// TESTS — isStepValid dispatcher (D-08, full 4-step gate)
// ============================================================================

describe('usePromotionWizardState — isStepValid dispatcher (D-08)', () => {
  it('dispatches to basics/scope/validity checks and always allows review', () => {
    const { result } = renderHook(() => usePromotionWizardState(null), { wrapper });
    // Fresh wizard: no name yet -> basics invalid; storeWide true -> scope valid;
    // default date range, no recurrence -> validity valid; review always true.
    expect(result.current.isStepValid('basics')).toBe(false);
    expect(result.current.isStepValid('scope')).toBe(true);
    expect(result.current.isStepValid('validity')).toBe(true);
    expect(result.current.isStepValid('review')).toBe(true);

    act(() => {
      result.current.setName('Friends & Family');
      result.current.setDiscountPercentStr('20');
    });
    expect(result.current.isStepValid('basics')).toBe(true);
  });
});
