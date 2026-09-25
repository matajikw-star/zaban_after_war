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
S1 route      -> the English pages, and       free   ~3 booklets/min on 8
                 where reading/grammar sit           workers, resumable
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

S1 also runs the **section scan**: having found the English run, it carries on
past the `Part C` marker to the end of that run and writes down the page range.
See "Reading and grammar" below for why, and ADR-0008 for the decision.

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

Clustering re-runs every time a new year is routed, so the ids it hands out have
to survive that. They do: a paperId is pinned to its cluster, anchored for an
extracted paper by the booklet its transcript was read from. It was not always
so, and two 1405 papers swapped identities - ADR-0009.

#### Why 1399 and 1400 split, and the two guards

A false split was supposed to cost one redundant extraction. In 1399 and 1400 it
cost far more: six papers came out as 17 paper ids, all 17 were transcribed, and
every word they test was counted two to four times (`affluent`: 6, truly 3).

The cause was the OCR, not the threshold. Tesseract reads `e` as `c` on some
print runs and not on others - `becausc`, `applianccs`, `ccntral` - and those runs
fell into different field codes' booklets. A fingerprint is a set of exact
tokens, so every word containing an `e` became two different tokens, and two
scans of one paper fell as low as Jaccard 0.33, under `THRESHOLD = 0.55`, while
scans from the same print run still matched each other (medians 0.7-0.97), so
each run became its own tidy cluster. Other years were spared only because their scans were read consistently:
the lowest same-paper score was 0.55 in 1398 (exactly the threshold) and 0.66 or
more in 1401-1405. Greedy clustering is not the culprit - it never merges two
clusters, but single-link merging repairs only 2 of the 11 extra clusters.

Measured by re-running S2's own clustering over the OCR cache, 2026-09-25:

| fingerprint | 1399 clusters / papers | 1400 | other years | same-paper min J | different-paper max J |
|---|---|---|---|---|---|
| exact tokens (before) | 11 / 7 | 13 / 6 | exact | 0.33 | 0.16 |
| `e` folded into `c` (now) | 7 / 7 | 6 / 6 | exact | 0.55 (1398; 0.62 in 1400) | 0.16 |

**Guard 1, before any money is spent:** `s2_cluster.py` folds `e` into `c`
(`fold_ocr_confusions`) before comparing. Re-clustering with it merged the 1399
and 1400 clusters and changed no other year's row. 1398's weakest pair still sits
at the threshold; a new year whose sizes look like 1399's did (many mid-sized
clusters instead of two or three large ones plus singletons) deserves a look
before extraction.

**Guard 2, after extraction:** `content:lint` check 15 fails when two live papers
of one year share more than `MAX_SHARED_STEMS` (3) question stems, measured by
token-set Jaccard >= 0.6 on normalised stems (`packages/content/src/duplicates.ts`).
`/complete-year` runs it after S6. The fix it asks for is mechanical - its
message names the paper to keep - and follows ADR-0021: the other paper keeps its
file and id, gains `duplicateOf` and `duplicateReason`, and S6 is re-run. It
never deletes a transcript or reuses an id.

### Reading and grammar — located, never transcribed

The English section is two things. زبان عمومی — Part A vocabulary and the Part B
cloze — is shared across field codes and is the whole of what the lexicon wants.
زبان تخصصی — the reading comprehension under Part C — is written per field, runs
three to four pages, and is out of scope.

Out of scope is not the same as unknown. The scans are the one input that is
expensive to revisit and never changes, so S1 records where the reading sits even
though nothing reads it:

| field on a `routes.jsonl` row | meaning |
|---|---|
| `englishPages` | the general run, through the page that opens Part C. Unchanged by the section scan - S2 and S5 both key off it. |
| `readingPages` | contiguous span from the Part C page to the last English page |
| `grammarPages` | pages with a standalone "Structure and Written Expression" heading |
| `sectionScan` | `ok` / `capped` / `no-part-c` / `no-english` |

