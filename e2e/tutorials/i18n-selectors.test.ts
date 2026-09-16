import { describe, expect, it } from 'vitest';

import { selectProductRe } from './i18n-selectors';

describe('selectProductRe', () => {
  it('matches both the en-US and es-MX rendered strings', () => {
    const re = selectProductRe("Haldiram's Aloo Bhujia 200g");
    expect(re.test("Select Haldiram's Aloo Bhujia 200g, Regular price")).toBe(true);
    expect(re.test("Seleccionar Haldiram's Aloo Bhujia 200g, precio regular")).toBe(true);
  });

  it('escapes regex-special characters in the product name without throwing', () => {
    expect(() => selectProductRe('Combo (3x2)')).not.toThrow();
    const re = selectProductRe('Combo (3x2)');
    expect(re.test('Select Combo (3x2), Regular price')).toBe(true);
  });
});
