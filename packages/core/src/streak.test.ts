import { describe, expect, it } from 'vitest';
import { DAY_MS, dayKey, dayStart } from './day.ts';
import { fold } from './fold.ts';
import { DEFAULT_PARAMS } from './params.ts';
import { STREAK_MIN_PRESENTATIONS, streak } from './streak.ts';
import type { ReviewEvent } from './types.ts';

const P = DEFAULT_PARAMS;
/** Tehran noon on day D, so "now" is never on a boundary. */
const NOW = Date.UTC(2026, 2, 21, 8, 30, 0, 0);
const TODAY = dayKey(NOW);
const GOAL = 200; // threshold = max(10, ceil(200 × 0.3)) = 60

let minted = 0;
/** `count` presentations spread over one Tehran day, a minute apart. */
function dayOfStudy(dayOffset: number, count: number): ReviewEvent[] {
  const start = dayStart(TODAY + dayOffset) + 60_000;
  const events: ReviewEvent[] = [];
  for (let i = 0; i < count; i += 1) {
    minted += 1;
    events.push({
      id: `e${minted}`,
      itemId: `w${i}`,
      at: start + i * 60_000,
      kind: 'review',
      grade: 1,
      device: 'dev-1',
    });
  }
  return events;
}

describe('streak', () => {
  it('is zero on an empty log', () => {
    expect(streak(fold([], P), GOAL, NOW, P)).toEqual({ days: 0, todayCounts: false });
  });

  it('counts today once the threshold is met', () => {
    const result = streak(fold(dayOfStudy(0, 60), P), GOAL, NOW, P);
    expect(result).toEqual({ days: 1, todayCounts: true });
  });

  it('does not count a day that falls one presentation short', () => {
    const result = streak(fold(dayOfStudy(0, 59), P), GOAL, NOW, P);
    expect(result).toEqual({ days: 0, todayCounts: false });
  });

  it('keeps the streak alive when only yesterday counts', () => {
    const events = [...dayOfStudy(-2, 60), ...dayOfStudy(-1, 60), ...dayOfStudy(0, 3)];
    const result = streak(fold(events, P), GOAL, NOW, P);
    expect(result).toEqual({ days: 2, todayCounts: false });
  });

  it('extends yesterday’s run when today is added', () => {
    const events = [...dayOfStudy(-2, 60), ...dayOfStudy(-1, 60), ...dayOfStudy(0, 60)];
    const result = streak(fold(events, P), GOAL, NOW, P);
    expect(result).toEqual({ days: 3, todayCounts: true });
  });

  it('breaks on a two-day gap', () => {
    // Studied hard until two days ago; nothing yesterday, nothing today.
    const events = [...dayOfStudy(-4, 60), ...dayOfStudy(-3, 60), ...dayOfStudy(-2, 60)];
    const result = streak(fold(events, P), GOAL, NOW, P);
    expect(result).toEqual({ days: 0, todayCounts: false });
  });

  it('counts only the run that reaches today, not an older longer one', () => {
    const events = [
      ...dayOfStudy(-9, 60),
      ...dayOfStudy(-8, 60),
      ...dayOfStudy(-7, 60),
      ...dayOfStudy(-6, 60),
      ...dayOfStudy(-1, 60),
      ...dayOfStudy(0, 60),
    ];
    expect(streak(fold(events, P), GOAL, NOW, P).days).toBe(2);
  });

  it('holds the floor of ten presentations under a tiny goal', () => {
    const tinyGoal = 10; // ceil(10 × 0.3) = 3, so the floor decides
    expect(streak(fold(dayOfStudy(0, 9), P), tinyGoal, NOW, P).days).toBe(0);
    expect(streak(fold(dayOfStudy(0, STREAK_MIN_PRESENTATIONS), P), tinyGoal, NOW, P).days).toBe(1);
  });

  it('measures the day in Tehran, not in UTC', () => {
    // 22:00 Tehran is still today; the same instant is already tomorrow nowhere that matters,
    // but it is *yesterday* in UTC terms on the next boundary. Study late, streak stands.
    const lateNow = dayStart(TODAY) + 22 * 60 * 60 * 1000;
    const events = dayOfStudy(0, 60);
    expect(streak(fold(events, P), GOAL, lateNow, P)).toEqual({ days: 1, todayCounts: true });
    // One millisecond into the next Tehran day, the same log reads as "yesterday only".
    const afterMidnight = dayStart(TODAY + 1) + 1;
    expect(streak(fold(events, P), GOAL, afterMidnight, P)).toEqual({
      days: 1,
      todayCounts: false,
    });
    expect(dayStart(TODAY + 1) - dayStart(TODAY)).toBe(DAY_MS);
  });
});
