# 03 — Two stem-quality defects found by reading 606 questions

Status: open
Type: bug
Found by: word-data batches 08, 13, 16, 2026-09-17

Generating agents read the verbatim stem of every question their words sat in.
Three independently flagged the same things. Both were then checked across all
606 vocabulary questions in `content/exams/`.

## 1. The blank marker is not normalised — 17 questions

Most stems mark the gap with dots (`.....`). **17 use hyphens instead**, and
the hyphen runs vary in length:

| paper | questions |
|---|---|
| `arshad-1400-p11` | 15 |
| `arshad-1401-p04` | 2 |

```
The assailant was ---------- by police in a hideout near where the attack ...
Those living on the streets are ... when they are ----------------- to the elements.
```

**Why it matters.** The stem is the example sentence the product shows
(`CLAUDE.md`, ingest rule 4) and the card renderer has to find the gap to render
it. Anything matching only `\.{3,}` silently misses these 17 and shows a raw row
of hyphens to the user.

Not a transcription error — the scan really does print a rule there, and rule 1
says transcribe verbatim. **The fix belongs in the renderer or in a normalising
build step, not in `content/exams/`.** Whatever does it should accept both
markers and any length.

Nothing else is structurally off: **0** stems carry more than one blank marker.

## 2. One genuinely damaged stem — `arshad-1401-p05` q16

```
In terms of helping me overcome my problems with my second-year biology course,
he was not much of a but whether he meant it or not, as a life coach he was
..... to none.
```

A noun is missing after "not much of a", and the clause before "but" has no
verb phrase to close it. Two agents flagged it independently while writing
`rank` and `second`.

- `keyConfidence` is **`high`** and `uncertain[]` is **empty**, so nothing in
  the pipeline surfaces it.
- The key itself is safe: `second to none` is unambiguous and `second` is
  correctly the answer. Only the stem text is damaged.
- It is the **only** one of its kind — a scan of all 606 vocabulary stems for an
  article stranded before a conjunction returns exactly this question.

**Action:** re-read page for `arshad-1401-p05` q16 and repair the stem, or add
an `uncertain[]` note so the renderer can suppress the example. Do not guess the
missing noun.

## What this says about the corpus

One damaged stem in 606 is a good rate. The word-data pass is the first thing to
read every stem closely, so it is the right net for this class of defect — and
it is worth re-running these two checks after the pass finishes, over the full
set rather than the 665 words read so far.
