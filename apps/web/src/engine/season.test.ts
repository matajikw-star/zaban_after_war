import type { ContentItem, Fold, ItemState } from '@kl/core';
import { describe, expect, it } from 'vitest';
import { seasonAlreadyShown, seasonReached, seasonStats } from './season.ts';

function state(overrides: Partial<ItemState> = {}): ItemState {
  return {
    itemId: 'w',
    box: 1,
    highWaterBox: 1,
    lastReviewedAt: 0,
    dueAt: 0,
    reviewCount: 1,
    lapseCount: 0,
    ...overrides,
  };
}

describe('seasonReached', () => {
  it('is false when there is no exam date', () => {
    expect(seasonReached(null, Date.UTC(2026, 0, 1))).toBe(false);
  });

  it('is false while the exam date is still ahead', () => {
    expect(seasonReached(Date.UTC(2026, 5, 1), Date.UTC(2026, 0, 1))).toBe(false);
  });

  it('is true once the exam date has passed', () => {
    expect(seasonReached(Date.UTC(2026, 0, 1), Date.UTC(2026, 5, 1))).toBe(true);
  });
});

describe('seasonAlreadyShown', () => {
  it('is false with no exam date', () => {
    expect(seasonAlreadyShown(null, null)).toBe(false);
  });

  it('is false when shownFor does not match the current exam date', () => {
    expect(seasonAlreadyShown(100, 50)).toBe(false);
  });

  it('is true when shownFor matches the current exam date exactly', () => {
    expect(seasonAlreadyShown(100, 100)).toBe(true);
  });
});

describe('seasonStats', () => {
  it('counts conquered items, days with any presentation, and total presentations', () => {
    const fold: Fold = {
      items: new Map([
        ['apple', state({ itemId: 'apple', highWaterBox: 5 })],
        ['banana', state({ itemId: 'banana', highWaterBox: 3 })],
      ]),
      byDay: new Map([
        [100, { presentations: 5, correct: 4, conquered: 1, introduced: 2 }],
        [101, { presentations: 0, correct: 0, conquered: 0, introduced: 0 }],
        [102, { presentations: 3, correct: 3, conquered: 0, introduced: 0 }],
      ]),
      lastEventAt: 0,
    };
    const content: ContentItem[] = [
      { id: 'apple', rank: 1, weight: 3 },
      { id: 'banana', rank: 2, weight: 1 },
      { id: 'cherry', rank: 3, weight: 1 },
    ];

    expect(seasonStats(fold, content)).toEqual({
      conquered: 1,
      daysStudied: 2,
      presentations: 8,
    });
  });

  it('is all zero for an empty fold', () => {
    const fold: Fold = { items: new Map(), byDay: new Map(), lastEventAt: 0 };
    expect(seasonStats(fold, [])).toEqual({ conquered: 0, daysStudied: 0, presentations: 0 });
  });
});
