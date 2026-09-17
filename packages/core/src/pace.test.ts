import { describe, expect, it } from 'vitest';
import { DAY_MS, dayKey, dayStart } from './day.ts';
import { fold } from './fold.ts';
import { EARLY_ANSWER_FACTOR, paceEstimate, recentAccuracy } from './pace.ts';
import { DEFAULT_PARAMS } from './params.ts';
import type { ContentItem, Grade, ReviewEvent } from './types.ts';

const P = DEFAULT_PARAMS;
const NOW = Date.UTC(2026, 2, 21, 8, 30, 0, 0);
const TODAY = dayKey(NOW);
const GOAL = 200;

let minted = 0;
function review(itemId: string, at: number, grade: Grade = 1): ReviewEvent {
  minted += 1;
  return { id: `e${minted}`, itemId, at, kind: 'review', grade, device: 'dev-1' };
}

/** `count` answers on a given Tehran day, the first `correct` of them right. */
function dayOfStudy(dayOffset: number, count: number, correct: number): ReviewEvent[] {
  const start = dayStart(TODAY + dayOffset) + 60_000;
  const events: ReviewEvent[] = [];
  for (let i = 0; i < count; i += 1) {
    events.push(review(`w${i}`, start + i * 1000, i < correct ? 1 : 0));
  }
  return events;
}

function content(count: number, weight = 1): ContentItem[] {
  return Array.from({ length: count }, (_unused, index) => ({
    id: `alpha${index}`,
    rank: index,
    weight,
  }));
}

describe('paceEstimate — with no history', () => {
  it('assumes the default accuracy', () => {
    const items = content(10);
    const examDate = NOW + 30 * DAY_MS;
    const result = paceEstimate(fold([], P), items, GOAL, examDate, NOW, P);
    expect(result.remainingSteps).toBe(50);
    expect(result.stepsPerDay).toBeCloseTo(GOAL * P.defaultAccuracy * EARLY_ANSWER_FACTOR);
    expect(result.daysNeeded).toBe(1);
    expect(result.daysLeft).toBe(30);
    expect(result.verdict).toBe('ahead');
  });

  it('reads the accuracy off the last seven Tehran days, and no further back', () => {
    const inWindow = fold(dayOfStudy(-6, 10, 5), P);
    expect(recentAccuracy(inWindow, NOW, P)).toBeCloseTo(0.5);
    const outOfWindow = fold(dayOfStudy(-7, 10, 5), P);
    expect(recentAccuracy(outOfWindow, NOW, P)).toBe(P.defaultAccuracy);
  });

  it('averages the window rather than taking the last day', () => {
    const events = [...dayOfStudy(-1, 10, 10), ...dayOfStudy(0, 10, 0)];
    expect(recentAccuracy(fold(events, P), NOW, P)).toBeCloseTo(0.5);
  });
});

describe('paceEstimate — the work remaining', () => {
  it('counts five steps for an unseen word and the gap to 5 for a seen one', () => {
    const items = content(3);
    const events = [review('alpha0', NOW - 10 * DAY_MS), review('alpha1', NOW - 10 * DAY_MS)];
    // alpha0 and alpha1 sit at box 2 (one step taken each), alpha2 is unseen.
    const result = paceEstimate(fold(events, P), items, GOAL, NOW + DAY_MS, NOW, P);
    expect(result.remainingSteps).toBe(3 + 3 + 5);
  });

  it('ignores context-only words, which are not part of the target', () => {
    const items: ContentItem[] = [
      { id: 'alpha', rank: 0, weight: 4 },
      { id: 'context', rank: 1, weight: 0 },
    ];
    const result = paceEstimate(fold([], P), items, GOAL, NOW + DAY_MS, NOW, P);
    expect(result.remainingSteps).toBe(5);
  });

  it('is finished work when everything is conquered', () => {
    const items = content(1);
    const events = [
      review('alpha0', NOW - 8 * DAY_MS),
      review('alpha0', NOW - 7 * DAY_MS),
      review('alpha0', NOW - 5 * DAY_MS),
      review('alpha0', NOW - DAY_MS),
    ];
    const result = paceEstimate(fold(events, P), items, GOAL, NOW + 10 * DAY_MS, NOW, P);
    expect(result.remainingSteps).toBe(0);
    expect(result.daysNeeded).toBe(0);
  });
});

describe('paceEstimate — the verdict', () => {
  const items = content(500);

  it('says behind when the work needs more than 110 % of the days left', () => {
    // 2500 steps at 200 × 0.8 × 0.9 = 144 steps/day → 18 days needed.
    const result = paceEstimate(fold([], P), items, GOAL, NOW + 16 * DAY_MS, NOW, P);
    expect(result.daysNeeded).toBe(18);
    expect(result.daysLeft).toBe(16);
    expect(result.verdict).toBe('behind');
  });

  it('says ok inside the band', () => {
    const result = paceEstimate(fold([], P), items, GOAL, NOW + 20 * DAY_MS, NOW, P);
    expect(result.verdict).toBe('ok');
  });

  it('says ahead when the work needs less than 70 % of the days left', () => {
    const result = paceEstimate(fold([], P), items, GOAL, NOW + 40 * DAY_MS, NOW, P);
    expect(result.verdict).toBe('ahead');
  });

  it('counts whole Tehran days to the exam and never goes negative', () => {
    const past = paceEstimate(fold([], P), items, GOAL, NOW - 5 * DAY_MS, NOW, P);
    expect(past.daysLeft).toBe(0);
    expect(past.verdict).toBe('behind');
    // Same Tehran day: zero days left, however many hours remain.
    const sameDay = paceEstimate(fold([], P), items, GOAL, NOW + 6 * 60 * 60 * 1000, NOW, P);
    expect(sameDay.daysLeft).toBe(0);
  });

  it('needs an infinity of days when the goal is zero, and says ok when nothing is left', () => {
    const stalled = paceEstimate(fold([], P), items, 0, NOW + DAY_MS, NOW, P);
    expect(stalled.stepsPerDay).toBe(0);
    expect(stalled.daysNeeded).toBe(Number.POSITIVE_INFINITY);
    expect(stalled.verdict).toBe('behind');
    const nothingLeft = paceEstimate(fold([], P), [], 0, NOW, NOW, P);
    expect(nothingLeft.daysNeeded).toBe(0);
    expect(nothingLeft.daysLeft).toBe(0);
    expect(nothingLeft.verdict).toBe('ok');
  });
});
