import { act, renderHook } from '@testing-library/react';
import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import {
  KEYPAD_MAX_LEN,
  keypadReducer,
  parseQty,
  QTY_MAX,
  QTY_MIN,
  useKeypadBuffer,
  type KeypadState,
} from './useKeypadBuffer';

const empty: KeypadState = { buffer: '', multiplier: null };

describe('parseQty', () => {
  test('accepts integers within range', () => {
    expect(parseQty('5')).toBe(5);
    expect(parseQty('1')).toBe(1);
    expect(parseQty('99')).toBe(99);
  });

  test('rejects 0, out-of-range, non-digit, and empty strings', () => {
    expect(parseQty('0')).toBeNull();
    expect(parseQty('100')).toBeNull();
    expect(parseQty('')).toBeNull();
    expect(parseQty('1.5')).toBeNull();
    expect(parseQty('-5')).toBeNull();
    expect(parseQty('5a')).toBeNull();
  });
});

describe('keypadReducer', () => {
  test('digit appends to an empty buffer', () => {
    const state = keypadReducer(empty, { type: 'digit', digit: '7' });
    expect(state).toEqual({ buffer: '7', multiplier: null });
  });

  test('digit appends onto an existing non-zero buffer', () => {
    const state = keypadReducer({ buffer: '12', multiplier: null }, { type: 'digit', digit: '3' });
    expect(state.buffer).toBe('123');
  });

  test("a lone '0' buffer is replaced (not appended to) by the next digit", () => {
    const state = keypadReducer({ buffer: '0', multiplier: null }, { type: 'digit', digit: '5' });
    expect(state.buffer).toBe('5');
  });

  test('digit is ignored once buffer is at KEYPAD_MAX_LEN', () => {
    const maxed: KeypadState = { buffer: '1'.repeat(KEYPAD_MAX_LEN), multiplier: null };
    const state = keypadReducer(maxed, { type: 'digit', digit: '9' });
    expect(state).toBe(maxed);
  });

  test('non-digit characters in a digit action are ignored', () => {
    const state = keypadReducer(empty, { type: 'digit', digit: 'a' });
    expect(state).toBe(empty);
  });

  test('backspace removes the last character', () => {
    const state = keypadReducer({ buffer: '12', multiplier: null }, { type: 'backspace' });
    expect(state.buffer).toBe('1');
  });

  test('backspace on an empty buffer stays empty', () => {
    const state = keypadReducer(empty, { type: 'backspace' });
    expect(state.buffer).toBe('');
  });

  test('clear resets the buffer', () => {
    const state = keypadReducer({ buffer: '42', multiplier: 3 }, { type: 'clear' });
    expect(state.buffer).toBe('');
  });

  test.each(['0', '100', ''])('armQty leaves state unchanged for invalid buffer %j', buffer => {
    const input: KeypadState = { buffer, multiplier: null };
    const state = keypadReducer(input, { type: 'armQty' });
    expect(state).toBe(input);
  });

  test('armQty arms the multiplier and clears the buffer for a valid quantity', () => {
    const state = keypadReducer({ buffer: '5', multiplier: null }, { type: 'armQty' });
    expect(state).toEqual({ buffer: '', multiplier: 5 });
  });

  test('consumeMultiplier clears an armed multiplier', () => {
    const state = keypadReducer({ buffer: '', multiplier: 3 }, { type: 'consumeMultiplier' });
    expect(state.multiplier).toBeNull();
  });

  test('consumeBuffer clears the buffer, leaving multiplier untouched', () => {
    const state = keypadReducer({ buffer: '99', multiplier: 2 }, { type: 'consumeBuffer' });
    expect(state).toEqual({ buffer: '', multiplier: 2 });
  });

  test('property: any sequence of digit/backspace actions keeps buffer <= KEYPAD_MAX_LEN and never a multi-char leading zero', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.record({ type: fc.constant('digit' as const), digit: fc.constantFrom(...'0123456789'.split('')) }),
            fc.record({ type: fc.constant('backspace' as const) })
          ),
          { maxLength: 50 }
        ),
        actions => {
          const finalState = actions.reduce(keypadReducer, empty);
          expect(finalState.buffer.length).toBeLessThanOrEqual(KEYPAD_MAX_LEN);
          expect(
            finalState.buffer === '' ||
              finalState.buffer === '0' ||
              !finalState.buffer.startsWith('0')
          ).toBe(true);
        }
      )
    );
  });
});

describe('useKeypadBuffer', () => {
  test('pressDigit, backspace, and clear drive state.buffer', () => {
    const { result } = renderHook(() => useKeypadBuffer());
    expect(result.current.state).toEqual(empty);

    act(() => {
      result.current.pressDigit('4');
    });
    expect(result.current.state.buffer).toBe('4');

    act(() => {
      result.current.pressDigit('2');
    });
    expect(result.current.state.buffer).toBe('42');

    act(() => {
      result.current.backspace();
    });
    expect(result.current.state.buffer).toBe('4');

    act(() => {
      result.current.clear();
    });
    expect(result.current.state.buffer).toBe('');
  });

  test('armQty returns false and does not change state when buffer is invalid', () => {
    const { result } = renderHook(() => useKeypadBuffer());
    act(() => {
      result.current.pressDigit('0');
    });

    let armed = true;
    act(() => {
      armed = result.current.armQty();
    });
    expect(armed).toBe(false);
    expect(result.current.state).toEqual({ buffer: '0', multiplier: null });
  });

  test('armQty returns true and arms the multiplier for a valid buffer', () => {
    const { result } = renderHook(() => useKeypadBuffer());
    act(() => {
      result.current.pressDigit('9');
    });

    let armed = false;
    act(() => {
      armed = result.current.armQty();
    });
    expect(armed).toBe(true);
    expect(result.current.state).toEqual({ buffer: '', multiplier: 9 });
  });

  test('takeMultiplier returns the armed multiplier and clears it, defaulting to 1', () => {
    const { result } = renderHook(() => useKeypadBuffer());
    act(() => {
      result.current.pressDigit('3');
    });
    act(() => {
      result.current.armQty();
    });

    let taken = 0;
    act(() => {
      taken = result.current.takeMultiplier();
    });
    expect(taken).toBe(3);
    expect(result.current.state.multiplier).toBeNull();

    act(() => {
      taken = result.current.takeMultiplier();
    });
    expect(taken).toBe(1);
  });

  test('takeBuffer returns the buffer and clears it', () => {
    const { result } = renderHook(() => useKeypadBuffer());
    act(() => {
      result.current.pressDigit('7');
      result.current.pressDigit('7');
    });

    let taken = '';
    act(() => {
      taken = result.current.takeBuffer();
    });
    expect(taken).toBe('77');
    expect(result.current.state.buffer).toBe('');
  });
});

test('QTY_MIN and QTY_MAX bound the valid armQty range', () => {
  expect(QTY_MIN).toBe(1);
  expect(QTY_MAX).toBe(99);
});