Recorded **per booklet**, not per paper: the reading is per-field, so a paper's
representative stands in for its 29 field codes on the general pages and for
nobody at all on the reading.

The cost is CPU, never tokens. No reading page is rendered, and none reaches a
model. When a reading feature is actually built, the address is already on disk:
`s3_render.py --booklet <id> --reading` turns it into images.

Grammar needs almost nothing here. Grammar items in this corpus live inside
Part A and the Part B cloze, and the extractor already transcribes them tagged
`part: "grammar"` - 29 of the first 97 questions. Only S6 skips them, because all
four options share a lemma. A standalone grammar block is rare: 10 of the first
2,239 pages OCR'd.

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

The same check runs over every word of every **stem**, at the same floor, for the
reasons in ADR-0010: the stem is the sentence the learner is shown and the pool
context vocabulary is later drawn from, so an unverified stem would put a
hallucinated word straight into the lexicon. Measured across the seven 1405
papers: 97–100% of stem words corroborated, every miss an OCR failure on a proper
noun or a short word rather than a model error.

### Context vocabulary — captured now, judged later

Stem words that are never one of the four options are real konkour vocabulary
with no lexicon entry today. They are not lost: the stem is stored verbatim, so
the words are on disk and only the judgment about them is missing.

That judgment is deliberately **not** S4's. S4 sees one paper and would have to
guess which words matter; a later pass reads all ~830 stored stems as text and
can use repetition across years as evidence. It is also revocable — re-running it
costs the price of the text (~20k tokens for eight years), while getting it wrong
inside S4 would cost a re-read of every page image. See ADR-0010.

## Data contracts

**`extraction/state/`** — pipeline state, committed, append-only in spirit.

| file | one row per | owned by |
|---|---|---|
| `booklets.jsonl` | PDF in the corpus | S0 |
| `routes.jsonl` | booklet: its English page numbers, and where its reading and grammar sit | S1 |
| `papers.jsonl` | distinct English paper, with its members and `extraction` status | S2 / `status.py` |
| `crosscheck.jsonl` | extracted paper, with disputed options and stem words | S5 |

**`extraction/cache/`** — gitignored and fully regenerable: OCR text per page,
rendered PNGs per paper.

**`content/exams/<paperId>.json`** — the transcript. Schema and rules live in
`.claude/agents/exam-extractor.md`, which is also the extractor's prompt, so the
spec and the instruction cannot drift apart. Two fields are added after
extraction and never by the extractor: `duplicateOf` and `duplicateReason` retire
a paper that turned out to be another paper's test again (ADR-0021). A retired
paper is folded as a second reading of the kept one, so it adds no count, and it
owns no row in `papers.jsonl`.

**`content/lexicon/<word-id>.json`** — the fold. Every occurrence records
`isAnswer`, and `stats` carries `byYear`, `timesAsAnswer` and a `priority` score:
a word that was the correct answer three years running outranks one that has only
ever been a distractor.

## Properties worth preserving

- **Resumable.** Every stage skips work already recorded. A killed run loses at
  most the item in flight.
- **Idempotent.** S6 is a fold over all of `content/exams/`, so re-running after
  a re-extraction repairs rather than duplicates.
- **One question counts once.** A paper id names one English test; two ids for
  one test are a bug that `content:lint` check 15 blocks (ADR-0021).
- **Context-cheap.** Page images never enter the orchestrator session. That is
  why one session can run many batches, and why resuming costs nothing.
- **Ids are frozen.** Word ids are derived once and never rewritten (`CLAUDE.md`
  → "Word ids"). S6 refuses to rename one and reports the collision. Paper ids
  are pinned to their cluster the same way (ADR-0009), so re-clustering after a
  new year is routed is a safe, ordinary operation.
- **Uncertainty is recorded, never resolved by guessing** — except the answer
  key, which the corpus does not contain and which is therefore always marked
  `keySource: "inferred"` with a confidence.
