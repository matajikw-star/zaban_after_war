/**
 * The fold: the review log in, all study state out.
 *
 * This is the whole of ADR-0002. Nothing else in the system is allowed to hold study state, so
 * every rule about boxes, due dates and daily counts lives here and nowhere else. The function
 * is total and order-independent: any permutation of the same log folds to the same `Fold`
 * (§5.2, proved by a fast-check property in `fold.test.ts`).
 */

import { dayKey } from './day.ts';
import type {
  Box,
  DayKey,
  DayStats,
  Fold,
  ItemId,
  ItemState,
  Params,
  ReviewEvent,
} from './types.ts';

/** Where a word sits before its first event. Its first correct review promotes it to box 2. */
const INITIAL_BOX: Box = 1;
const CONQUERED_BOX: Box = 5;

/**
 * An unseen item counts as due: its (virtual) interval has always already elapsed, so the very
 * first `review` with grade 1 promotes it to box 2. That is what makes ADR-0019's seven-day
 * minimum (1 + 2 + 4 days) reachable.
 */
const NEVER_DUE = Number.NEGATIVE_INFINITY;

interface MutableDayStats {
  presentations: number;
  correct: number;
  conquered: number;
  introduced: number;
}

/** Sort by `(at, id)` — a total order that does not depend on the delivery order of sync. */
function compareEvents(a: ReviewEvent, b: ReviewEvent): number {
  if (a.at !== b.at) return a.at - b.at;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

function emptyDay(): MutableDayStats {
  return { presentations: 0, correct: 0, conquered: 0, introduced: 0 };
}

/** The box an event moves an item to. §5.2: early correct answers change nothing. */
function boxAfter(event: ReviewEvent, box: Box, dueAt: number): Box {
  if (event.kind === 'know') return CONQUERED_BOX;
  if (event.grade === 0) return INITIAL_BOX;
  if (event.at < dueAt) return box;
  return Math.min(box + 1, CONQUERED_BOX) as Box;
}

export function fold(events: readonly ReviewEvent[], params: Params): Fold {
  const ordered = [...events].sort(compareEvents);
  const eventIds = new Set<string>();
  const items = new Map<ItemId, ItemState>();
  const byDay = new Map<DayKey, MutableDayStats>();
  let lastEventAt = 0;

  for (const event of ordered) {
    // Sync can deliver the same event twice; the log is a set, not a list.
    if (eventIds.has(event.id)) continue;
    eventIds.add(event.id);

    const previous = items.get(event.itemId);
    const box = previous?.box ?? INITIAL_BOX;
    const dueAt = previous?.dueAt ?? NEVER_DUE;
    const previousHighWater = previous?.highWaterBox ?? INITIAL_BOX;

    const nextBox = boxAfter(event, box, dueAt);
    const highWaterBox = Math.max(previousHighWater, nextBox) as Box;

    items.set(event.itemId, {
      itemId: event.itemId,
      box: nextBox,
      highWaterBox,
      lastReviewedAt: event.at,
      dueAt: event.at + params.intervalsMs[nextBox],
      reviewCount: (previous?.reviewCount ?? 0) + 1,
      lapseCount:
        (previous?.lapseCount ?? 0) + (event.kind === 'review' && event.grade === 0 ? 1 : 0),
    });

    const key = dayKey(event.at);
    let day = byDay.get(key);
    if (day === undefined) {
      day = emptyDay();
      byDay.set(key, day);
    }
    day.presentations += 1;
    if (event.grade === 1) day.correct += 1;
    if (previous === undefined) day.introduced += 1;
    // `know` reaches box 5 without counting as a conquest — see the note on `DayStats`.
    if (
      event.kind === 'review' &&
      highWaterBox === CONQUERED_BOX &&
      previousHighWater < CONQUERED_BOX
    ) {
      day.conquered += 1;
    }

    if (event.at > lastEventAt) lastEventAt = event.at;
  }

  return { items, byDay: byDay as ReadonlyMap<DayKey, DayStats>, lastEventAt };
}

/** A word is conquered when its high-water box is 5. It keeps being scheduled anyway. */
export function isConquered(state: ItemState): boolean {
  return state.highWaterBox === CONQUERED_BOX;
}
