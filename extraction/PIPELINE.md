# The extraction pipeline

Why this pipeline is shaped the way it is. The operating instructions are in
`RUNBOOK.md`; this file is the reasoning behind them, so that a future session
does not "simplify" a stage that exists for a reason.

## The problem

`raw_konkour_files/` holds 2,241 scanned exam booklets: 7.7 GB, **52,467 pages**,
every field of the Iranian MA entrance exam, years 1386–1405. None of them has a
text layer — `pdftotext` returns only the `konkur.in` watermark. English is a
few pages inside each booklet; the rest is the field's specialist paper.

Sending the corpus to a model is not an option. Sending 52,467 page images would
cost tens of millions of input tokens to extract a few thousand questions.

## The shape of the answer

Spend CPU where CPU suffices, and tokens only where nothing else will do.

```
S0 survey     2,241 PDFs                     free   seconds
S1 route      -> ~5 English pages each       free   ~25 s/booklet, parallel
S2 cluster    -> a few dozen unique papers   free   seconds
S3 render     -> 2-3 PNGs per paper          free   seconds
S4 extract    -> questions as JSON           TOKENS  one subagent per paper
S5 crosscheck -> disputes vs local OCR       free   seconds
S6 lexicon    -> content/lexicon/*.json      free   seconds
```

Two of those stages carry the whole design.

### S1 — the router, and why local OCR is the right tool for it

The local OCR model reads Latin script and does not know Persian, so a Persian
page comes back as noise. That asymmetry is a free language classifier: a page is
part of the English section when enough of its tokens are real English function
words (`english_score` in `common.py`). Nothing about this needs a model.

Routing removes about 90% of the corpus at zero cost.

### S2 — the dedup, and why it is worth more than every other optimisation

A year's English test is shared across many field codes. Measured in 1403: codes
1101, 1102 and 1301 carry one identical paper; 1103 and 1501 carry another. So
~120 booklets per year collapse to a handful of distinct papers.

This is a 20–40× cost reduction, and it is what makes the whole project cheap
enough to do carefully. It also means the unit of extraction is a **paper**, not
a booklet — see `docs/adr/0006-paper-as-the-unit-of-ingest.md`.

Fingerprints are order-free bags of distinctive words, because OCR scrambles
reading order across columns but keeps the words themselves. Matching is
deliberately conservative: a false split costs one extra extraction, a false
merge would silently lose a real paper.

### Why the extractor is kept blind

S4 subagents are **not** given the S1 OCR text, even though it exists and would
be free to include.

Local OCR is accurate about *words* and unreliable about *structure*. On one
sampled page it read every word correctly but emitted the options in the order
1, 3, 2 and dropped the fourth. Option order is exactly what must not be wrong:
`key` is an index into it, so a scrambled order silently binds the answer to the
wrong word.

If the model saw that text, its output would inherit those errors and S5 would be
comparing a transcript against its own source. Keeping the two independent is
what makes the free cross-check mean something.

### S5 — the free accuracy net

For every option the model wrote, S5 asks whether the local OCR of that same page
contains those words, fuzzy-matched and **order-free** — testing OCR only where
OCR is strong. A paper below 90% corroboration is re-extracted once on Opus, then
escalated to the owner. No loops.

## Data contracts

**`extraction/state/`** — pipeline state, committed, append-only in spirit.

| file | one row per | owned by |
|---|---|---|
| `booklets.jsonl` | PDF in the corpus | S0 |
| `routes.jsonl` | booklet, with its English page numbers | S1 |
| `papers.jsonl` | distinct English paper, with its members and `extraction` status | S2 / `status.py` |
| `crosscheck.jsonl` | extracted paper, with disputed options | S5 |

**`extraction/cache/`** — gitignored and fully regenerable: OCR text per page,
rendered PNGs per paper.

**`content/exams/<paperId>.json`** — the transcript. Schema and rules live in
`.claude/agents/exam-extractor.md`, which is also the extractor's prompt, so the
spec and the instruction cannot drift apart.

**`content/lexicon/<word-id>.json`** — the fold. Every occurrence records
`isAnswer`, and `stats` carries `byYear`, `timesAsAnswer` and a `priority` score:
a word that was the correct answer three years running outranks one that has only
ever been a distractor.

## Properties worth preserving

- **Resumable.** Every stage skips work already recorded. A killed run loses at
  most the item in flight.
- **Idempotent.** S6 is a fold over all of `content/exams/`, so re-running after
  a re-extraction repairs rather than duplicates.
- **Context-cheap.** Page images never enter the orchestrator session. That is
  why one session can run many batches, and why resuming costs nothing.
- **Ids are frozen.** Word ids are derived once and never rewritten (`CLAUDE.md`
  → "Word ids"). S6 refuses to rename one and reports the collision.
- **Uncertainty is recorded, never resolved by guessing** — except the answer
  key, which the corpus does not contain and which is therefore always marked
  `keySource: "inferred"` with a confidence.
