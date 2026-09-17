/**
 * The pace estimate: will this user finish before the exam at the goal they picked?
 *
 * It counts box steps, not words: a word at box 3 needs two more promotions, an unseen word
 * five. The exam date feeds nothing but this estimate — it never changes an interval (ADR-0019).
 */

import { dayKey } from './day.ts';
import type { ContentItem, Fold, Params } from './types.ts';

export interface PaceEstimate {
  readonly remainingSteps: number;
  readonly stepsPerDay: number;
  readonly daysNeeded: number;
  readonly daysLeft: number;
  readonly verdict: 'ahead' | 'ok' | 'behind';
}

const CONQUERED_BOX = 5;

/**
 * Not every correct answer promotes: answers given before the interval elapses change nothing
 * (§5.2), so the raw goal overstates the schedule's progress. 0.9 is the haircut.
 */
export const EARLY_ANSWER_FACTOR = 0.9;

const BEHIND_RATIO = 1.1;
const AHEAD_RATIO = 0.7;

/** Correct ÷ presentations over the last `accuracyWindowDays` Tehran days, today included. */
export function recentAccuracy(fold: Fold, now: number, params: Params): number {
  const today = dayKey(now);
  let presentations = 0;
  let correct = 0;
  for (let key = today - (params.accuracyWindowDays - 1); key <= today; key += 1) {
    const day = fold.byDay.get(key);
    if (day === undefined) continue;
    presentations += day.presentations;
    correct += day.correct;
  }
  if (presentations === 0) return params.defaultAccuracy;
  return correct / presentations;
}

export function paceEstimate(
  fold: Fold,
  content: readonly ContentItem[],
  dailyGoal: number,
  examDate: number,
  now: number,
  params: Params,
): PaceEstimate {
  let remainingSteps = 0;
  for (const item of content) {
    // Context-only words are not part of the exam-value target, so they are not part of the work.
    if (item.weight <= 0) continue;
    const state = fold.items.get(item.id);
    remainingSteps += state === undefined ? CONQUERED_BOX : CONQUERED_BOX - state.highWaterBox;
  }

  const stepsPerDay = dailyGoal * recentAccuracy(fold, now, params) * EARLY_ANSWER_FACTOR;
  // Whole Tehran days between now and the exam; a past exam date leaves zero, never negative.
  const daysLeft = Math.max(0, dayKey(examDate) - dayKey(now));

  let daysNeeded: number;
  if (remainingSteps === 0) daysNeeded = 0;
  else if (stepsPerDay > 0) daysNeeded = Math.ceil(remainingSteps / stepsPerDay);
  else daysNeeded = Number.POSITIVE_INFINITY;

  let verdict: PaceEstimate['verdict'] = 'ok';
  if (daysNeeded > daysLeft * BEHIND_RATIO) verdict = 'behind';
  else if (daysNeeded < daysLeft * AHEAD_RATIO) verdict = 'ahead';

  return { remainingSteps, stepsPerDay, daysNeeded, daysLeft, verdict };
}
