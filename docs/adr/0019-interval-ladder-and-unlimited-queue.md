# ADR-0019 — The 10m/1d/2d/4d/8d ladder, elapsed-interval promotion, and an unlimited queue

**Status:** accepted · **Date:** 2026-09-17 · **Supersedes ADR-0003's interval table and
"done for today" framing.** Records rounds 3–6 of `docs/plan/product-brief.md` as the decision
the engine implements.

## Context

ADR-0003's ladder (10m/1d/3d/7d/21d) gave a 32-day floor to conquer a word, and its queue ran
dry with a "you are done" state. The owner requires that a candidate with three weeks left can
finish, and that the app never tells the user to stop.

## Decision

- Intervals: box 1 = 10 minutes, 2 = 1 day, 3 = 2 days, 4 = 4 days, 5 = 8 days. Box 5 keeps
  cycling at 8 days. Minimum time to conquer a word: 7 days.
- A correct answer promotes **only if the interval has elapsed**; an early correct answer
  changes nothing. A wrong answer always drops the word to box 1. «این را بلدم» sends it to
  box 5 directly.
- Queue pools in order: due non-conquered (weighted random per word, with a suppression window
  that never switches itself off), new words by exam-value rank under a daily budget that
  tracks conquests (floor `ceil(goal/6)`, cap twice that), conquered-and-due, then not-yet-due
  soonest first. The last pool is always non-empty, so the app never says done.
- Progress is `Σ(highWaterBox/5 × timesTested) / Σ timesTested` and never decreases; the live
  box remains visible in the boxes view.
- One ladder for everyone; the exam date only feeds the pace estimate.
- All numbers live in one `params.ts` and are tuned through the simulator, never in place.

## Consequences

- A fast conquest is possible but uncommon: the word must be drawn promptly all four times it
  comes due, and display priority makes that rare.
- The fold is unchanged in shape (ADR-0002); retuning is a re-fold.
- ADR-0003's box metaphor and pure-engine rule stand; only its table and its "done" framing are
  replaced.
