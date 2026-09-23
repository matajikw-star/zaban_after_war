import type { ContentItem } from '@kl/core';
import { describe, expect, it } from 'vitest';
import { placementEvent, placementPool } from './placement.ts';

function item(id: string, rank: number): ContentItem {
  return { id, rank, weight: 0 };
}

describe('placementPool', () => {
  it('returns ids sorted by rank ascending', () => {
    const items = [item('c', 3), item('a', 1), item('b', 2)];
    expect(placementPool(items)).toEqual(['a', 'b', 'c']);
  });

  it('defaults to the top 100', () => {
    const items = Array.from({ length: 150 }, (_, i) => item(`w${i}`, i + 1));
    const pool = placementPool(items);
    expect(pool).toHaveLength(100);
    expect(pool[0]).toBe('w0');
    expect(pool[99]).toBe('w99');
  });

  it('respects a smaller limit', () => {
    const items = [item('a', 1), item('b', 2), item('c', 3)];
    expect(placementPool(items, 2)).toEqual(['a', 'b']);
  });

  it('returns everything when there are fewer items than the limit', () => {
    const items = [item('a', 5), item('b', 1)];
    expect(placementPool(items, 100)).toEqual(['b', 'a']);
  });

  it('does not mutate the input array', () => {
    const items = [item('c', 3), item('a', 1), item('b', 2)];
    const copy = items.slice();
    placementPool(items);
    expect(items).toEqual(copy);
  });

  it('returns an empty pool for empty content', () => {
    expect(placementPool([])).toEqual([]);
  });
});

describe('placementEvent', () => {
  it('emits know for بلدم', () => {
    expect(placementEvent('know')).toBe('know');
  });

  it('emits nothing for بلد نیستم', () => {
    expect(placementEvent('dont-know')).toBeNull();
  });
});
