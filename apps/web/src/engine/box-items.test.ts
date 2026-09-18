import type { ContentItem, Fold, ItemState } from '@kl/core';
import { describe, expect, it } from 'vitest';
import { boxItems } from './box-items.ts';

function state(itemId: string, overrides: Partial<ItemState> = {}): ItemState {
  return {
    itemId,
    box: 1,
    highWaterBox: 1,
    lastReviewedAt: 0,
    dueAt: 0,
    reviewCount: 1,
    lapseCount: 0,
    ...overrides,
  };
}

function foldOf(states: ItemState[]): Fold {
  return { items: new Map(states.map((s) => [s.itemId, s])), byDay: new Map(), lastEventAt: 0 };
}

const content: ContentItem[] = [
  { id: 'apple', rank: 1, weight: 1 },
  { id: 'banana', rank: 2, weight: 1 },
  { id: 'cherry', rank: 3, weight: 1 },
  { id: 'date', rank: 4, weight: 1 },
];

describe('boxItems', () => {
  it('returns only words whose live box matches, ignoring unseen words', () => {
    const fold = foldOf([
      state('apple', { box: 1, dueAt: 300 }),
      state('banana', { box: 2, dueAt: 100 }),
      state('cherry', { box: 1, dueAt: 200 }),
    ]);
    const rows = boxItems(fold, content, 1);
    expect(rows.map((r) => r.itemId)).toEqual(['cherry', 'apple']);
  });

  it('sorts soonest-due first', () => {
    const fold = foldOf([
      state('apple', { box: 3, dueAt: 500 }),
      state('banana', { box: 3, dueAt: 100 }),
      state('cherry', { box: 3, dueAt: 300 }),
    ]);
    const rows = boxItems(fold, content, 3);
    expect(rows.map((r) => r.itemId)).toEqual(['banana', 'cherry', 'apple']);
  });

  it('breaks a due-time tie on item id', () => {
    const fold = foldOf([
      state('cherry', { box: 2, dueAt: 100 }),
      state('banana', { box: 2, dueAt: 100 }),
    ]);
    const rows = boxItems(fold, content, 2);
    expect(rows.map((r) => r.itemId)).toEqual(['banana', 'cherry']);
  });

  it('is empty for a box with nothing in it', () => {
    const fold = foldOf([state('apple', { box: 1 })]);
    expect(boxItems(fold, content, 5)).toEqual([]);
  });

  it('ignores content items the fold has never touched', () => {
    const fold = foldOf([]);
    expect(boxItems(fold, content, 1)).toEqual([]);
  });
});
