/**
 * Two direct reads off the cached fold that the review loop needs and `engine/index.ts` does
 * not bind, because neither is a `@kl/core` function: they are one-line projections of the
 * `Fold` the app already holds.
 *
 * Both are snapshots. The review loop calls `itemBox` once before `recordReview` and once after
 * to print «جعبهٔ ۱ ← جعبهٔ ۲», and `totalPresentations` on the same two sides to see which of
 * §8.4's thresholds the answer crossed.
 */

import type { Box, ItemId } from '@kl/core';
import { currentFold } from './fold-cache.ts';

/** The live schedule box, or `null` for a word the log has never touched. */
export function itemBox(itemId: ItemId): Box | null {
  return currentFold().items.get(itemId)?.box ?? null;
}

/** Every recorded answer, all days, all devices — the number §8.4's beacons count. */
export function totalPresentations(): number {
  let total = 0;
  for (const day of currentFold().byDay.values()) total += day.presentations;
  return total;
}
