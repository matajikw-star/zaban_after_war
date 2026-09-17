/**
 * Every tunable number of the engine, in one place.
 *
 * The values are ADR-0019 (the 10m/1d/2d/4d/8d ladder, elapsed-interval promotion, and an
 * unlimited queue) as restated in `docs/spec/what.md` §5.1. They are tuned by running
 * `tools/simulate` and reading its output — never edited in place to fix one screen.
 */

import type { Params } from './types.ts';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_PARAMS: Params = {
  // Minimum time to conquer a word: 1 + 2 + 4 = 7 days from the first review (ADR-0019).
  intervalsMs: {
    1: 10 * MINUTE_MS,
    2: 1 * DAY_MS,
    3: 2 * DAY_MS,
    4: 4 * DAY_MS,
    5: 8 * DAY_MS,
  },
  suppressionWindow: 8,
  boxDrawFactor: { 1: 1.5, 2: 1.3, 3: 1.15, 4: 1.0, 5: 0.6 },
  newWordsFloorDivisor: 6,
  newWordsCapMultiplier: 2,
  minDuePool: 10,
  streakMinFraction: 0.3,
  accuracyWindowDays: 7,
  defaultAccuracy: 0.8,
  freePresentationLimit: 100,
};
