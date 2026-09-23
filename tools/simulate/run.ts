/**
 * The simulation itself: a synthetic user driven through the real engine, one day at a time.
 *
 * Pure — no fs, no CLI, no clock — so a test can pin its output. It reuses the incremental-state
 * technique of `packages/core/src/simulated-user.test.ts`: an item's state depends only on that
 * item's own event history, so folding one word's log gives that word's exact state without
 * re-folding the whole log on every card. `simulate` never imports the engine's internals
 * directly — everything comes through the one barrel, `packages/core/src/index.ts`.
 */

import {
  type Box,
  type ContentItem,
  type DayKey,
  DEFAULT_PARAMS,
  dayKey,
  dayStart,
  type Fold,
  fold,
  goalFromMinutes,
  type ItemId,
  type ItemState,
  nextCard,
  paceEstimate,
  type ReviewEvent,
} from '../../packages/core/src/index.ts';
import type { AccuracyProfile } from './args.ts';

export interface SimulateConfig {
  readonly minutesPerDay: number;
  readonly days: number;
  /** Days from the simulation's start until the exam; feeds the pace estimate only. */
  readonly examDays: number;
  readonly accuracy: AccuracyProfile;
}

export interface DayRow {
  /** 1-based, for printing. */
  readonly day: number;
  readonly presentations: number;
  readonly introduced: number;
  readonly conquered: number;
  /** This day's own correct/presentations; 0 when nothing was shown. */
  readonly accuracy: number;
  /** Items with `box < 5` and `dueAt` at or before the end of this day. */
  readonly duePool: number;
  readonly introducedSoFar: number;
  readonly conqueredSoFar: number;
  readonly daysNeeded: number;
  readonly verdict: 'ahead' | 'ok' | 'behind';
}

export interface SimulateResult {
  readonly rows: readonly DayRow[];
  /** Per conquered word: days from its introduction to `highWaterBox === 5`. */
  readonly conquestDays: readonly number[];
  readonly presentationsTotal: number;
  readonly wordsTotal: number;
  readonly introducedTotal: number;
  readonly conqueredTotal: number;
  /** `wordsTotal - conqueredTotal` — never introduced counts as never conquered too. */
  readonly neverConquered: number;
  /** `paceEstimate`'s `daysNeeded` from a cold start, before a single card is shown. */
  readonly predictedFinishDay: number;
  /** 1-based day on which every weighted word first reached `highWaterBox === 5`; `null` if not by the end. */
  readonly actualFinishDay: number | null;
  /** `predictedFinishDay - actualFinishDay`; `null` when the run never finished. */
  readonly paceErrorDays: number | null;
}

/** The user studies after work, at 18:00 Tehran — matches the engine's own 90-day test fixture. */
const SESSION_START_MS = 18 * 60 * 60 * 1000;
/** A fixed anchor so the same seed always produces the same calendar-independent run. */
const FIRST_DAY: DayKey = dayKey(Date.UTC(2026, 2, 21, 12, 0, 0, 0));
/** How many recently-shown ids `nextCard`'s suppression window needs to see. */
const RECENT_KEPT = 64;
const CONQUERED_BOX = 5;

function accuracyForBox(box: Box, profile: AccuracyProfile): number {
  // `box` is always 1..5, so `box - 1` is always a valid index into the five-element tuple.
  return typeof profile === 'number' ? profile : (profile[box - 1] as number);
}

function median(sorted: readonly number[]): number {
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] as number;
  return ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

interface MutableDayStats {
  presentations: number;
  correct: number;
  conquered: number;
  introduced: number;
}

