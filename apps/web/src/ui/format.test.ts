import { describe, expect, it } from 'vitest';
import { faNumber, faPercent } from './format.ts';

describe('faNumber', () => {
  it('writes Persian digits', () => {
    expect(faNumber(0)).toBe('۰');
    expect(faNumber(7)).toBe('۷');
    expect(faNumber(1402)).toBe('۱٬۴۰۲');
  });

  it('groups thousands with the Persian separator, not a comma', () => {
    expect(faNumber(1234567)).toBe('۱٬۲۳۴٬۵۶۷');
    expect(faNumber(1234567)).not.toContain(',');
  });

  it('keeps a negative sign', () => {
    expect(faNumber(-5)).toBe('‎−۵');
  });

  it('prints an em dash for a number that is not one', () => {
    expect(faNumber(Number.NaN)).toBe('—');
    expect(faNumber(Number.POSITIVE_INFINITY)).toBe('—');
  });

  it('has no Latin digit anywhere in its output', () => {
    for (const value of [0, 9, 10, 99, 100, 2098, 52467]) {
      expect(faNumber(value)).not.toMatch(/[0-9]/);
    }
  });
});

describe('faPercent', () => {
  it('appends the Persian percent sign', () => {
    expect(faPercent(63)).toBe('۶۳٪');
    expect(faPercent(0)).toBe('۰٪');
    expect(faPercent(100)).toBe('۱۰۰٪');
  });

  it('rounds rather than truncating', () => {
    expect(faPercent(62.4)).toBe('۶۲٪');
    expect(faPercent(62.5)).toBe('۶۳٪');
  });

  it('prints an em dash for a number that is not one', () => {
    expect(faPercent(Number.NaN)).toBe('—');
  });
});
