# ADR-0002 — Progress is an append-only review log

**Status:** accepted · **Date:** 2026-09-10

## Context

v1 stored progress as one mutable JSON blob per user and merged devices with heuristics
("fewer than 5 words in advanced boxes means this is probably a fresh install"). Last write won;
the other device's study session vanished silently. See `docs/postmortem-v1.md` §3.

The app must work fully offline and sync opportunistically, which means two replicas will
routinely diverge. Any design that merges *states* has to invent a conflict rule. A design that
merges *events* does not.

## Decision

The unit of truth is the **review event**:

```ts
type ReviewEvent = {
  id: string;      // UUIDv7 — time-sortable, collision-free across devices
  wordId: string;  // stable lemma slug
  at: number;      // epoch ms, device clock
  grade: 0 | 1;    // 0 = forgot, 1 = remembered
  device: string;  // opaque per-install id
};
```

Events are **append-only** and never edited. All study state — box, interval, due date, streak,
counts, charts — is a **fold** over the log, recomputed on load and held in memory.

Sync is the union of event ids in both directions. It is commutative, idempotent, and needs no
conflict rule, so a device syncing a week late loses nothing.

## Consequences

- Merging is provably lossless; "which device wins" stops being a question.
- Per-word history comes free: retention rates, hardest words, honest progress charts.
- The scheduler becomes swappable. Changing intervals — or moving to FSRS — is a re-fold of
  existing events, not a migration that discards user history.
- The log grows unbounded: roughly 40 bytes per review, so a heavy user reaching 100k reviews
  costs a few MB. Acceptable. If it ever matters, snapshot the fold at a date and keep only
  events after it.
- Device clocks can be wrong or skewed. Store the device timestamp as given, and treat a wildly
  out-of-range `at` as a lint finding rather than silently correcting it.
- The client derives state from events alone. The server stores and returns the log; it does not
  compute study state.
