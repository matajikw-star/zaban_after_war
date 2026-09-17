import { describe, expect, it } from 'vitest';
import { DAY_MS, dayKey, dayStart, TEHRAN_OFFSET_MS } from './day.ts';

/** 2026-03-21 00:00:00 +03:30 — Nowruz, and a Tehran midnight. */
const TEHRAN_MIDNIGHT = Date.UTC(2026, 2, 20, 20, 30, 0, 0);

describe('Tehran day boundary at 00:00 +03:30', () => {
  it('starts a new day at 20:30 UTC, not at UTC midnight', () => {
    const key = dayKey(TEHRAN_MIDNIGHT);
    expect(dayKey(TEHRAN_MIDNIGHT - 1)).toBe(key - 1);
    expect(dayKey(TEHRAN_MIDNIGHT + 1)).toBe(key);
    // 23:59:59.999 Tehran is still the same day.
    expect(dayKey(TEHRAN_MIDNIGHT + DAY_MS - 1)).toBe(key);
    expect(dayKey(TEHRAN_MIDNIGHT + DAY_MS)).toBe(key + 1);
  });

  it('puts UTC midnight in the day that already began three and a half hours earlier', () => {
    const utcMidnight = Date.UTC(2026, 2, 21, 0, 0, 0, 0);
    expect(dayKey(utcMidnight)).toBe(dayKey(TEHRAN_MIDNIGHT));
  });

  it('uses the fixed +03:30 offset — Iran has had no DST since 2022', () => {
    expect(TEHRAN_OFFSET_MS).toBe(3.5 * 60 * 60 * 1000);
    expect(DAY_MS).toBe(86_400_000);
  });
});

describe('dayStart', () => {
  it('inverts dayKey', () => {
    expect(dayStart(dayKey(TEHRAN_MIDNIGHT))).toBe(TEHRAN_MIDNIGHT);
    const middayTehran = TEHRAN_MIDNIGHT + 12 * 60 * 60 * 1000;
    expect(dayStart(dayKey(middayTehran))).toBe(TEHRAN_MIDNIGHT);
  });

  it('handles instants before the epoch without rounding towards zero', () => {
    // Day 0 in Tehran began at 1970-01-01 00:00 +03:30, i.e. three and a half hours before the
    // epoch, so the epoch itself is day 0 and the instant before that day is day −1.
    expect(dayStart(0)).toBe(-TEHRAN_OFFSET_MS);
    expect(dayKey(0)).toBe(0);
    expect(dayKey(-TEHRAN_OFFSET_MS)).toBe(0);
    expect(dayKey(-TEHRAN_OFFSET_MS - 1)).toBe(-1);
  });
});
