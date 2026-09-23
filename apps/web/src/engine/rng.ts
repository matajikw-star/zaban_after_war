/**
 * The app's source of randomness, for the same reason as `clock.ts`: the queue takes `rng` as a
 * parameter (`what.md` §5.4), so a test can make the draw deterministic without touching
 * `Math.random` globally.
 */

type RngSource = () => number;

const systemRng: RngSource = Math.random;

let source: RngSource = systemRng;

/** A number in [0, 1). */
export function rng(): number {
  return source();
}

/** Pins the generator for a test. Pass `null` to restore `Math.random`. */
export function setRngForTests(fn: RngSource | null): void {
  source = fn ?? systemRng;
}