export function simulate(
  config: SimulateConfig,
  content: readonly ContentItem[],
  rng: () => number,
): SimulateResult {
  const params = DEFAULT_PARAMS;
  const dailyGoal = goalFromMinutes(config.minutesPerDay);
  const msPerCard = (config.minutesPerDay * 60_000) / dailyGoal;
  const examDate = dayStart(FIRST_DAY + config.examDays);
  const weightById = new Map(content.map((item) => [item.id, item.weight] as const));
  const weightedTotal = content.filter((item) => item.weight > 0).length;

  const items = new Map<ItemId, ItemState>();
  const byDay = new Map<DayKey, MutableDayStats>();
  const perItemLog = new Map<ItemId, ReviewEvent[]>();
  const introducedOnDay = new Map<ItemId, number>();
  const conquestDays: number[] = [];
  const rows: DayRow[] = [];
  let recent: ItemId[] = [];
  let lastEventAt = 0;
  let presentationsTotal = 0;
  let actualFinishDay: number | null = null;

  const predictedFinishDay = paceEstimate(
    { items: new Map(), byDay: new Map(), lastEventAt: 0 },
    content,
    dailyGoal,
    examDate,
    dayStart(FIRST_DAY),
    params,
  ).daysNeeded;

  for (let day = 0; day < config.days; day += 1) {
    const sessionStart = dayStart(FIRST_DAY + day) + SESSION_START_MS;

    for (let card = 0; card < dailyGoal; card += 1) {
      const at = sessionStart + card * msPerCard;
      const currentFold: Fold = { items, byDay, lastEventAt };
      const drawn = nextCard(currentFold, content, recent, at, dailyGoal, rng, params);
      // Only an empty content list ever returns null (§5.4); nothing left to simulate.
      if (drawn === null) break;
      const { itemId } = drawn;

      const priorState = items.get(itemId);
      const grade = rng() < accuracyForBox(priorState?.box ?? 1, config.accuracy) ? 1 : 0;

      presentationsTotal += 1;
      const event: ReviewEvent = {
        id: `sim-${presentationsTotal}`,
        itemId,
        at,
        kind: 'review',
        grade,
        device: 'sim',
      };
      const history = perItemLog.get(itemId) ?? [];
      history.push(event);
      perItemLog.set(itemId, history);

      const previousHighWater = priorState?.highWaterBox ?? 1;
      const wasSeen = priorState !== undefined;
      // One word's state depends on that word's events alone, so this is the engine's own answer.
      const state = fold(history, params).items.get(itemId) as ItemState;
      items.set(itemId, state);

      const key = dayKey(at);
      let stats = byDay.get(key);
      if (stats === undefined) {
        stats = { presentations: 0, correct: 0, conquered: 0, introduced: 0 };
        byDay.set(key, stats);
      }
      stats.presentations += 1;
      if (grade === 1) stats.correct += 1;
      if (!wasSeen) {
        stats.introduced += 1;
        introducedOnDay.set(itemId, day);
      }
      if (previousHighWater < CONQUERED_BOX && state.highWaterBox === CONQUERED_BOX) {
        stats.conquered += 1;
        conquestDays.push(day - (introducedOnDay.get(itemId) as number));
      }

      lastEventAt = at;
      recent = [itemId, ...recent].slice(0, RECENT_KEPT);
    }

    let duePool = 0;
    let conqueredSoFar = 0;
    let conqueredWeighted = 0;
    for (const state of items.values()) {
      if (state.box < CONQUERED_BOX && state.dueAt <= lastEventAt) duePool += 1;
      if (state.highWaterBox === CONQUERED_BOX) {
        conqueredSoFar += 1;
        if ((weightById.get(state.itemId) ?? 0) > 0) conqueredWeighted += 1;
      }
    }
    if (actualFinishDay === null && weightedTotal > 0 && conqueredWeighted === weightedTotal) {
      actualFinishDay = day + 1;
    }

    const dayStats = byDay.get(dayKey(lastEventAt));
    const pace = paceEstimate(
      { items, byDay, lastEventAt },
      content,
      dailyGoal,
      examDate,
      lastEventAt,
      params,
    );

    rows.push({
      day: day + 1,
      presentations: dayStats?.presentations ?? 0,
      introduced: dayStats?.introduced ?? 0,
      conquered: dayStats?.conquered ?? 0,
      accuracy:
        dayStats !== undefined && dayStats.presentations > 0
          ? dayStats.correct / dayStats.presentations
          : 0,
      duePool,
      introducedSoFar: introducedOnDay.size,
      conqueredSoFar,
      daysNeeded: pace.daysNeeded,
      verdict: pace.verdict,
    });
  }

  const conqueredTotal = [...items.values()].filter(
    (state) => state.highWaterBox === CONQUERED_BOX,
  ).length;

  return {
    rows,
    conquestDays,
    presentationsTotal,
    wordsTotal: content.length,
    introducedTotal: introducedOnDay.size,
    conqueredTotal,
    neverConquered: content.length - conqueredTotal,
    predictedFinishDay,
    actualFinishDay,
    paceErrorDays: actualFinishDay === null ? null : predictedFinishDay - actualFinishDay,
  };
}

/** Exported for the CLI and the test: nearest-rank percentile over an already-sorted array. */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.floor(p * (sorted.length - 1));
  return sorted[index] as number;
}

export { median };
