/**
 * The queue: which card comes next, and why.
 *
 * Four pools (§5.4, ADR-0019). The last one is never empty once a single word has been seen, so
 * the app can never tell the user to stop studying. Everything here is a pure function of the
 * fold, the content and two parameters the caller owns: `now` and `rng`.
 */

import { DAY_MS, dayKey } from './day.ts';
import type { Box, ContentItem, Fold, ItemId, ItemState, Params } from './types.ts';

export type CardSource = 'due' | 'new' | 'conquered' | 'early';

export interface NextCard {
  readonly itemId: ItemId;
  readonly source: CardSource;
}

export interface IntroductionBudget {
  /** `ceil(dailyGoal / newWordsFloorDivisor)` — the first days must not be dead. */
  readonly floor: number;
  /** `newWordsCapMultiplier × floor`. */
  readonly cap: number;
  /** `clamp(floor + conqueredToday, floor, cap)` — words enter at the rate they leave. */
  readonly budget: number;
  /** Words already introduced today. */
  readonly introduced: number;
  /** `max(0, budget − introduced)`. */
  readonly remaining: number;
}

export interface BoxCounts {
  readonly byBox: Record<Box, number>;
  /** Content items with no event yet. */
  readonly unseen: number;
}

const CONQUERED_BOX: Box = 5;
/** The five boxes in order, for screens that iterate them. */
export const BOXES: readonly Box[] = [1, 2, 3, 4, 5];

function zeroByBox(): Record<Box, number> {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
}

/** Item ids are unique inside a pool — they come from a Map — so there is no equal case. */
function byIdAscending(a: ItemState, b: ItemState): number {
  return a.itemId < b.itemId ? -1 : 1;
}

function byDueThenId(a: ItemState, b: ItemState): number {
  if (a.dueAt !== b.dueAt) return a.dueAt - b.dueAt;
  return byIdAscending(a, b);
}

/** Today's allowance of new words. The control law of ADR-0019, in one place. */
export function introductionBudget(
  fold: Fold,
  dailyGoal: number,
  now: number,
  params: Params,
): IntroductionBudget {
  const floor = Math.ceil(dailyGoal / params.newWordsFloorDivisor);
  const cap = params.newWordsCapMultiplier * floor;
  const today = fold.byDay.get(dayKey(now));
  const conqueredToday = today?.conquered ?? 0;
  const introduced = today?.introduced ?? 0;
  const budget = Math.min(cap, Math.max(floor, floor + conqueredToday));
  return { floor, cap, budget, introduced, remaining: Math.max(0, budget - introduced) };
}

/** Cards waiting right now, per live box. What the boxes screen puts next to each box. */
export function dueCounts(fold: Fold, now: number): Record<Box, number> {
  const counts = zeroByBox();
  for (const state of fold.items.values()) {
    if (state.dueAt <= now) counts[state.box] += 1;
  }
  return counts;
}

/** Where the content stands: items per live box, plus the ones never seen. */
export function boxCounts(fold: Fold, content: readonly ContentItem[]): BoxCounts {
  const byBox = zeroByBox();
  let unseen = 0;
  for (const item of content) {
    const state = fold.items.get(item.id);
    if (state === undefined) unseen += 1;
    else byBox[state.box] += 1;
  }
  return { byBox, unseen };
}

/**
 * The suppression window, which never switches itself off: when every due card was shown inside
 * the window, the least-recently-shown one is played instead of lifting the rule (§5.4).
 * `recent` is most-recent-first, so index 0 is the card the user just saw.
 */
function leastRecentlyShown(pool: readonly ItemState[], recent: readonly ItemId[]): ItemId {
  let best = pool[0] as ItemState;
  let bestAge = Number.NEGATIVE_INFINITY;
  for (const state of pool) {
    const position = recent.indexOf(state.itemId);
    const age = position === -1 ? Number.POSITIVE_INFINITY : position;
    if (age > bestAge) {
      best = state;
      bestAge = age;
    }
  }
  return best.itemId;
}

/** Weight `(1 + overdueDays) × boxDrawFactor[box]`, computed per word — never per box. */
function drawWeight(state: ItemState, now: number, params: Params): number {
  const overdueDays = (now - state.dueAt) / DAY_MS;
  return (1 + overdueDays) * params.boxDrawFactor[state.box];
}

function weightedDraw(
  pool: readonly ItemState[],
  now: number,
  rng: () => number,
  params: Params,
): ItemId {
  let total = 0;
  for (const state of pool) total += drawWeight(state, now, params);
  let ticket = rng() * total;
  for (const state of pool) {
    ticket -= drawWeight(state, now, params);
    if (ticket < 0) return state.itemId;
  }
  // Only reachable through floating-point slack or an rng that returns exactly 1.
  return (pool[pool.length - 1] as ItemState).itemId;
}

export function nextCard(
  fold: Fold,
  content: readonly ContentItem[],
  recent: readonly ItemId[],
  now: number,
  dailyGoal: number,
  rng: () => number,
  params: Params,
): NextCard | null {
  const due: ItemState[] = [];
  const conquered: ItemState[] = [];
  const early: ItemState[] = [];
  let nextUnseen: ContentItem | null = null;

  for (const item of content) {
    const state = fold.items.get(item.id);
    if (state === undefined) {
      if (nextUnseen === null || item.rank < nextUnseen.rank) nextUnseen = item;
      continue;
    }
    if (state.dueAt > now) early.push(state);
    else if (state.box === CONQUERED_BOX) conquered.push(state);
    else due.push(state);
  }

  // Pool 2 is tested first because its own guard is "pool 1 is thin": reading §5.4's order
  // literally would leave `minDuePool` dead, since a due pool that is non-empty would always
  // win and an empty one is thin by definition.
  const budget = introductionBudget(fold, dailyGoal, now, params);
  if (nextUnseen !== null && due.length < params.minDuePool && budget.remaining > 0) {
    return { itemId: nextUnseen.id, source: 'new' };
  }

  if (due.length > 0) {
    // Sorted so the draw depends on the fold and the rng, not on the order of the content array.
    due.sort(byIdAscending);
    const suppressed = new Set(recent.slice(0, params.suppressionWindow));
    const allowed = due.filter((state) => !suppressed.has(state.itemId));
    const itemId =
      allowed.length > 0
        ? weightedDraw(allowed, now, rng, params)
        : leastRecentlyShown(due, recent);
    return { itemId, source: 'due' };
  }

  if (conquered.length > 0) {
    conquered.sort(byDueThenId);
    return { itemId: (conquered[0] as ItemState).itemId, source: 'conquered' };
  }

  if (early.length > 0) {
    early.sort(byDueThenId);
    return { itemId: (early[0] as ItemState).itemId, source: 'early' };
  }

  // Only when there is nothing to show at all: empty content, or content no event touches.
  return null;
}
