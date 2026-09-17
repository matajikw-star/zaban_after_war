import { describe, expect, it } from 'vitest';
import { DAY_MS } from './day.ts';
import { DEFAULT_PARAMS } from './params.ts';
import type { Box } from './types.ts';

const BOXES: readonly Box[] = [1, 2, 3, 4, 5];

describe('DEFAULT_PARAMS', () => {
  it('carries the ADR-0019 ladder: 10 min, 1 d, 2 d, 4 d, 8 d', () => {
    expect(DEFAULT_PARAMS.intervalsMs).toEqual({
      1: 600_000,
      2: DAY_MS,
      3: 2 * DAY_MS,
      4: 4 * DAY_MS,
      5: 8 * DAY_MS,
    });
  });

  it('lets a word be conquered in seven days at the earliest', () => {
    const { intervalsMs } = DEFAULT_PARAMS;
    const fastest = intervalsMs[2] + intervalsMs[3] + intervalsMs[4];
    expect(fastest).toBe(7 * DAY_MS);
  });

  it('grows the interval strictly with the box', () => {
    for (const box of BOXES.slice(1)) {
      expect(DEFAULT_PARAMS.intervalsMs[box]).toBeGreaterThan(
        DEFAULT_PARAMS.intervalsMs[(box - 1) as Box],
      );
    }
  });

  it('draws lower boxes harder and conquered words softer', () => {
    expect(DEFAULT_PARAMS.boxDrawFactor).toEqual({ 1: 1.5, 2: 1.3, 3: 1.15, 4: 1.0, 5: 0.6 });
  });

  it('holds every other tunable at its §5.1 value', () => {
    expect(DEFAULT_PARAMS.suppressionWindow).toBe(8);
    expect(DEFAULT_PARAMS.newWordsFloorDivisor).toBe(6);
    expect(DEFAULT_PARAMS.newWordsCapMultiplier).toBe(2);
    expect(DEFAULT_PARAMS.minDuePool).toBe(10);
    expect(DEFAULT_PARAMS.streakMinFraction).toBe(0.3);
    expect(DEFAULT_PARAMS.accuracyWindowDays).toBe(7);
    expect(DEFAULT_PARAMS.defaultAccuracy).toBe(0.8);
    expect(DEFAULT_PARAMS.freePresentationLimit).toBe(100);
  });
});
