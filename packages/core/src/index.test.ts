import { describe, expect, it } from 'vitest';
import * as core from './index.ts';

/**
 * The barrel is the package's contract with `apps/web`. If something leaves it, a screen breaks
 * at build time in another package — so the surface is asserted here, in this one.
 */
describe('the package root', () => {
  it('exports the engine the app is allowed to call', () => {
    expect(Object.keys(core).sort()).toEqual(
      [
        'BOXES',
        'DAY_MS',
        'DEFAULT_PARAMS',
        'EARLY_ANSWER_FACTOR',
        'ONBOARDING_MINUTES',
        'STREAK_MIN_PRESENTATIONS',
        'TEHRAN_OFFSET_MS',
        'boxCounts',
        'dayKey',
        'dayStart',
        'dueCounts',
        'fold',
        'goalFromMinutes',
        'introductionBudget',
        'isConquered',
        'nextCard',
        'paceEstimate',
        'progress',
        'recentAccuracy',
        'streak',
      ].sort(),
    );
  });

  it('exports functions that agree with their modules', () => {
    const result = core.fold([], core.DEFAULT_PARAMS);
    expect(result.items.size).toBe(0);
    expect(core.goalFromMinutes(30)).toBe(300);
  });
});
