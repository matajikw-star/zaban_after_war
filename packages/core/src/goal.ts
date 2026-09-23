/**
 * The daily goal, in presentations.
 *
 * Onboarding asks for minutes, because that is what a user knows about themselves; the engine
 * counts presentations, because that is what it can measure. Ten presentations a minute is the
 * observed rate for a two-sided card with a binary grade (§5.5).
 */

/** The minute options onboarding offers. */
export const ONBOARDING_MINUTES: readonly number[] = [10, 20, 30, 45];

/** Presentations per day. The floor of 50 keeps a tiny goal from starving the queue. */
export function goalFromMinutes(minutes: number): number {
  return Math.max(50, minutes * 10);
}
