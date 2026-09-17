/**
 * Ninety days of one synthetic user, driven through the real engine.
 *
 * This is the test that checks the *dynamics* rather than a single rule: that the ladder lets a
 * lucky word be conquered in exactly seven days, that the typical word takes longer, and that
 * `nextCard` always has something to show (§16.1, ADR-0019).
 *
 * The state is kept incrementally — item states are independent, so folding one word's own log
 * gives that word's exact state — because re-folding the whole log 18,000 times would make the
 * test slow enough to skip. At the end of every simulated day the incremental state is compared
 * against `fold` over the entire log, so any drift fails here rather than hiding.
 */

import { describe, expect, it } from 'vitest';
import { dayKey, dayStart } from './day.ts';
import { fold } from './fold.ts';
import { goalFromMinutes } from './goal.ts';
import { DEFAULT_PARAMS } from './params.ts';
import { nextCard } from './queue.ts';
import type { ContentItem, DayKey, Fold, ItemId, ItemState, ReviewEvent } from './types.ts';

const P = DEFAULT_PARAMS;
const DAYS = 90;
const WORD_COUNT = 200;
const ACCURACY = 0.85;
const MINUTES_PER_DAY = 20;
const GOAL = goalFromMinutes(MINUTES_PER_DAY);
const MS_PER_CARD = (MINUTES_PER_DAY * 60 * 1000) / GOAL;
/** The user studies after work, at 18:00 Tehran. */
const SESSION_START_MS = 18 * 60 * 60 * 1000;
const FIRST_DAY = dayKey(Date.UTC(2026, 2, 21, 12, 0, 0, 0));
const RECENT_KEPT = 64;

/** A seeded PRNG, so the whole simulation is one deterministic number. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A weight distribution shaped like the real lexicon: a long tail of words tested once, a few
 * tested many times, and a tenth that are context-only and carry no weight at all.
 */
function weightFor(draw: number): number {
  if (draw < 0.1) return 0;
  if (draw < 0.6) return 1;
  if (draw < 0.85) return 2;
  if (draw < 0.95) return 4;
  return 9;
}

interface MutableDayStats {
  presentations: number;
  correct: number;
  conquered: number;
  introduced: number;
}

interface SimulationResult {
  readonly conquestDays: readonly number[];
  readonly presentations: number;
  readonly conquered: number;
  readonly introduced: number;
  readonly finalFold: Fold;
  readonly content: readonly ContentItem[];
}

function comparable(result: Fold): unknown {
  return {
    items: [...result.items.entries()].sort(([a], [b]) => (a < b ? -1 : 1)),
    byDay: [...result.byDay.entries()].sort(([a], [b]) => a - b),
    lastEventAt: result.lastEventAt,
  };
}

function simulate(seed: number): SimulationResult {
  const rng = mulberry32(seed);
  const content: ContentItem[] = Array.from({ length: WORD_COUNT }, (_unused, index) => ({
    id: `w${String(index).padStart(3, '0')}`,
    rank: index,
    weight: weightFor(rng()),
  }));

  const log: ReviewEvent[] = [];
  const perItem = new Map<ItemId, ReviewEvent[]>();
  const items = new Map<ItemId, ItemState>();
  const byDay = new Map<DayKey, MutableDayStats>();
  const introducedOn = new Map<ItemId, DayKey>();
  const conquestDays: number[] = [];
  let recent: ItemId[] = [];
  let lastEventAt = 0;
  let presentations = 0;

  for (let day = 0; day < DAYS; day += 1) {
    const sessionStart = dayStart(FIRST_DAY + day) + SESSION_START_MS;
    for (let card = 0; card < GOAL; card += 1) {
      const at = sessionStart + card * MS_PER_CARD;
      const current: Fold = { items, byDay, lastEventAt };
      const drawn = nextCard(current, content, recent, at, GOAL, rng, P);
      expect(drawn).not.toBeNull();
      const itemId = (drawn as NonNullable<typeof drawn>).itemId;

      const grade = rng() < ACCURACY ? 1 : 0;
      presentations += 1;
      const event: ReviewEvent = {
        id: `s${presentations}`,
        itemId,
        at,
        kind: 'review',
        grade,
        device: 'sim',
      };
      log.push(event);

      const history = perItem.get(itemId) ?? [];
      history.push(event);
      perItem.set(itemId, history);
      const previousHighWater = items.get(itemId)?.highWaterBox ?? 1;
      const wasSeen = items.has(itemId);
      // One word's state depends on that word's events alone, so this is the engine's own answer.
      const state = fold(history, P).items.get(itemId) as ItemState;
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
        introducedOn.set(itemId, key);
      }
      if (previousHighWater < 5 && state.highWaterBox === 5) {
        stats.conquered += 1;
        conquestDays.push(key - (introducedOn.get(itemId) as DayKey));
      }
      lastEventAt = at;

      recent = [itemId, ...recent].slice(0, RECENT_KEPT);
    }

    // The incremental state must be exactly what the engine folds from the whole log.
    const authoritative = fold(log, P);
    expect(comparable({ items, byDay, lastEventAt })).toEqual(comparable(authoritative));
  }

  return {
    conquestDays,
    presentations,
    conquered: conquestDays.length,
    introduced: introducedOn.size,
    finalFold: fold(log, P),
    content,
  };
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] as number;
  return ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

describe('a 90-day simulated user', () => {
  const result = simulate(20260918);
  const days = result.conquestDays;

  it('always has a card to show', () => {
    expect(result.presentations).toBe(DAYS * GOAL);
  });

  it('introduces every word and conquers most of them', () => {
    expect(result.introduced).toBe(WORD_COUNT);
    expect(result.conquered).toBeGreaterThan(WORD_COUNT / 2);
    console.log(
      `conquests ${days.length}/${WORD_COUNT} · min ${Math.min(...days)} · median ${median(days)} · max ${Math.max(...days)} · presentations ${result.presentations}`,
    );
  });

  it('conquers at least one word in exactly seven days', () => {
    expect(Math.min(...days)).toBe(7);
  });

  it('takes longer than seven days for the typical word, and under a month', () => {
    expect(median(days)).toBeGreaterThan(7);
    expect(median(days)).toBeLessThan(30);
  });
});
