import { useTranslation } from 'react-i18next';
import type { DiscountType } from '@shared/lib/domain';
import { FormField, Input, MoneyInput } from '@shared/ui';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui/select';
import type { ComboPricingDraft } from '../../model/usePromotionWizardState';

export interface ComboPricingSectionProps {
  comboPricing: ComboPricingDraft;
  onChange: (patch: Partial<ComboPricingDraft>) => void;
  /** True once the admin tried to submit while the pricing value was invalid. */
  showValidationError: boolean;
  disabled?: boolean;
}

// Fixed pricing-mode enum order for the dropdown — not UI copy (each label is t()-wrapped below).
// eslint-disable-next-line i18next/no-literal-string -- domain enum literals, not UI copy
const PRICING_TYPES: DiscountType[] = ['bundle_price', 'percent', 'fixed', 'cheapest_free'];

const MONEY_TYPES = new Set<DiscountType>(['bundle_price', 'fixed']);

/**
 * Pricing step of the combo builder (Task 7): how the combo itself is
 * discounted once every slot is filled — a total bundle price, a percent or
 * fixed amount off the bundle, or N of the picked units free. Presentational
 * only, mirroring StepScope/StepValidityRecurrence's own useTranslation +
 * props-only-for-data convention.
 */
export function ComboPricingSection({
  comboPricing,
  onChange,
  showValidationError,
  disabled = false,
}: ComboPricingSectionProps) {
  const { t } = useTranslation('wAdmin');
  const isMoneyType = MONEY_TYPES.has(comboPricing.type);
  const numericValue = Number(comboPricing.value);

  return (
    <div className="space-y-4">
      <FormField label={t('promotionDialog.pricing.typeLabel')} required>
        <Select
          value={comboPricing.type}
          disabled={disabled}
          onValueChange={val => {
            onChange({ type: val as DiscountType });
          }}
        >
          <SelectTrigger data-testid="combo-pricing-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRICING_TYPES.map(type => (
              <SelectItem key={type} value={type}>
                {t(`promotionDialog.pricing.${type}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      {isMoneyType ? (
        <FormField label={t(`promotionDialog.pricing.valueLabel.${comboPricing.type}`)} required>
          <MoneyInput
            value={Number.isFinite(numericValue) ? numericValue : 0}
            onChange={value => {
              onChange({ value: String(value) });
            }}
            disabled={disabled}
            data-testid="combo-pricing-value"
          />
        </FormField>
      ) : (
        <FormField label={t(`promotionDialog.pricing.valueLabel.${comboPricing.type}`)} required>
          <Input
            type="number"
            inputMode="decimal"
            min={comboPricing.type === 'cheapest_free' ? 1 : 0}
            {...(comboPricing.type === 'percent' ? { max: 100 } : {})}
            value={comboPricing.value}
            disabled={disabled}
            data-testid="combo-pricing-value"
            onChange={e => {
              onChange({ value: e.target.value });
            }}
          />
        </FormField>
      )}

      <p className="text-sm text-muted-foreground">
        {t(`promotionDialog.pricing.help.${comboPricing.type}`)}
      </p>

      {showValidationError && (
        <p className="text-sm text-destructive" role="alert">
          {t('promotionDialog.pricing.validationError')}
        </p>
      )}
    </div>
  );
}
