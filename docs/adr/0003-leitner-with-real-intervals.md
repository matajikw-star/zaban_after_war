# ADR-0003 — Leitner boxes with real intervals

**Status:** accepted · **Date:** 2026-09-10

## Context

v1's boxes had no time dimension: word selection was weighted-random within the current
sub-level, so a word could recur minutes after being answered and a long-untouched word never
became urgent. See `docs/postmortem-v1.md` §1.

The brand is Leitner (`konkourleitner.com`) and the box metaphor is legible to students — five
boxes is something a candidate understands at a glance. The strongest open scheduler available
is FSRS, which is not legible at all.

## Decision

Keep the five-box Leitner model, and give each box a real interval:

| Box | Interval | Meaning |
|---|---|---|
| 1 | same session, at least 10 min later | just introduced, or just forgotten |
| 2 | 1 day | |
| 3 | 3 days | |
| 4 | 7 days | |
| 5 | 21 days | مسلط — still reviewed, never retired |

`remembered` moves a word up one box; `forgot` returns it to box 1. A word is **due** when
`lastReview + interval(box) <= now`. The session queue is due words, oldest-due first; when it
empties, new words are **introduced** at a capped daily rate.

Box 5 keeps a 21-day interval rather than exiting the rotation, because exam candidates need
retention across months, not up to a checkpoint.

The scheduler lives in `packages/core` as a pure function of `(events, now) => queue`. Nothing
in it touches React, the network, or `Date.now()` directly.

## Consequences

- Sessions become shorter and lumpier than v1's endless queue. That is spaced repetition
  working, and the UI must frame "you are done for today" as success rather than as an empty
  state.
- The 49-step level/sub-level curriculum disappears. Structure now comes from the introduction
  rate and the due queue. Free-tier gating moves to which *chunks* a user may fetch (ADR-0004).
- Because state is a fold (ADR-0002), the interval table can be retuned, or replaced with FSRS,
  by re-folding the existing log. Treat this table as tunable, and measure it against real
  retention once there is data.
