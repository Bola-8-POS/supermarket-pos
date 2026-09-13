/**
 * useKeypadBuffer — pure reducer + hook backing the tap-only checkout
 * keypad (Task 6). Digits accumulate into a PLU/barcode buffer; `armQty`
 * converts a valid buffer into a "next item" quantity multiplier.
 *
 * Deliberately no keyboard-event wiring here (or anywhere in this feature):
 * the checkout page already has a global timing-based barcode-scanner
 * keydown listener (useBarcodeScanner) and an auto-focused search input —
 * a keypad that also listens for/emits key events would collide with both.
 * Every state change is driven by explicit button taps only.
 */
import { useReducer } from 'react';

export const KEYPAD_MAX_LEN = 13;
export const QTY_MIN = 1;
export const QTY_MAX = 99;

export interface KeypadState {
  buffer: string;
  multiplier: number | null;
}

export type KeypadAction =
  | { type: 'digit'; digit: string } // '0'-'9' only; others ignored
  | { type: 'backspace' }
  | { type: 'clear' }
  | { type: 'armQty' } // buffer -> multiplier if int in [QTY_MIN, QTY_MAX]; else unchanged
  | { type: 'consumeMultiplier' } // multiplier -> null (after an add)
  | { type: 'consumeBuffer' }; // buffer -> '' (after Add/PLU)

const initialState: KeypadState = { buffer: '', multiplier: null };

/** Pure helper used by the UI to decide whether armQty will be rejected. */
export function parseQty(buffer: string): number | null {
  if (!/^\d+$/.test(buffer)) return null;
  const value = Number(buffer);
  return value >= QTY_MIN && value <= QTY_MAX ? value : null;
}

export function keypadReducer(state: KeypadState, action: KeypadAction): KeypadState {
  switch (action.type) {
    case 'digit': {
      if (!/^[0-9]$/.test(action.digit)) return state;
      const nextBuffer = state.buffer === '0' ? action.digit : state.buffer + action.digit;
      if (nextBuffer.length > KEYPAD_MAX_LEN) return state;
      return { ...state, buffer: nextBuffer };
    }
    case 'backspace':
      return { ...state, buffer: state.buffer.slice(0, -1) };
    case 'clear':
      return { ...state, buffer: '' };
    case 'armQty': {
      const qty = parseQty(state.buffer);
      if (qty === null) return state;
      return { buffer: '', multiplier: qty };
    }
    case 'consumeMultiplier':
      return { ...state, multiplier: null };
    case 'consumeBuffer':
      return { ...state, buffer: '' };
    default:
      return state;
  }
}

export function useKeypadBuffer(): {
  state: KeypadState;
  pressDigit: (d: string) => void;
  backspace: () => void;
  clear: () => void;
  armQty: () => boolean;
  takeMultiplier: () => number;
  takeBuffer: () => string;
} {
  const [state, dispatch] = useReducer(keypadReducer, initialState);

  return {
    state,
    pressDigit: d => {
      dispatch({ type: 'digit', digit: d });
    },
    backspace: () => {
      dispatch({ type: 'backspace' });
    },
    clear: () => {
      dispatch({ type: 'clear' });
    },
    armQty: () => {
      if (parseQty(state.buffer) === null) return false;
      dispatch({ type: 'armQty' });
      return true;
    },
    takeMultiplier: () => {
      const multiplier = state.multiplier ?? 1;
      dispatch({ type: 'consumeMultiplier' });
      return multiplier;
    },
    takeBuffer: () => {
      const buffer = state.buffer;
      dispatch({ type: 'consumeBuffer' });
      return buffer;
    },
  };
}
