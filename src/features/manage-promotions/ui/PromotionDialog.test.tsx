import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@shared/lib/i18n';

const createMutateAsync = vi.fn();
const updateMutateAsync = vi.fn();

// Full mock (no vi.importActual): the real @entities/promotion module imports
// the Supabase client at load time, which would break jsdom. evaluateBestPromotion/
// evaluateCombos/isProductComboEligible/isCategoryChainEligible are re-exported
// from the pure pricing modules instead.
vi.mock('@entities/promotion', async () => {
  const pricing = await import('@entities/promotion/model/promotion-pricing');
  const combo = await import('@entities/promotion/model/combo-pricing');
  return {
    evaluateBestPromotion: pricing.evaluateBestPromotion,
    evaluateCombos: combo.evaluateCombos,
    isProductComboEligible: combo.isProductComboEligible,
    isCategoryChainEligible: combo.isCategoryChainEligible,
    useMutationCreatePromotion: () => ({ mutateAsync: createMutateAsync, isPending: false }),
    useMutationUpdatePromotion: () => ({ mutateAsync: updateMutateAsync, isPending: false }),
  };
});
vi.mock('@entities/product', () => ({
  useProducts: () => ({
    data: [
      {
        id: 'p1', name: 'Parle-G', categoryId: 'c1', basePrice: 100, happyHourPrice: null, sku: null,
        isActive: true, soldByWeight: false, imageUrl: null, stock_threshold: null, barcode: null,
        unitsPerPackage: null, parentProductId: null, comboEligible: true, isCombo: false, modifiers: [],
      },
    ],
  }),
}));
vi.mock('@entities/category', () => ({
  useCategories: () => ({ data: [{ id: 'c1', name: 'Biscuits', parentId: null, comboEligible: true }] }),
}));
vi.mock('@entities/settings', () => ({
  useSettings: () => ({
    data: {
      nearExpiry: { discountPercent: 0, thresholdDays: 14 },
      general: { timezone: 'America/Mexico_City' },
    },
  }),
}));

const { PromotionDialog } = await import('./PromotionDialog');

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('PromotionDialog', () => {
  beforeEach(() => {
    createMutateAsync.mockReset().mockResolvedValue({ ok: true, data: null });
    updateMutateAsync.mockReset().mockResolvedValue({ ok: true, data: null });
  });

  it('shows the name error and does not save when submitted empty', async () => {
    const onOpenChange = vi.fn();
    render(<PromotionDialog open onOpenChange={onOpenChange} promotion={null} />, { wrapper: Wrapper });
    await userEvent.click(screen.getByRole('button', { name: /create promotion|crear promoción/i }));
    expect(await screen.findByText(/name is required|el nombre es obligatorio/i)).toBeInTheDocument();
    expect(createMutateAsync).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('saves a store-wide percent promotion and closes', async () => {
    const onOpenChange = vi.fn();
    render(<PromotionDialog open onOpenChange={onOpenChange} promotion={null} />, { wrapper: Wrapper });
    await userEvent.type(screen.getByLabelText(/^name|^nombre/i), 'Diwali 20');
    const percent = screen.getByLabelText(/discount percent|porcentaje de descuento/i);
    await userEvent.clear(percent);
    await userEvent.type(percent, '20');
    await userEvent.click(screen.getByRole('button', { name: /create promotion|crear promoción/i }));
    await waitFor(() => {
      expect(createMutateAsync).toHaveBeenCalledTimes(1);
    });
    expect(createMutateAsync.mock.calls[0]?.[0]).toMatchObject({
      name: 'Diwali 20',
      discountType: 'percent',
      discountValue: 20,
      targets: [],
    });
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('switching to Combo shows the composition section and hides Applies to', async () => {
    render(<PromotionDialog open onOpenChange={vi.fn()} promotion={null} />, { wrapper: Wrapper });
    await userEvent.click(screen.getByTestId('promotion-kind-combo'));
    expect(screen.getByTestId('combo-add-slot')).toBeInTheDocument();
    expect(screen.queryByText(/store-wide|toda la tienda/i)).not.toBeInTheDocument();
  });

  it('edit mode disables the kind toggle', () => {
    const promotion = {
      id: 'promo-1',
      name: 'Existing',
      targets: [],
      kind: 'discount' as const,
      discountType: 'percent' as const,
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
    };
    render(<PromotionDialog open onOpenChange={vi.fn()} promotion={promotion} />, {
      wrapper: Wrapper,
    });
    expect(screen.getByTestId('promotion-kind-discount')).toBeDisabled();
    expect(screen.getByTestId('promotion-kind-combo')).toBeDisabled();
  });

  it('combo mode: submitting with an empty composition does not save and shows the composition error', async () => {
    render(<PromotionDialog open onOpenChange={vi.fn()} promotion={null} />, { wrapper: Wrapper });
    await userEvent.type(screen.getByLabelText(/^name|^nombre/i), 'Snack Combo');
    await userEvent.click(screen.getByTestId('promotion-kind-combo'));
    await userEvent.click(screen.getByRole('button', { name: /create promotion|crear promoción/i }));
    expect(
      await screen.findByText(
        /add at least one slot|agrega al menos un espacio/i
      )
    ).toBeInTheDocument();
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  it('saves a combo promotion once the composition and pricing are filled in', async () => {
    const onOpenChange = vi.fn();
    render(<PromotionDialog open onOpenChange={onOpenChange} promotion={null} />, {
      wrapper: Wrapper,
    });
    await userEvent.type(screen.getByLabelText(/^name|^nombre/i), 'Snack Combo');
    await userEvent.click(screen.getByTestId('promotion-kind-combo'));
    await userEvent.click(screen.getByTestId('combo-slot-qty-0'));
    // Pick the mocked product for slot 0's targets.
    await userEvent.click(
      screen.getByRole('button', { name: /select products or categories|selecciona productos o categorías/i })
    );
    await userEvent.click(await screen.findByText('Parle-G'));
    const pricingValue = screen.getByTestId('combo-pricing-value');
    await userEvent.clear(pricingValue);
    await userEvent.type(pricingValue, '15');
    await userEvent.click(screen.getByRole('button', { name: /create promotion|crear promoción/i }));
    await waitFor(() => {
      expect(createMutateAsync).toHaveBeenCalledTimes(1);
    });
    expect(createMutateAsync.mock.calls[0]?.[0]).toMatchObject({
      name: 'Snack Combo',
      kind: 'combo',
      discountType: 'bundle_price',
      discountValue: 15,
      targets: [],
      slots: [{ quantity: 1, label: null, targets: [{ productId: 'p1', categoryId: null }] }],
    });
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
