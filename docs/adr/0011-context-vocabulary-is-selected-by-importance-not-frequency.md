# ADR-0011 — Context vocabulary is selected by importance, not by frequency

Date: 2026-09-17
Status: accepted
Amends ADR-0010, which stands in every other respect.

## Context

ADR-0010 settled *when* stem vocabulary is judged: after extraction, over
`content/exams/*.json` as text, never the scans. It also asserted *how*, in the
sentence that justified the timing:

> The pass reads `content/exams/*.json` — text, never the scans — so it sees
> every stem of 1398-1405 at once and **can use cross-year repetition as
> evidence of what matters**. S4, seeing one paper in isolation, structurally
> cannot make that call.

The sibling ticket turned that into a concrete rule: "a stem word plausibly
needs to recur across N papers or N years before it earns a lexicon file."

That rule was never tested against the corpus, because until 1398-1405 was fully
extracted there was no corpus to test it against. On 2026-09-17 it was.

## The measurement

`extraction/scripts/s7_stem_vocab.py` read all 58 papers — 12,325 stem tokens,
4,542 lemmas across 8 years. Ranked by the number of distinct years a word
appears in, the top of the list is:

> people, all, because, like, out, life, new, while, way, time, work, human,
> often, students, always, found, make, water, man, problems

Not one of these is worth a lexicon entry for an MA/PhD candidate.

The result is not noise, it is structural. **The most frequent words in any body
of English prose are its most ordinary ones.** Recurrence measures how common a
word is. It says nothing about whether a candidate needs to be taught it — if
anything the correlation runs backwards, because the words a learner already
knows are exactly the words that recur.

## First correction, and why it was not enough

The obvious repair is to invert a general-English frequency list: a word common
in general English is one the candidate already has. That works, and it is kept
— it moves `because` and `water` out of contention for free.

But it does not finish the job. Sliced by general-English rank, the surviving
band stays mixed at every depth:

| general rank | still too easy | worth teaching |
|---|---|---|
| 3001-4500 | peak, lights, happened, coach, **chocolate** | accurate, characteristics, seek, debate |
| 4501-6000 | stopped, tall, smile, boss | adequate, regardless, consequences, moral |
| 6001-7500 | **teeth**, fingers, angry, tale | virtually, solely, apparent, boundaries |
| 7501-9884 | novels, shorter, excuse, steal | notion, scholars, cite, uncertainty |

There is no cutoff that keeps `notion` and drops `chocolate`. Difficulty alone,
measured by any corpus statistic, does not separate them.

## Decision

**A stem word earns a lexicon entry when a candidate plausibly does not know it
AND the sentence leans on it.** Importance to understanding the question,
crossed with difficulty — neither factor alone.

This is the owner's criterion from 2026-09-10 (`.scratch/stem-vocab/spec.md`:
"necessary to understand the question"), restored. The frequency rule had
quietly replaced it with something measurable but wrong.

Three consequences follow.

**1. The selection is split into a sieve and a judgment.** Corpus statistics
decide only what provably needs no judgment: function words, and words whose
general-English rank puts them below the assumed baseline (the "plausibly does
not know it" factor is near zero, so the product is near zero however
load-bearing the word is). Everything else — 2,514 lemmas — goes to a language
model, which is the only tool that can weigh a word against the sentence it sits
in. The sieve is free, deterministic and re-runnable; the judgment is neither,
which is exactly why it runs second and on a tenth of the input.

**2. The judgment is per-occurrence, not per-word.** "Load-bearing" is a
property of a word *in its stem*, so the model is shown the exam sentence, never
the word alone.

**3. The year floor is removed.** An earlier draft required 2+ distinct years as
noise protection. S5 already corroborates every stem word against independent
OCR, so the floor protected against nothing — it was the last remnant of the
frequency thinking. Under the real criterion recurrence is simply irrelevant: a
word that blocks comprehension of one question blocks it. Dropping the floor
took the shortlist from 439 to 2,514 and recovered `buttress`, `nostalgic`,
`obesity`, `overturn`, `persist`, `plaintiff`, `quarrel`, `realm`, `toil` and
`tuition`, each of which appears in exactly one year.

## Nothing is discarded

Every one of the 4,542 lemmas is classified and kept in
`extraction/state/stem-vocab.json`, the easy bands included. The owner intends a
level-graded edition later; when it comes, the vocabulary below today's cut is
already sorted rather than needing a re-derivation.

Bands: `tested` (already a lexicon word), `baseline` (below the assumed
baseline), `mid`, `rare`, `compound` (`year-old`, `cutting-edge` — a phrase, not
a word id).

## What this does not change

ADR-0010 stands. The pass still runs after extraction, still reads text and
never a scan, still leaves the S4 schema and `.claude/agents/exam-extractor.md`
untouched, and is still cheap to re-run if the criterion is wrong — which is the
property that made it safe to get the criterion wrong the first time.

## Consequences

- `.scratch/stem-vocab/issues/01-context-vocab-and-stem-display.md` step 2
  ("decide the selection criterion ... from cross-year frequency") is answered
  here and its premise is withdrawn.
- A general-English frequency list is vendored at
  `extraction/data/en-frequency-top10k.txt`. It is web-derived and carries noise
  (`acc`, `wanna`, proper nouns), which is tolerable because it is used only to
  prove a word is common, never to prove one is rare.
- The judging pass is a new stage with a cost the mechanical pipeline did not
  have. It is bounded: 2,514 words, judged once, re-runnable for the price of
  the text.
