/**
 * The onboarding step state machine (`what.md` §17.2, §7.8 onboarding row).
 *
 * A flat, ordered union walked by three events. `'done'` is terminal — the screen watches for it
 * and finishes onboarding (writes the profile, queues the beacon, navigates home) outside the
 * machine, since that is an effect and this file stays pure.
 */

export type OnboardingStep =
  | 'slide-1'
  | 'slide-2'
  | 'slide-3'
  | 'minutes'
  | 'exam-date'
  | 'field'
  | 'placement'
  | 'install'
  | 'done';

export type OnboardingEvent = 'next' | 'back' | 'skip';

/** Order decides both `next`/`skip` (forward one) and `back` (backward one). */
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

/** Which steps «رد کردن» renders for — the rest only ever get `next`. */
export const SKIPPABLE_STEPS: readonly OnboardingStep[] = ['exam-date', 'field', 'placement'];

export function isSkippable(step: OnboardingStep): boolean {
  return SKIPPABLE_STEPS.includes(step);
}

/**
 * `done` is terminal: once reached, every event keeps it at `done` rather than throwing, so a
 * stray call after the finish effect has already fired is harmless.
 */
export function transition(step: OnboardingStep, event: OnboardingEvent): OnboardingStep {
  if (step === 'done') return 'done';

  const index = ORDER.indexOf(step);

  if (event === 'back') {
    return ORDER[Math.max(0, index - 1)] ?? step;
  }

  // 'next' and 'skip' both move forward one step; the caller decides what to write for a skip.
  return ORDER[Math.min(ORDER.length - 1, index + 1)] ?? step;
}
