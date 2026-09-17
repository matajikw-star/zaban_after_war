# 04 — Entries that are not English words

Status: open — needs a product decision
Type: content
Found by: word-data batches 20 and 21, 2026-09-17

Ingest rule 3 gives every tested option a lexicon entry. Two kinds of option do
not deserve a flashcard, and both are now in `content/lexicon/`.

## 1. Invented options — 2 entries

`arshad-1404-p06` q23:

```
Cities produce and distribute the resources that provide better livelihoods
for urban and rural residents ..... .
    alike  |  likely  |  as like  |  as likewise
```

`as like` and `as likewise` are **not English**. The examiner built them out of
the correct answer `alike` and the distractor `likewise` so that they would look
plausible and be wrong. They are now `content/lexicon/as-like.json` and
`as-likewise.json`.

The batch-21 agent did the right thing rather than inventing a meaning: each is
written as a single `phrase` sense whose definition says plainly that it is not
standard English, with a Persian translation naming the correct form and
confusables pointing at `alike` / `likely` / `likewise`.

**That is the best possible card for a non-word, and it is still a bad card.**
A user drilling `as like` is spending a review on something they should never
write. Recommend excluding both from the shipped curriculum.

## 2. Latin phrases — a recurring question type, ~14 entries

The exam has a **Latin-phrase slot at q23**, and it has appeared three years
running. Each question mints four entries.

| paper | q | key | distractors |
|---|---|---|---|
| `arshad-1403-p04` | 23 | in flagrante delicto | in loco parentis, habeas corpus, actus me invito factus |
| `arshad-1404-p05` | 23 | non sequitur | bona fide, semper fidelis, morior invictus |
| `arshad-1405-p05` | 23 | sui generis | nihil novi, lapsus calami, petitio principia |

This is **legitimate tested content** — the slot recurs, so a candidate really
does need these. But it is a distinct category from English vocabulary, and the
product should probably know that: the pronunciation hints (`تداعی صوتی`) the
hint pass generates from `ipa` are built for English sounds, and the `ipa` on a
Latin maxim is an approximation of how English speakers say it. The batch-20
agent flagged its own `actus me invito factus` IPA as the field it would least
defend.

Two specific problems inside the set:

- **`petitio-principia` is a misspelling.** The rhetorical fallacy is *petitio
  principii*. The exam printed `principia` and it was transcribed verbatim as
  ingest rule 1 requires, so the id is frozen on a misspelling. Recorded in
  `01-lemma-reports.md`.
- **`actus me invito factus`** is a real legal maxim, but the paper prints it as
  `in actus me invito factus`, which is not idiomatic Latin. Very likely an
  invented distractor in the same spirit as `as like`. It was never the answer.

## The decision this needs

Ids are frozen (constitution rule 6), so nothing here can be deleted or
renamed. The question is what the **chunk builder** ships:

1. **Ship everything.** Simplest, and every entry has a real occurrence. Costs
   users reviews on `as like`.
2. **Exclude non-words from the curriculum, keep the entries.** The two invented
   options stop entering anyone's queue; the files stay so `occurrences[]` and
   the exam cross-reference remain intact. Recommended.
3. **Give Latin phrases their own category** so the card can present them as
   phrases rather than vocabulary, and so the hint pass can skip تداعی صوتی for
   them. Worth doing whenever the card renderer is built, not now.

## Note for the rest of the pass

Agents should report an entry that is not a real word here rather than
inventing a meaning for it. Added to `extraction/WORD-DATA.md`.
