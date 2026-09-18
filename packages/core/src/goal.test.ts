import { describe, expect, it } from 'vitest';
import { goalFromMinutes, ONBOARDING_MINUTES } from './goal.ts';

describe('goalFromMinutes', () => {
  it('counts ten presentations a minute', () => {
    expect(goalFromMinutes(20)).toBe(200);
    expect(goalFromMinutes(45)).toBe(450);
  });

  it('holds a floor of fifty presentations', () => {
    expect(goalFromMinutes(1)).toBe(50);
    expect(goalFromMinutes(5)).toBe(50);
    expect(goalFromMinutes(0)).toBe(50);
  });

  it('offers the four onboarding options, none of them below the floor', () => {
    expect(ONBOARDING_MINUTES).toEqual([10, 20, 30, 45]);
    for (const minutes of ONBOARDING_MINUTES) {
      expect(goalFromMinutes(minutes)).toBeGreaterThanOrEqual(50);
    }
  });
});
