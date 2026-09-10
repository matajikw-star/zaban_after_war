import { describe, expect, it } from 'vitest';
import { BOX_INTERVALS_MS, FIRST_BOX, MASTERED_BOX, nextBox } from './types.ts';

describe('nextBox', () => {
  it('promotes one box on remembered', () => {
    expect(nextBox(1, 1)).toBe(2);
    expect(nextBox(4, 1)).toBe(5);
  });

  it('holds at the mastered box rather than overflowing', () => {
    expect(nextBox(MASTERED_BOX, 1)).toBe(MASTERED_BOX);
  });

  it('drops to the first box on forgot, from anywhere', () => {
    expect(nextBox(5, 0)).toBe(FIRST_BOX);
    expect(nextBox(2, 0)).toBe(FIRST_BOX);
  });
});

describe('BOX_INTERVALS_MS', () => {
  it('grows strictly with the box number', () => {
    const intervals = [1, 2, 3, 4, 5].map((b) => BOX_INTERVALS_MS[b as 1 | 2 | 3 | 4 | 5]);
    for (let i = 1; i < intervals.length; i++) {
      expect(intervals[i]).toBeGreaterThan(intervals[i - 1] as number);
    }
  });
});
