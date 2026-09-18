/**
 * Relative time in Persian, everywhere a due date or a past event needs one sentence
 * (`what.md` §7.8, §7.9). Persian digits go through `format.ts`'s `faNumber`, never a literal.
 *
 * Buckets on magnitude only: under a minute either way reads as "now", then minutes, hours and
 * days, each direction with its own suffix. The boxes screen additionally treats "due in the
 * past" as `الان` rather than "N days ago" — that is the caller's call (a card overdue by three
 * days is due *now*, not three days late), so it stays out of this general-purpose helper.
 */

import { faNumber } from './format.ts';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** `الان` — within a minute of `now`, in either direction. */
export const NOW_LABEL = 'الان';

/** `target` relative to `now`, both epoch ms. Positive is the future, negative is the past. */
export function relativeTime(target: number, now: number): string {
  const diff = target - now;
  const abs = Math.abs(diff);

  if (abs < MINUTE_MS) return NOW_LABEL;

  if (diff > 0) {
    if (diff < HOUR_MS) return `${faNumber(Math.floor(diff / MINUTE_MS))} دقیقه دیگر`;
    if (diff < DAY_MS) return `${faNumber(Math.floor(diff / HOUR_MS))} ساعت دیگر`;
    return `${faNumber(Math.floor(diff / DAY_MS))} روز دیگر`;
  }

  if (abs < HOUR_MS) return `${faNumber(Math.floor(abs / MINUTE_MS))} دقیقه پیش`;
  if (abs < DAY_MS) return `${faNumber(Math.floor(abs / HOUR_MS))} ساعت پیش`;
  return `${faNumber(Math.floor(abs / DAY_MS))} روز پیش`;
}
