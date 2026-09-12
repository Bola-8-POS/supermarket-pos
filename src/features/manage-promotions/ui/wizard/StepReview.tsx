import { useTranslation } from 'react-i18next';
import { useProducts } from '@entities/product';
import { evaluateBestPromotion, type Promotion } from '@entities/promotion';
import { useSettings } from '@entities/settings';
import type { DiscountType } from '@shared/lib/domain';
import { formatMoney } from '@shared/lib/format';

export interface StepReviewProps {
  name: string;
  discountType: DiscountType;
  discountValue: number;
  discountPercentStr: string;
  fromStr: string;
  toStr: string;
  storeWide: boolean;
  selectedProductIds: string[];
  selectedCategoryIds: string[];
  recurring: boolean;
  daysOfWeek: number[] | null;
  startTime: string | null;
  endTime: string | null;
}

// Postgres EXTRACT(DOW) convention: 0=Sunday..6=Saturday (matches
// StepValidityRecurrence.tsx's own DAY_KEYS ordering).
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

// Preview-only placeholder ids — never persisted, never rendered as visible
// UI copy (only ever fed into evaluateBestPromotion's Promotion-shaped
// argument), so these are identifiers, not translatable text.
// eslint-disable-next-line i18next/no-literal-string -- internal placeholder identifier, not UI copy
const PREVIEW_ID = 'preview';
// eslint-disable-next-line i18next/no-literal-string -- internal placeholder identifier, not UI copy
const PREVIEW_TARGET_ID = 'preview-target';

// Mirrors usePromotionWizardState.ts's own startOfDay/endOfDay — a plain,
// browser-local date-boundary helper. Fine for this preview's own
// non-authoritative computation (the wizard's real save() path uses the
// identical helper); process_direct_sale_atomic remains the sole checkout
// price authority regardless (Phase 27 precedent).
function startOfDay(str: string): Date {
  return new Date(`${str}T00:00:00`);
}

function endOfDay(str: string): Date {
  return new Date(`${str}T23:59:59`);
}

/**
 * Review step of the promotion wizard (D-07 final step, D-09 live preview).
 * Read-only summary of every prior-step value, plus a live computed-price
 * example via evaluateBestPromotion against the first catalog product
 * matching the wizard's in-progress (unsaved) scope. Rendered in
 * PromotionDialog's summary rail; the Create/Save action lives in the
 * dialog's footer.
 */
export function StepReview({
  name,
  discountType,
  discountValue,
  discountPercentStr,
  fromStr,
  toStr,
  storeWide,
  selectedProductIds,
  selectedCategoryIds,
  recurring,
  daysOfWeek,
  startTime,
  endTime,
}: StepReviewProps) {
  const { t } = useTranslation('wAdmin');
  const { data: products } = useProducts();
  const { data: appSettings } = useSettings();

  const displayDiscountValue =
    discountType === 'percent' ? Number(discountPercentStr) : discountValue;

  const sampleProduct = storeWide
    ? (products ?? [])[0]
    : ((products ?? []).find(p => selectedProductIds.includes(p.id)) ??
      (products ?? []).find(p => selectedCategoryIds.includes(p.categoryId)));

  let preview: ReturnType<typeof evaluateBestPromotion> = null;
  if (sampleProduct && appSettings) {
    const previewPromotion: Promotion = {
      id: PREVIEW_ID,
      name: name.trim() || PREVIEW_ID,
      targets: storeWide
        ? []
        : [
            ...selectedProductIds.map(id => ({
              id: PREVIEW_TARGET_ID,
              promotionId: PREVIEW_ID,
              productId: id,
              categoryId: null,
            })),
            ...selectedCategoryIds.map(id => ({
              id: PREVIEW_TARGET_ID,
              promotionId: PREVIEW_ID,
              productId: null,
              categoryId: id,
            })),
          ],
      kind: 'discount',
      discountType,
      discountValue: displayDiscountValue,
      startsAt: startOfDay(fromStr),
      endsAt: endOfDay(toStr),
      daysOfWeek: recurring && daysOfWeek !== null && daysOfWeek.length > 0 ? daysOfWeek : null,
      startTime: recurring ? startTime : null,
      endTime: recurring ? endTime : null,
      needsReview: false,
      active: true,
      createdAt: new Date(),
      createdBy: null,
      slots: [],
    };
    preview = evaluateBestPromotion(
      {
        productId: sampleProduct.id,
        categoryId: sampleProduct.categoryId,
        basePrice: sampleProduct.basePrice,
      },
      [previewPromotion],
      new Date(),
      appSettings.nearExpiry.discountPercent,
      null,
      appSettings.nearExpiry.thresholdDays,
      appSettings.general.timezone
    );
  }

  const recurrenceDayLabels = (daysOfWeek ?? []).flatMap(day => {
    const key = DAY_KEYS[day];
    return key ? [t(`promotionWizard.validity.day.${key}`)] : [];
  });

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-xl border border-border bg-card p-4 shadow-xs">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{t('promotionWizard.review.nameLabel')}</span>
          <span className="font-medium">{name || '—'}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{t('promotionWizard.review.discountLabel')}</span>
          <span className="font-medium">
            {discountType === 'percent'
              ? t('promotionWizard.review.percentValue', { value: displayDiscountValue })
              : formatMoney(displayDiscountValue)}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{t('promotionWizard.review.scopeLabel')}</span>
          <span className="font-medium">
            {storeWide
              ? t('promotionsListPanel.scopeStoreWide')
              : t('promotionsListPanel.scopeTargetCounts', {
                  productCount: selectedProductIds.length,
                  categoryCount: selectedCategoryIds.length,
                })}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">
            {t('promotionWizard.review.dateRangeLabel')}
          </span>
          <span className="font-medium">
            {t('promotionWizard.review.dateRangeValue', { from: fromStr, to: toStr })}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">
            {t('promotionWizard.review.recurrenceLabel')}
          </span>
          {recurring ? (
            <span className="flex flex-wrap justify-end gap-1 text-right font-medium">
              {recurrenceDayLabels.map(label => (
                <span key={label}>{label}</span>
              ))}
              {startTime !== null && endTime !== null && (
                <span>{t('promotionWizard.review.timeWindowValue', { startTime, endTime })}</span>
              )}
            </span>
          ) : (
            <span className="font-medium">{t('promotionWizard.review.noRecurrence')}</span>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
        {preview && sampleProduct ? (
          <p className="text-sm">
            {t('promotionWizard.review.previewLabel', {
              productName: sampleProduct.name,
              originalPrice: formatMoney(sampleProduct.basePrice),
              discountedPrice: formatMoney(preview.discountedUnitPrice),
            })}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">{t('promotionWizard.review.noPreview')}</p>
        )}
      </div>
    </div>
  );
}
