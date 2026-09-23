import { describe, expect, it } from 'vitest';
import { isSkippable, type OnboardingStep, transition } from './steps.ts';

const ORDER: readonly OnboardingStep[] = [
  'slide-1',
  'slide-2',
  'slide-3',
  'minutes',
  'exam-date',
  'field',
  'placement',
  'install',
  'done',
];

describe('transition', () => {
  it('walks forward one step at a time on next, for every step', () => {
    for (let i = 0; i < ORDER.length - 1; i += 1) {
      expect(transition(ORDER[i] as OnboardingStep, 'next')).toBe(ORDER[i + 1]);
    }
  });

  it('walks backward one step at a time on back, for every step', () => {
    for (let i = 1; i < ORDER.length; i += 1) {
      expect(transition(ORDER[i] as OnboardingStep, 'back')).toBe(ORDER[i - 1]);
    }
  });

  it('stays on the first slide when back is pressed there', () => {
    expect(transition('slide-1', 'back')).toBe('slide-1');
  });

  it('treats skip the same as next', () => {
    expect(transition('exam-date', 'skip')).toBe('field');
    expect(transition('field', 'skip')).toBe('placement');
    expect(transition('placement', 'skip')).toBe('install');
  });

  it('is terminal at done: every event keeps it at done', () => {
    expect(transition('done', 'next')).toBe('done');
    expect(transition('done', 'back')).toBe('done');
    expect(transition('done', 'skip')).toBe('done');
  });

  it('moving next from install reaches done', () => {
    expect(transition('install', 'next')).toBe('done');
  });
});

describe('isSkippable', () => {
  it('marks exam date, field and placement as skippable', () => {
    expect(isSkippable('exam-date')).toBe(true);
    expect(isSkippable('field')).toBe(true);
    expect(isSkippable('placement')).toBe(true);
  });

  it('marks the slides, minutes and install as not skippable', () => {
    expect(isSkippable('slide-1')).toBe(false);
    expect(isSkippable('slide-2')).toBe(false);
    expect(isSkippable('slide-3')).toBe(false);
    expect(isSkippable('minutes')).toBe(false);
    expect(isSkippable('install')).toBe(false);
    expect(isSkippable('done')).toBe(false);
  });
});
