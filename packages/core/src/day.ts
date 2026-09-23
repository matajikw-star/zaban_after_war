/**
 * Tehran-local days.
 *
 * Tehran is a fixed UTC+03:30 — Iran abolished DST in 2022 — so a day is arithmetic, not a
 * timezone database lookup. Streaks, the introduction budget and the accuracy window all count
 * in these days, which is what makes "today" mean the same thing on every device.
 */

import type { DayKey } from './types.ts';

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Fixed +03:30. No DST since 2022, so there is nothing to look up. */
export const TEHRAN_OFFSET_MS = 3.5 * 60 * 60 * 1000;

/** The Tehran-local day an instant falls in. Days before the epoch give negative keys. */
export function dayKey(at: number): DayKey {
  return Math.floor((at + TEHRAN_OFFSET_MS) / DAY_MS);
}

/** The instant a Tehran-local day begins, i.e. 00:00 +03:30. Inverse of `dayKey`. */
export function dayStart(key: DayKey): number {
  return key * DAY_MS - TEHRAN_OFFSET_MS;
}
