import { describe, expect, it } from 'vitest';
import { shouldShowGoalSheet } from './goal-sheet.ts';

describe('shouldShowGoalSheet', () => {
  it('shows once the day reaches the goal', () => {
    expect(
      shouldShowGoalSheet({
        presentationsToday: 50,
        dailyGoal: 50,
        lastShownDay: undefined,
        today: 20_700,
      }),
    ).toBe(true);
  });

  it('stays quiet below the goal', () => {
    expect(
      shouldShowGoalSheet({
        presentationsToday: 49,
        dailyGoal: 50,
        lastShownDay: undefined,
        today: 20_700,
      }),
    ).toBe(false);
  });

  it('shows only once a day, however many more cards are answered', () => {
    expect(
      shouldShowGoalSheet({
        presentationsToday: 80,
        dailyGoal: 50,
        lastShownDay: 20_700,
        today: 20_700,
      }),
    ).toBe(false);
  });

  it('shows again the next day', () => {
    expect(
      shouldShowGoalSheet({
        presentationsToday: 60,
        dailyGoal: 50,
        lastShownDay: 20_700,
        today: 20_701,
      }),
    ).toBe(true);
  });

  it('never shows for a goal of zero, which would make every day a win', () => {
    expect(
      shouldShowGoalSheet({
        presentationsToday: 0,
        dailyGoal: 0,
        lastShownDay: undefined,
        today: 20_700,
      }),
    ).toBe(false);
  });
});
