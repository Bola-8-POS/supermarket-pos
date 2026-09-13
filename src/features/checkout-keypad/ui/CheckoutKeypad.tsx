/**
 * CheckoutKeypad — tap-only numeric keypad for the checkout PLU/qty buffer.
 *
 * Deliberately no keyboard-event wiring: the checkout page already has a
 * global timing-based barcode-scanner keydown listener
 * (src/shared/lib/useBarcodeScanner.ts) and an auto-focused search input —
 * a keypad that also emits/listens to key events would collide with both.
 * Every key here is a plain tap (POSButton onClick), nothing more.
 */
import { useTranslation } from 'react-i18next';
import { POSButton } from '@shared/ui/POSButton';
import type { KeypadState } from '../model/useKeypadBuffer';

export interface CheckoutKeypadProps {
  state: KeypadState;
  disabled: boolean;
  onDigit: (d: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onArmQty: () => void;
  onAdd: () => void;
}

const DIGITS_1_TO_9 = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export function CheckoutKeypad({
  state,
  disabled,
  onDigit,
  onBackspace,
  onClear,
  onArmQty,
  onAdd,
}: CheckoutKeypadProps) {
  const { t } = useTranslation('wPanels');

  return (
    <section
      aria-label={t('checkoutPanel.keypad.title')}
      data-testid="checkout-keypad"
      className="flex w-52 flex-col gap-2 border-l border-border bg-card p-3"
    >
      <output
        data-testid="keypad-display"
        aria-live="polite"
        className="rounded-lg bg-muted px-3 py-2 text-right font-mono text-2xl tabular-nums"
      >
        {state.buffer || '0'}
        {state.multiplier !== null && (
          <span data-testid="keypad-multiplier">×{state.multiplier}</span>
        )}
      </output>

      <div className="grid grid-cols-3 gap-2">
        {DIGITS_1_TO_9.map(d => (
          <POSButton
            key={d}
            type="button"
            variant="outline"
            touchSize="large"
            disabled={disabled}
            onClick={() => {
              onDigit(d);
            }}
          >
            {d}
          </POSButton>
        ))}
        <POSButton
          type="button"
          variant="outline"
          touchSize="large"
          disabled={disabled}
          aria-label={t('checkoutPanel.keypad.clear')}
          onClick={onClear}
        >
          {/* eslint-disable i18next/no-literal-string -- single-char glyph; aria-label carries the translated word */}
          C
          {/* eslint-enable i18next/no-literal-string */}
        </POSButton>
        <POSButton
          type="button"
          variant="outline"
          touchSize="large"
          disabled={disabled}
          onClick={() => {
            onDigit('0');
          }}
        >
          0
        </POSButton>
        <POSButton
          type="button"
          variant="outline"
          touchSize="large"
          disabled={disabled}
          aria-label={t('checkoutPanel.keypad.backspace')}
          onClick={onBackspace}
        >
          {/* eslint-disable i18next/no-literal-string -- single-char glyph; aria-label carries the translated word */}
          ⌫
          {/* eslint-enable i18next/no-literal-string */}
        </POSButton>
      </div>

      <POSButton
        type="button"
        variant="secondary"
        touchSize="large"
        disabled={disabled}
        onClick={onArmQty}
      >
        {t('checkoutPanel.keypad.qty')}
      </POSButton>
      <POSButton type="button" touchSize="large" disabled={disabled} onClick={onAdd}>
        {t('checkoutPanel.keypad.add')}
      </POSButton>
    </section>
  );
}
