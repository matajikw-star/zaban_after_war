import { describe, expect, it } from 'vitest';
import { DAY_MS } from './day.ts';
import { fold } from './fold.ts';
import { DEFAULT_PARAMS } from './params.ts';
import { progress } from './progress.ts';
import type { ContentItem, Grade, ReviewEvent } from './types.ts';

const P = DEFAULT_PARAMS;
const T0 = Date.UTC(2026, 2, 21, 8, 30, 0, 0);

let minted = 0;
function review(itemId: string, at: number, grade: Grade = 1): ReviewEvent {
  minted += 1;
  return { id: `e${minted}`, itemId, at, kind: 'review', grade, device: 'dev-1' };
}

function content(...items: [string, number, number][]): ContentItem[] {
  return items.map(([id, rank, weight]) => ({ id, rank, weight }));
}

/** The fastest path to box 5: four correct answers, each on its due day. */
function conquer(itemId: string): ReviewEvent[] {
  return [
    review(itemId, T0),
    review(itemId, T0 + DAY_MS),
    review(itemId, T0 + 3 * DAY_MS),
    review(itemId, T0 + 7 * DAY_MS),
  ];
}

describe('progress', () => {
  it('is zero on an untouched lexicon', () => {
    const result = progress(fold([], P), content(['alpha', 0, 4], ['beta', 1, 1]));
    expect(result).toEqual({
      percent: 0,
      conquered: 0,
      total: 2,
      weightEarned: 0,
      weightTotal: 5,
    });
  });

  it('weights a conquest by how often the word was tested', () => {
    const items = content(['alpha', 0, 9], ['beta', 1, 1]);
    const result = progress(fold(conquer('alpha'), P), items);
    expect(result.conquered).toBe(1);
    expect(result.weightEarned).toBe(9);
    expect(result.weightTotal).toBe(10);
    expect(result.percent).toBeCloseTo(90);
  });

  it('credits partial progress from the high-water box, not the live box', () => {
    const items = content(['alpha', 0, 5]);
    // Up to box 3, then forgotten back to box 1.
    const events = [
      review('alpha', T0),
      review('alpha', T0 + DAY_MS),
      review('alpha', T0 + 2 * DAY_MS, 0),
    ];
    const result = progress(fold(events, P), items);
    expect(result.percent).toBeCloseTo(60);
    expect(result.conquered).toBe(0);
  });

  it('never decreases when more events arrive', () => {
    const items = content(['alpha', 0, 3], ['beta', 1, 2]);
    const conquered = conquer('alpha');
    const before = progress(fold(conquered, P), items).percent;
    const after = progress(
      fold([...conquered, review('alpha', T0 + 20 * DAY_MS, 0)], P),
      items,
    ).percent;
    expect(after).toBeGreaterThanOrEqual(before);
  });

  it('never moves the percentage for a weight-0 context word', () => {
    const items = content(['alpha', 0, 4], ['context', 1, 0]);
    const withoutContext = progress(fold(conquer('alpha'), P), items);
    const withContext = progress(fold([...conquer('alpha'), ...conquer('context')], P), items);
    expect(withoutContext.percent).toBe(100);
    expect(withContext.percent).toBe(100);
    expect(withContext.weightEarned).toBe(withoutContext.weightEarned);
    // It is still counted as a conquered card, because the user did conquer it.
    expect(withContext.conquered).toBe(2);
    expect(withContext.total).toBe(2);
  });

  it('reports 0 % rather than NaN when every word is context-only', () => {
    const items = content(['context', 0, 0]);
    const result = progress(fold(conquer('context'), P), items);
    expect(result.percent).toBe(0);
    expect(result.weightTotal).toBe(0);
  });

  it('ignores events for words the content package does not carry', () => {
    const items = content(['alpha', 0, 1]);
    const result = progress(fold(conquer('ghost'), P), items);
    expect(result.percent).toBe(0);
    expect(result.total).toBe(1);
  });
});
