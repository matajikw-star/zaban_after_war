/**
 * Relative time in Persian, everywhere a due date or a past event needs one sentence
 * (`what.md` §7.8, §7.9). Persian digits go through `format.ts`'s `faNumber`, never a literal;
 * the words around them are `strings.relativeTime` (§17.5).
 *
 * Buckets on magnitude only: under a minute either way reads as "now", then minutes, hours and
 * days, each direction with its own suffix. The boxes screen additionally treats "due in the
 * past" as `الان` rather than "N days ago" — that is the caller's call (a card overdue by three
 * days is due *now*, not three days late), so it stays out of this general-purpose helper.
 */

import { strings } from '../strings.ts';
import { faNumber } from './format.ts';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** `الان` — within a minute of `now`, in either direction. */
export const NOW_LABEL = strings.relativeTime.now;

/** `target` relative to `now`, both epoch ms. Positive is the future, negative is the past. */
export function relativeTime(target: number, now: number): string {
  const diff = target - now;
  const abs = Math.abs(diff);
  const copy = strings.relativeTime;

  if (abs < MINUTE_MS) return NOW_LABEL;

  if (diff > 0) {
    if (diff < HOUR_MS) return copy.minutesAhead(faNumber(Math.floor(diff / MINUTE_MS)));
    if (diff < DAY_MS) return copy.hoursAhead(faNumber(Math.floor(diff / HOUR_MS)));
    return copy.daysAhead(faNumber(Math.floor(diff / DAY_MS)));
  }

  if (abs < HOUR_MS) return copy.minutesAgo(faNumber(Math.floor(abs / MINUTE_MS)));
  if (abs < DAY_MS) return copy.hoursAgo(faNumber(Math.floor(abs / HOUR_MS)));
  return copy.daysAgo(faNumber(Math.floor(abs / DAY_MS)));
}
