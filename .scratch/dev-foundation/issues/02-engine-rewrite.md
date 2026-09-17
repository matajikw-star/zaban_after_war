# 02 — Rewrite `packages/core` to the current contracts

Status: ready-for-agent
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
