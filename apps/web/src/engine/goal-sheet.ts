/**
 * When the goal-reached sheet is due (`what.md` §7.8).
 *
 * Once per Tehran day, after the day's presentations reach the profile's goal, and never as a
 * gate: the rule is a pure function so that "why did it show twice" is a test and not an
 * afternoon. `todayKey` is the bound half — the engine's own `dayKey` over `clock.ts`, so the
 * Tehran offset is still defined in exactly one place (§17.7).
 */

import { dayKey } from '@kl/core';
import { now } from './clock.ts';

/** The current Tehran-local day, as `kv.goalSheetShownDay` stores it. */
export function todayKey(): number {
  return dayKey(now());
}

export interface GoalSheetInput {
  readonly presentationsToday: number;
  readonly dailyGoal: number;
  /** `kv.goalSheetShownDay`; `undefined` on a device that has never reached a goal. */
  readonly lastShownDay: number | undefined;
  readonly today: number;
}

export function shouldShowGoalSheet(input: GoalSheetInput): boolean {
  if (input.dailyGoal <= 0) return false;
  if (input.presentationsToday < input.dailyGoal) return false;
  return input.lastShownDay !== input.today;
}
