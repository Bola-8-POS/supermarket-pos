import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { CheckoutKeypad } from './CheckoutKeypad';

function noop() {
  /* no-op */
}

describe('CheckoutKeypad', () => {
  test('renders the 10 digit buttons by accessible name', () => {
    render(
      <CheckoutKeypad
        state={{ buffer: '', multiplier: null }}
        disabled={false}
        onDigit={noop}
        onBackspace={noop}
        onClear={noop}
        onArmQty={noop}
        onAdd={noop}
      />
    );
    for (const d of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']) {
      expect(screen.getByRole('button', { name: d })).toBeInTheDocument();
    }
  });

  test('renders clear/backspace/qty/add buttons by their i18n accessible name', () => {
    render(
      <CheckoutKeypad
        state={{ buffer: '', multiplier: null }}
        disabled={false}
        onDigit={noop}
        onBackspace={noop}
        onClear={noop}
        onArmQty={noop}
        onAdd={noop}
      />
    );
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Backspace' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '× Qty' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add (PLU)' })).toBeInTheDocument();
  });

  test('display shows 0 for an empty buffer', () => {
    render(
      <CheckoutKeypad
        state={{ buffer: '', multiplier: null }}
        disabled={false}
        onDigit={noop}
        onBackspace={noop}
        onClear={noop}
        onArmQty={noop}
        onAdd={noop}
      />
    );
    expect(screen.getByTestId('keypad-display')).toHaveTextContent('0');
  });

  test('display shows the buffer and a ×N badge when a multiplier is armed', () => {
    render(
      <CheckoutKeypad
        state={{ buffer: '42', multiplier: 3 }}
        disabled={false}
        onDigit={noop}
        onBackspace={noop}
        onClear={noop}
        onArmQty={noop}
        onAdd={noop}
      />
    );
    expect(screen.getByTestId('keypad-display')).toHaveTextContent('42');
    expect(screen.getByTestId('keypad-multiplier')).toHaveTextContent('×3');
  });

  test('does not render a multiplier badge when nothing is armed', () => {
    render(
      <CheckoutKeypad
        state={{ buffer: '', multiplier: null }}
        disabled={false}
        onDigit={noop}
        onBackspace={noop}
        onClear={noop}
        onArmQty={noop}
        onAdd={noop}
      />
    );
    expect(screen.queryByTestId('keypad-multiplier')).not.toBeInTheDocument();
  });

  test('disabled=true disables every button', () => {
    render(
      <CheckoutKeypad
        state={{ buffer: '', multiplier: null }}
        disabled={true}
        onDigit={noop}
        onBackspace={noop}
        onClear={noop}
        onArmQty={noop}
        onAdd={noop}
      />
    );
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled();
    }
  });

  test('clicking a digit button calls onDigit with that digit', async () => {
    const user = userEvent.setup();
    const onDigit = vi.fn();
    render(
      <CheckoutKeypad
        state={{ buffer: '', multiplier: null }}
        disabled={false}
        onDigit={onDigit}
        onBackspace={noop}
        onClear={noop}
        onArmQty={noop}
        onAdd={noop}
      />
    );
    await user.click(screen.getByRole('button', { name: '7' }));
    expect(onDigit).toHaveBeenCalledWith('7');
  });

  test('clicking Clear/Backspace/× Qty/Add fires the matching callback', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    const onBackspace = vi.fn();
    const onArmQty = vi.fn();
    const onAdd = vi.fn();
    render(
      <CheckoutKeypad
        state={{ buffer: '', multiplier: null }}
        disabled={false}
        onDigit={noop}
        onBackspace={onBackspace}
        onClear={onClear}
        onArmQty={onArmQty}
        onAdd={onAdd}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    await user.click(screen.getByRole('button', { name: 'Backspace' }));
    await user.click(screen.getByRole('button', { name: '× Qty' }));
    await user.click(screen.getByRole('button', { name: 'Add (PLU)' }));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onBackspace).toHaveBeenCalledTimes(1);
    expect(onArmQty).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  test('every button has type="button" (no implicit form submit)', () => {
    render(
      <CheckoutKeypad
        state={{ buffer: '', multiplier: null }}
        disabled={false}
        onDigit={noop}
        onBackspace={noop}
        onClear={noop}
        onArmQty={noop}
        onAdd={noop}
      />
    );
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveAttribute('type', 'button');
    }
  });

  test('the section carries the data-testid and an aria-label from i18n', () => {
    render(
      <CheckoutKeypad
        state={{ buffer: '', multiplier: null }}
        disabled={false}
        onDigit={noop}
        onBackspace={noop}
        onClear={noop}
        onArmQty={noop}
        onAdd={noop}
      />
    );
    const section = screen.getByTestId('checkout-keypad');
    expect(section).toHaveAttribute('aria-label', 'Keypad');
  });
});
