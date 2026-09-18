/**
 * The 30-day bar chart on `/progress` (`what.md` §7.8): one bar per Tehran-local day.
 *
 * Pure by design — a function of `Fold` and `now`, nothing else — so the SVG layout in
 * `screens/progress/Progress.tsx` has a derivation it can test without mounting React or
 * touching the live fold cache. `currentChartData` is the one line that binds it to the cache.
 */

import { dayKey, type Fold } from '@kl/core';
import { now } from './clock.ts';
import { currentFold } from './fold-cache.ts';

export interface ChartDay {
  readonly key: number;
  readonly presentations: number;
  readonly isToday: boolean;
}

/** The last `days` Tehran-local days, oldest first, today included and last. */
export function chartData(fold: Fold, at: number, days = 30): readonly ChartDay[] {
  const today = dayKey(at);
  const out: ChartDay[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const key = today - i;
    out.push({
      key,
      presentations: fold.byDay.get(key)?.presentations ?? 0,
      isToday: key === today,
    });
  }
  return out;
}

export function currentChartData(days = 30): readonly ChartDay[] {
  return chartData(currentFold(), now(), days);
}
