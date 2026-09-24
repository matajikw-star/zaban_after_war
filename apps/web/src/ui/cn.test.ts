import { describe, expect, it } from 'vitest';
import { cn } from './cn.ts';

describe('cn', () => {
  it('keeps a text colour next to a type-scale size (the invisible-label bug)', () => {
    expect(cn('text-[var(--bg)]', 'text-h6')).toBe('text-[var(--bg)] text-h6');
    expect(cn('text-white', 'text-body-sm')).toBe('text-white text-body-sm');
  });

  it('still lets a later type-scale size replace an earlier one', () => {
    expect(cn('text-body', 'text-caption')).toBe('text-caption');
    expect(cn('text-h6', 'text-body-sm')).toBe('text-body-sm');
  });

  it('still lets a later colour replace an earlier one', () => {
    expect(cn('text-[var(--fg)]', 'text-[var(--fg-muted)]')).toBe('text-[var(--fg-muted)]');
  });
});
