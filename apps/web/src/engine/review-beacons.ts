/**
 * Which of §8.4's review beacons a presentation just earned.
 *
 * `first_review`, `reviews_10` and `reviews_100` mark the first time a lifetime total crosses a
 * threshold. "Crosses" and not "equals": a device that pulled a backup jumps from 0 to 400 in
 * one fold, and a naive `total === 10` would never fire. Pure, so the thresholds are a table a
 * test can read rather than three `if`s in the screen.
 */

import type { BeaconName } from '../net/api.ts';

export interface BeaconThreshold {
  readonly at: number;
  readonly name: BeaconName;
}

export const REVIEW_BEACON_THRESHOLDS: readonly BeaconThreshold[] = [
  { at: 1, name: 'first_review' },
  { at: 10, name: 'reviews_10' },
  { at: 100, name: 'reviews_100' },
];

/**
 * The beacons earned by moving the lifetime presentation total from `before` to `after`.
 * Returned in threshold order, and empty when the total did not move forward.
 */
export function beaconsCrossed(before: number, after: number): readonly BeaconName[] {
  if (after <= before) return [];
  return REVIEW_BEACON_THRESHOLDS.filter((t) => before < t.at && after >= t.at).map((t) => t.name);
}
