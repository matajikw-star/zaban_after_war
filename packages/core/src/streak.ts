/**
 * The streak: consecutive Tehran-local days on which the user actually studied.
 *
 * A day counts on presentations alone, not on accuracy — the streak rewards showing up. Today
 * not yet counting does not break it: the run may end today or yesterday, so a user opening the
 * app in the morning still sees the streak they earned (§5.3).
 */

import { dayKey } from './day.ts';
import type { Fold, Params } from './types.ts';

export interface Streak {
  readonly days: number;
  /** Whether today has already cleared the threshold. */
  readonly todayCounts: boolean;
}

/**
 * The floor under the fraction, so a tiny goal cannot make one card a study day. It is not in
 * `Params`: §5.1 lists every tunable and this is not one of them.
 */
export const STREAK_MIN_PRESENTATIONS = 10;

function threshold(dailyGoal: number, params: Params): number {
  return Math.max(STREAK_MIN_PRESENTATIONS, Math.ceil(dailyGoal * params.streakMinFraction));
}

export function streak(fold: Fold, dailyGoal: number, now: number, params: Params): Streak {
  const needed = threshold(dailyGoal, params);
  const counts = (key: number): boolean => (fold.byDay.get(key)?.presentations ?? 0) >= needed;

  const today = dayKey(now);
  const todayCounts = counts(today);
  // The run has to end today or yesterday; anything older is a broken streak.
  let cursor = todayCounts ? today : today - 1;
  if (!counts(cursor)) return { days: 0, todayCounts };

  let days = 0;
  while (counts(cursor)) {
    days += 1;
    cursor -= 1;
  }
  return { days, todayCounts };
}
