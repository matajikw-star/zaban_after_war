/**
 * The only place in `apps/web` that reads the wall clock (`what.md` §17.7).
 *
 * The engine takes `now` as a parameter precisely so nothing downstream has to guess; this
 * module is the single supplier of that parameter, and tests replace it instead of mocking
 * globals.
 */

type ClockSource = () => number;

const systemClock: ClockSource = () => Date.now();

let source: ClockSource = systemClock;

/** Epoch ms. Every timestamp the app writes — events, breadcrumbs, outbox rows — comes from here. */
export function now(): number {
  return source();
}

/** Pins the clock for a test. Pass `null` to restore the system clock. */
export function setClockForTests(fn: ClockSource | null): void {
  source = fn ?? systemClock;
}
