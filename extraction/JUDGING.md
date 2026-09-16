# S8 — judging the stem-vocabulary shortlist

The criterion and the standard for the pass that turns the S7 shortlist into
`yes` / `no` / `domain-term`. The reasoning is `docs/adr/0011-context-vocabulary-is-selected-by-importance-not-frequency.md`;
this file is what a judging agent reads.

## The criterion

**A stem word earns a lexicon entry when a candidate plausibly does not know it
AND the sentence leans on it.** Importance crossed with difficulty. Neither
factor alone is enough, and the product is what matters: a word nobody needs
teaching scores zero however load-bearing it is, and a genuinely hard word
scores zero if the sentence would read the same without it.

The reader is an Iranian MA/PhD candidate sitting the konkour English test.
Assume solid B1-B2 English: they know school vocabulary, common academic words,
and they can read a newspaper. They are not native speakers and they have not
read widely in English.

## The three verdicts

| verdict | meaning |
|---|---|
| `yes` | earns a lexicon entry as `occurrenceType: "context"` |
| `no` | kept classified in `stem-vocab.json`, not taught |
| `domain-term` | hard and load-bearing, but the vocabulary of a discipline rather than of konkour English. Kept, flagged, attributed to the field codes of the papers it appeared in. |

## What the calibration settled

Thirty words were judged and the owner reviewed every one against its exam
sentence. The rules that came out of it, in force:

1. **Transparent derivatives are not automatically out.** `increasingly`,
   `largely`, `observer`, `climber`, `instructor`, `thinkers`, `troublesome`
   are all `no` — but so is the rule that would have killed them wholesale.
   Four of the eleven accepted words were derivatives. Judge whether *this*
   derivative is transparent to a B2 reader, not whether it is a derivative.
   `attainable` from `attain` is not transparent; `strongly` from `strong` is.

2. **A gloss in the sentence lowers the score.** When the stem defines the word
   in apposition or parentheses — `attainable (that is, within reach)`,
   `dentaries (jaws)` — the word blocks comprehension much less, because the
   sentence hands the reader its meaning. Still judge, but weight it down.

3. **Where the blank sits matters.** If the blank is a preposition or sits far
   from the word, the word is background. `zest` is the clearest `yes` in the
   calibration precisely because the blank sits directly against it.

4. **`rare` is not proof of difficulty.** The frequency list is web-derived and
   has gaps: `retire` is absent from it and is still a `no`. Never reason from
   the band or the rank; reason from the word and its sentence. The rank is
   given as weak background only.

5. **Absence of recurrence is not evidence of anything.** `distinctYears: 1` is
   not a mark against a word. A word that blocks comprehension of one question
   blocks it.

6. **A domain term is decided from the word, never from the field codes.** Of
   the shortlist words that attribute to a narrow code set, most are ordinary
   words that merely happened to sit in a narrow paper — `anybody`, `amongst`,
   `anxious` all attribute to 1121. `nitric` is a domain term because it is
   chemistry, not because of where it appeared. If the word is common in general
   journalism as well as in its discipline — `defamation` — it is a `yes`, not a
   domain term.

Worked verdicts from the calibration, for reference:

- `yes` — undertake, exclude, attainable, cling, emit, zest, ridicule,
  meditative, defamation
- `no` — meal, increasingly, largely, accurate, coal, lesson, publish, mile,
  observer, strongly, soil, instructor, climber, retire, destructive, thinkers,
  jaws, troublesome, evolutionary
- `domain-term` — nitric (1121), situational (1121)

## Lemma correction

S7's lemmatiser is rule-based and gets some words wrong. **Word ids are frozen
forever** (CLAUDE.md, constitution rule 6), so a wrong lemma that reaches
`content/` can never be repaired. Every verdict therefore carries a `lemma`
field with the correct dictionary form, which for most words is simply the input
lemma echoed back.

Known bad ones, already found: `undertaken` → `undertake`, `thinkers` →
`thinker`, `jaws` → `jaw`. Expect more of the same shape — plurals and past
participles that the rules failed to reduce. Correct them silently; do not skip
a word because its lemma is wrong.

## Output schema

One JSON array, one object per input word, same order as the input, nothing
else in the file:

```json
[
  {
    "input": "undertaken",
    "lemma": "undertake",
    "verdict": "yes",
    "confidence": "high",
    "importance": 4,
    "difficulty": 4,
    "reason": "The clause turns on it: voyages not undertaken from the view of amusement is the sentence's whole claim.",
    "gloss": "to begin or commit to a task"
  }
]
```

- `input` — the lemma exactly as given, so the result joins back to the batch.
- `lemma` — the corrected dictionary form. Echo `input` when it is already right.
- `verdict` — `yes` | `no` | `domain-term`.
- `confidence` — `high` | `medium` | `low`.
- `importance` — 1-5, how much the sentence leans on the word.
- `difficulty` — 1-5, how likely a B2 Iranian candidate does not know it.
- `reason` — one sentence, English, referring to the word's own sentence.
- `gloss` — short English gloss. Only on `yes` and `domain-term`; omit on `no`.
- `fieldCodes` — on `domain-term` only, the codes from the input row if it had
  any. Omit otherwise.

`importance` and `difficulty` are recorded for every word including the `no`s,
because they are what ranks the accepted words for the data-generation pass and
what a later level-graded edition will sort on.
