# 02 — Rewrite `packages/core` to the current contracts

Status: resolved
Type: task
Phase: 1
Blocked by: 01

## Goal

Implement `docs/spec/what.md` §5 exactly: `types.ts` (ItemId, ReviewEvent with `kind`,
ItemState with `highWaterBox`, Fold, ContentItem, Params), `params.ts` (every number, with the
values in §5.1), `fold.ts`, `progress.ts`, `streak.ts`, `pace.ts`, `queue.ts` (`nextCard` with
the four pools, per-word weights, the suppression window that never disables itself, the
introduction budget), `goal.ts` (`goalFromMinutes`), `day.ts` (Tehran day key, fixed +03:30).

Delete the superseded `BOX_INTERVALS_MS` ladder and `wordId` naming. Keep the package pure:
no imports from React, DOM, network or clock; `rng` and `now` are parameters.

## Tests (§16.1, all required)

Vitest + fast-check. Property: folding any permutation of a log yields a deep-equal Fold.
Every listed case in §16.1. Coverage of `packages/core` at 100 % lines is the bar; the engine is
the product.

## Done when

`pnpm test` green; `tools/simulate` (ticket 03) can import the package; `what.md` §5 marked
`live`; ADR-0019 referenced from `params.ts`.

## Comments

**2026-09-18 — resolved.** `packages/core` is rewritten to `what.md` §5: `types.ts`, `params.ts`
(ADR-0019 numbers), `day.ts`, `fold.ts`, `progress.ts`, `streak.ts`, `pace.ts`, `queue.ts`,
`goal.ts`, `index.ts`. The old `BOX_INTERVALS_MS` ladder, `nextBox` and the `wordId` naming are
gone. 93 tests over 10 files (Vitest + fast-check 4.10.1), every §16.1 case present by name,
100 % of lines and 99.27 % of branches in `packages/core/src` covered
(`pnpm --filter @kl/core run coverage`; the one uncovered branch is the unreachable
"not in `recent` at all" arm of the least-recently-shown fallback).

The 90-day simulated user (mulberry32, 85 % accuracy, 20 min/day → goal 200, 200 words):
200/200 words conquered, fastest 7 days, median 13, slowest 44 — so the ladder does allow the
seven-day conquest ADR-0019 promises without making it typical.

Six readings of §5 that the text left open were resolved and written back into it: an unseen item
counts as due (its first correct review promotes it to box 2, which is what makes seven days
reachable); pool 2 is evaluated before pool 1, because its guard *is* "pool 1 is thin";
`progress().percent` is 0..100; `recent` is most-recent-first; the streak's floor of 10 is a
constant in `streak.ts`, not a tunable; and every pool is drawn from the content package.

