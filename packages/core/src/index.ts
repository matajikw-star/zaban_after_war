/**
 * The package root — the only barrel in this repo (`what.md` §17.1).
 *
 * Everything the app is allowed to know about the SRS engine is re-exported here, and nothing in
 * this package imports React, the DOM, the network or the clock: `now` and `rng` are parameters.
 */

export { DAY_MS, dayKey, dayStart, TEHRAN_OFFSET_MS } from './day.ts';
export { fold, isConquered } from './fold.ts';
export { goalFromMinutes, ONBOARDING_MINUTES } from './goal.ts';
export { EARLY_ANSWER_FACTOR, type PaceEstimate, paceEstimate, recentAccuracy } from './pace.ts';
export { DEFAULT_PARAMS } from './params.ts';
export { type Progress, progress } from './progress.ts';
export {
  BOXES,
  type BoxCounts,
  boxCounts,
  type CardSource,
  dueCounts,
  type IntroductionBudget,
  introductionBudget,
  type NextCard,
  nextCard,
} from './queue.ts';
export { STREAK_MIN_PRESENTATIONS, type Streak, streak } from './streak.ts';
export type {
  Box,
  ContentItem,
  DayKey,
  DayStats,
  Fold,
  Grade,
  ItemId,
  ItemState,
  Params,
  ReviewEvent,
  ReviewEventKind,
} from './types.ts';
