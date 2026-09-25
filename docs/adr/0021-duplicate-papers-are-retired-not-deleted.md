# ADR-0021 — A duplicate paper is retired with `duplicateOf`, never deleted

**Status:** accepted · **Date:** 2026-09-25

## Context

ADR-0007 made the distinct English paper the unit of ingest so that one question is never
counted as several occurrences. In 1399 and 1400 it failed: S2 split six papers into 17 paper
ids, each was transcribed separately, and every word they test was counted two to four times.
`affluent` showed «۶ بار در کنکور»; the truth is 3. The inflation reached `stats.timesTested`,
`byYear`, `priority`, the card's exam badge, the progress weight (`weight = timesTested`) and the
order the frozen ranks were assigned in (ticket `.scratch/dev-content/issues/03`).

Measured over the 58 exam files with token-set Jaccard on normalised stems (case, punctuation
and blank markers removed): a question's best match in a paper of **another** year never scores
above 0.27; the same question read twice scores 0.69–1.0. At the paper level the split is
total — 17 same-year pairs share 14 or 15 of 15 stems, every other pair in the corpus shares 0,
and one cross-year pair shares 1 (a question reused from 1398 in 1399, which is real).

The root cause was in S2: the OCR reads `e` as `c` on some print runs, fingerprints are sets of
exact tokens, and two scans of one paper fell under the clustering threshold
(`extraction/PIPELINE.md` → "Why 1399 and 1400 split").

The ids could not simply be merged away. ADR-0009 makes paper ids permanent, occurrences,
`senses[].testedIn` and S8's selection name them, and a deleted transcript is evidence lost:
the duplicate transcripts are independent readings of the same page, and they agree option for
option on 164 of 165 questions.

## Decision

**A paper that duplicates another keeps its file and its id and is retired:**

```json
"duplicateOf": "arshad-1400-p03",
"duplicateReason": "Same English test as arshad-1400-p03: 15/15 stems match …"
```

- **The kept paper** of a group is chosen by one rule, computable from the exam files alone:
  most questions, then fewest `uncertain[]` notes (the paper's and its questions'), then the
  most booklets (`bookletCount`), then the lowest paper id (`chooseKept` in
  `packages/content/src/duplicates.ts`).
- **S6 folds a retired paper as a second reading of the kept one.** Its questions are booked on
  the kept paper's id, question number, part and key; a word is booked at most once per
  question. So one question counts once — and an option both transcripts agree on but
  lemmatised differently (`creatively` as itself in one, as `creative` in the other) still
  reaches both word ids, exactly as it would have in any other year. Without this, twelve words
  (eight of them shipping) would have dropped to zero occurrences over a lemmatisation choice,
  not a fact about the exam. An option the transcripts disagree on is a misreading and books
  nothing (`content:lint` check 17 names it).
- **No occurrence points at a retired paper.** They are moved, not flagged: occurrences to the
  kept paper by S6, `senses[].testedIn` by a one-off lossless migration
  (`extraction/scripts/migrate_duplicate_papers.py`). The stats stay one fold over
  `occurrences[]`, and nothing downstream — the build, the card's stems, S10's validation —
  needs to know retired papers exist. S7 and both S8 steps skip retired papers; the kept paper's
  reach includes its duplicates' booklets.
- **`content:lint` guards it** with one measure (`STEM_MATCH_THRESHOLD = 0.6`,
  `MAX_SHARED_STEMS = 3`): check 15 blocks two live papers of a year sharing more than three
  stems and names the paper to keep; 16 blocks a `duplicateOf` that names a missing, retired,
  other-year or non-matching paper, or has no reason; 17 warns on a retired question that reads
  differently from its kept counterpart; 18 flags an occurrence left on a retired paper
  (blocking when the word ships).
- **S2 folds `e` into `c` before fingerprinting** and re-clusters: each kept paper's cluster
  absorbs its duplicates' booklets, and the retired ids own no cluster. They are burned through
  their transcripts, so ADR-0009's "never reused" still holds with no `papers.jsonl` row.

## Consequences

- 1399 and 1400 count six papers, not seventeen; 924 questions are counted, not 1,089.
  226 shipping words lost 1–5 of `timesTested`; the sum over the lexicon fell 2,586 → 2,156.
  The shipped set and the free 150 are unchanged, because ranks are frozen (`what.md` §6.2) —
  they were assigned from the inflated priorities, and re-ranking from scratch now would swap
  41 of the free 150. That is the owner's call while there are no users (ticket 03 comments).
- `bibliographic` exists only because one duplicate transcript misread «bibliographies». No
  fold derives it any more; it keeps its stale occurrence on the retired paper, ships nothing
  (no senses) and is named by lint check 18 until the owner decides its fate. Ids are not
  deleted by a script. *Owner decision, 2026-09-25:* the id is retired — its file keeps a
  `retired: { reason, date }` field, empty `occurrences` and zeroed stats, never ships, and S6
  carries the field through; the misreading is noted in 1400-p12 q5's `uncertain[]`, which
  quiets check 17.
- A future year that splits the same way is caught twice: S2's fold before any money is spent,
  and check 15 after S6, which `/complete-year` now runs.
- A retired transcript is a free second reading. Where it agrees with a kept paper that
  S5 flagged `needs-owner-review`, it corroborates the kept transcript more strongly than the
  OCR could.
