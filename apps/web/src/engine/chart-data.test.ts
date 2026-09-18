import type { Fold } from '@kl/core';
import { dayKey } from '@kl/core';
import { describe, expect, it } from 'vitest';
import { chartData } from './chart-data.ts';

function foldWithDays(at: number, presentationsByOffset: Record<number, number>): Fold {
  const today = dayKey(at);
  const byDay = new Map();
  for (const [offset, presentations] of Object.entries(presentationsByOffset)) {
    byDay.set(today - Number(offset), { presentations, correct: 0, conquered: 0, introduced: 0 });
  }
  return { items: new Map(), byDay, lastEventAt: at };
}

describe('chartData', () => {
  const now = Date.UTC(2026, 8, 18, 12, 0, 0);

  it('returns exactly `days` entries, oldest first, today last', () => {
    const fold = foldWithDays(now, {});
    const days = chartData(fold, now, 30);
    expect(days).toHaveLength(30);
    expect(days[29]?.isToday).toBe(true);
    expect(days.slice(0, 29).every((d) => !d.isToday)).toBe(true);
    // strictly ascending keys, one apart
    const ascending = days.reduce<{ ok: boolean; prev: number | null }>(
      (acc, day) => ({
        ok: acc.ok && (acc.prev === null || day.key === acc.prev + 1),
        prev: day.key,
      }),
      { ok: true, prev: null },
    );
    expect(ascending.ok).toBe(true);
  });

  it('reads presentations from the fold for days that have them, 0 otherwise', () => {
    const fold = foldWithDays(now, { 0: 12, 1: 5, 3: 20 });
    const days = chartData(fold, now, 5);
    // offsets 0..4 back from today: [4,3,2,1,0] in that order (oldest first)
    expect(days.map((d) => d.presentations)).toEqual([0, 20, 0, 5, 12]);
  });

  it('defaults to 30 days when not given a count', () => {
    const fold = foldWithDays(now, {});
    expect(chartData(fold, now)).toHaveLength(30);
  });

  it('supports a custom day count', () => {
    const fold = foldWithDays(now, {});
    expect(chartData(fold, now, 7)).toHaveLength(7);
  });
});
