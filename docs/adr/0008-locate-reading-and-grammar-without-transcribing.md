# ADR-0008 — Reading and grammar are located, never transcribed

**Status:** accepted · **Date:** 2026-09-10

## Context

The English section of a konkour booklet is two different things bolted together:

- **زبان عمومی** — Part A vocabulary and the Part B cloze. Shared across many field codes,
  about two pages, and the only thing the lexicon needs. This is what ADR-0007 made the
  unit of ingest.
- **زبان تخصصی** — the reading comprehension under Part C. Written for the individual field,
  three to four pages, different in every booklet.

S1 exploited that split for speed: it stopped OCR the moment it saw a `Part C` marker, because
nothing past it feeds the lexicon. S2 fingerprints only the pages before Part C, because the
per-field passages drown the shared signal (0.25 similarity with them, 0.94 without).

The cost of stopping there is that **the corpus does not record where the reading is**. For 843
of the 899 booklets routed so far, the state said only "English starts on page 2, Part C opens
on page 3" — nothing about where the section ends. A future reading or grammar feature would
have had to re-route all 2,241 booklets, 7.7 GB of scans, to find out.

The scans are the one input that is expensive to revisit and that never changes. Anything we
can learn from them once should be learned once.

## Decision

**S1 carries on past the Part C marker to the end of the English run and records the page
range. It does not transcribe it, and no model ever sees those pages.**

Each `routes.jsonl` row gains three fields:

| field | meaning |
|---|---|
| `readingPages` | contiguous span from the page that opens Part C to the last English page |
| `grammarPages` | pages carrying a standalone "Structure and Written Expression" heading |
| `sectionScan` | `ok`, `capped`, `no-part-c` or `no-english` — how much to trust the range |

Three consequences follow deliberately:

1. **Per booklet, not per paper.** The reading is per-field, so recording it only for each
   paper's representative would capture 60 of 899 booklets and leave the other 93% needing a
   re-scan — exactly the outcome this ADR exists to prevent. Deduplication stays a property of
   the general pages alone.
2. **The cost is CPU, not tokens.** The local OCR that classifies a page as English is already
   the router; the scan just does not stop early. Nothing is rendered, nothing is sent to a
   model, and the extraction scope in `.claude/agents/exam-extractor.md` is unchanged: Part A
   and Part B only.
3. **`englishPages` keeps its old meaning** — the general run through the page that opens
   Part C. The reading range lives in its own field. Widening `englishPages` would have quietly
   changed two things that read it: S2's choice of representative booklet, and S5's
   corroboration pool. Both were re-pointed at `general_pages`/`scope_pages` in the same commit
   so that neither can drift with the length of a field's reading passage again.

Grammar needs almost nothing here. Grammar items in this corpus sit inside Part A ("Vocabulary
and Grammar") and the Part B cloze, and the extractor already transcribes them with
`part: "grammar"` — 29 of the first 97 questions. Only the lexicon fold skips them, because all
four options share one lemma. A standalone grammar block is rare: 10 of the 2,239 pages OCR'd
so far. `grammarPages` records those.

## Consequences

- A reading or grammar feature starts from `routes.jsonl` plus
  `python extraction/scripts/s3_render.py --booklet <id> --reading`. The booklets are not
  reopened by hand, and `raw_konkour_files/` stays out of the loop (ADR-0006).
- The section scan is the expensive half of S1 now. A reading page is dense English, which is
  the slow case for the OCR; the general pages are mostly Persian, which is the fast one.
  Measured on 1405 with the general pages already cached: 3.1 booklets/min on 8 workers, about
  four reading pages each. It is still free of tokens, still resumable and still cached, so a
  re-run costs nothing.
- Booklets routed before this ADR carry no `sectionScan`. `s1_route.py --sections` backfills
  exactly those, replaying phase one off the OCR cache and paying only for the reading pages.
- The reading text itself is **not** content. The cached OCR under `extraction/cache/ocr/` is
  good enough to locate a section and nowhere near good enough to publish; when the feature
  arrives it gets a real extraction pass of its own.
