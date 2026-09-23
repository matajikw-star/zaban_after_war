/**
 * Pins `simulate`'s output for a fixed seed over a fixed synthetic content set — not the real
 * lexicon, which changes as ingest runs, so this test would otherwise drift under it. The
 * dynamics it checks (a seven-day conquest is reachable, the typical word takes a few weeks) are
 * the same ones `packages/core/src/simulated-user.test.ts` checks for the engine itself; this
 * file checks that the tool reports them correctly.
 */

import { describe, expect, it } from 'vitest';
import type { ContentItem } from '../../packages/core/src/index.ts';
import { median, percentile, type SimulateConfig, simulate } from './run.ts';

/** A seeded PRNG — the same small generator `tools/simulate/index.ts` builds from `--seed`. */
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

const WORD_COUNT = 150;
/** Fixed and varied, but not derived from any rng — the content set itself must never move. */
const CONTENT: readonly ContentItem[] = Array.from({ length: WORD_COUNT }, (_unused, index) => ({
  id: `w${String(index).padStart(3, '0')}`,
  rank: index,
  weight: index % 10 === 9 ? 0 : (index % 4) + 1,
}));

const DEFAULT_CONFIG: SimulateConfig = {
  minutesPerDay: 20,
  days: 90,
  examDays: 90,
  accuracy: 0.85,
};

const SEED = 20260918;

describe('simulate', () => {
  it('matches the pinned summary for a fixed seed and content set', () => {
    const result = simulate(DEFAULT_CONFIG, CONTENT, mulberry32(SEED));
    const sorted = [...result.conquestDays].sort((a, b) => a - b);

    expect({
      conquered: result.conquestDays.length,
      neverConquered: result.neverConquered,
      presentationsTotal: result.presentationsTotal,
      conquestDays: {
        min: Math.min(...sorted),
        p25: percentile(sorted, 0.25),
        median: median(sorted),
        p75: percentile(sorted, 0.75),
        max: Math.max(...sorted),
      },
      predictedFinishDay: result.predictedFinishDay,
      actualFinishDay: result.actualFinishDay,
      paceErrorDays: result.paceErrorDays,
    }).toMatchInlineSnapshot(`
      {
        "actualFinishDay": 48,
        "conquered": 150,
        "conquestDays": {
          "max": 44,
          "median": 15,
          "min": 7,
          "p25": 10,
          "p75": 23,
        },
        "neverConquered": 0,
        "paceErrorDays": -43,
        "predictedFinishDay": 5,
        "presentationsTotal": 18000,
      }
    `);
  });

  it('reaches a seven-day conquest for the default profile', () => {
    const result = simulate(DEFAULT_CONFIG, CONTENT, mulberry32(SEED));
    expect(Math.min(...result.conquestDays)).toBe(7);
  });

  it('keeps the median conquest between 10 and 25 days for the default profile', () => {
    const result = simulate(DEFAULT_CONFIG, CONTENT, mulberry32(SEED));
    const sorted = [...result.conquestDays].sort((a, b) => a - b);
    const value = median(sorted);
    expect(value).toBeGreaterThanOrEqual(10);
    expect(value).toBeLessThanOrEqual(25);
  });
});
