/**
 * The `/season` trigger and its numbers (`what.md` §7.8).
 *
 * `seasonReached` is a plain date comparison and `seasonStats` folds the whole log into three
 * counts — both pure, both a function of arguments only, so a season is testable without a
 * clock, a store or a router. The "show it once" bit (`kv.seasonShownFor`) is not pure — it is
 * a side effect the home screen owns — so it stays out of this file entirely.
 */

import type { ContentItem, Fold } from '@kl/core';

export interface SeasonStats {
  readonly conquered: number;
  readonly daysStudied: number;
  readonly presentations: number;
}

const CONQUERED_BOX = 5;

/** The exam date has passed. `null` (skipped) is never "reached" — there is nothing to end. */
export function seasonReached(examDate: number | null, now: number): boolean {
  return examDate !== null && examDate < now;
}

/** Whether the season screen has already been shown for this exact exam date. */
export function seasonAlreadyShown(examDate: number | null, shownFor: number | null): boolean {
  return examDate !== null && shownFor === examDate;
}

export function seasonStats(fold: Fold, content: readonly ContentItem[]): SeasonStats {
  let conquered = 0;
  for (const item of content) {
    const state = fold.items.get(item.id);
    if (state !== undefined && state.highWaterBox === CONQUERED_BOX) conquered += 1;
  }

  let daysStudied = 0;
  let presentations = 0;
  for (const day of fold.byDay.values()) {
    presentations += day.presentations;
    if (day.presentations > 0) daysStudied += 1;
  }

  return { conquered, daysStudied, presentations };
}
