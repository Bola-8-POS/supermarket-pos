import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildVideoOutputPath, resolveHoldMs } from './pacing';

describe('resolveHoldMs', () => {
  it('defaults to 3000ms when no argument is given', () => {
    expect(resolveHoldMs()).toBe(3000);
  });

  it('clamps a value below 2000ms up to 2000ms', () => {
    expect(resolveHoldMs(500)).toBe(2000);
  });

  it('clamps a value above 4000ms down to 4000ms', () => {
    expect(resolveHoldMs(9000)).toBe(4000);
  });

  it('passes an in-range value through unchanged', () => {
    expect(resolveHoldMs(2500)).toBe(2500);
  });
});

describe('buildVideoOutputPath', () => {
  it('builds the raw .webm path from spec file, test title, and locale', () => {
    expect(
      buildVideoOutputPath(
        '/x/e2e/tutorials/checkout/checkout.spec.ts',
        'Cashier completes a cash sale',
        'es-MX'
      )
    ).toBe(
      path.join('e2e-results-tutorials', 'raw', 'checkout', 'cashier-completes-a-cash-sale.es-MX.webm')
    );
  });
});
