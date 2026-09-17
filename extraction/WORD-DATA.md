# Word data — the generation standard

What a generating agent reads before writing a single word. The reasoning lives in
`docs/adr/0012-word-data-is-sense-shaped-and-generated-once.md` (why the shape is
sense-shaped, what each field is for) and
`docs/adr/0013-one-entry-per-spelling-no-homograph-split.md` (why a word is never
split). The field-by-field shape with a worked example is
`docs/plan/content-pipeline.md` § 3. **This file is the standard: the rules the
owner settled, and the mechanics of running a batch.**

The job: 2,098 lexicon entries have correct ids, correct occurrences and empty
content fields. Fill in `level`, `senses`, `confusables`, `homograph`,
`provenance` — and nothing else.

## The legal premise — read this first

The v1 lexicon was extracted from a copyrighted book, and that is why v1 was
abandoned (`docs/postmortem-v1.md` → "Legal note"). v2's premise is that
vocabulary tested in a public exam, with **translations, definitions and examples
written fresh**, is a different and defensible asset.

So: **never copy a definition, translation or example from a dictionary, a book
or a website.** Consulting a source to check a fact — which senses a word has,
how it is pronounced, whether a usage is current — is research and is fine. The
wording is always ours.

The owner confirmed (2026-09-17) that using a free dictionary API is acceptable
to them, *and* that it should only happen if it is meaningfully cheaper or more
accurate. It is neither: a check of all 45 IPA strings in the calibration batch
against English Wiktionary found **zero errors**, and the API rate-limited at one
request per second. So there are no bulk lookups. Spot-check roughly one word in
ten per batch if you want the reassurance; write everything else from knowledge.

## The two provenances — never cross them

**Extraction owns** `id`, `lemma`, `surfaceForms`, `occurrences`, `stats`,
`domain`, `status`. They are a fold over `content/exams/` and are re-derived on
every pipeline run. **Leave them exactly as they are.**

**You own** `level`, `senses`, `confusables`, `homograph`, `provenance`. Nothing
re-derives them.

This is why nothing edits a lexicon file by hand.
`extraction/scripts/s10_apply_word_data.py` is the only sanctioned writer: it
reads the existing entry, replaces those five keys, and saves through the
pipeline's own `save_json`, so neither the other provenance nor the file
formatting can drift.

## Read the question before you write

A word's sense **in the exam** is the sense to lead with, and for a context word
the stem is the only evidence of which sense was meant. `s11_batch.py` writes a
`context.txt` holding, for every word in the batch, the verbatim stem, the four
options and the inferred key of each question it appears in. That file is the
only thing you need to read — never open a scan, and never go to the images.

Two things it will show you that matter:

- **`keyConfidence: low` or an `uncertain[]` note** means the extraction was not
  sure. Write from the word, not from the shaky question, and say so in your
  report.
- **20 papers carry `needs-owner-review`** (1403×2, 1402×2, 1400×7, 1399×7,
  1398×2). A garbled-looking stem may be why. Same rule: write from the word.

## The rules the calibration settled

Twenty-five words were written and the owner reviewed every one against its exam
sentence. These answers are binding on the remaining 2,073.

### 1. How many senses

**The exam's meaning first, then at most one or two further meanings a candidate
genuinely needs.** Not only the tested senses — a `run` card that teaches "خطر
کردن" and not "دویدن" is a worse card. Not a dictionary entry either. `run` has
four senses; most words have one.

### 2. `level` describes `senses[0]`

CEFR `A1`..`C2`, and it is the level of **the meaning the exam tested**, not of
the word in the abstract. `run` the word is A1; `run the risk of` is C1, and the
entry is labelled `C1`, because the card leads with `senses[0]`. For a
single-sense word the two readings coincide. This amends ADR-0012.

### 3. `testedIn` covers every tested occurrence, distractors included

Lint rule 13: between them the senses must account for every `occurrenceType:
"tested"` occurrence, including the ones where the word was a **wrong option**.
Judge which sense a candidate would read that wrong option in. `s10` enforces
this — a batch where any tested occurrence goes unclaimed is rejected whole.

A **context** occurrence is never claimed; a context-only word has `testedIn: []`
on every sense, and that is correct.

### 4. A collocation-bound meaning is its own sense

`vicious circle` is a sense of `vicious`, listed first, because the exam question
turns on the collocation — `cruel`, `fierce` and `severe` all mean "vicious" and
none of them fits `circle`. Same for `run the risk of`, `bear a resemblance to`,
`dwell on`.

### 5. Examples: faithful at a teaching level, not word-for-word

> ترجمه باید در حد آموزشی وفادار به جمله باشه ولی نه لزوما کلمه به کلمه

One `{en, fa}` pair per sense, 8–14 words, a full sentence. The Persian must let
a learner map the English across: do not add an idiom the English does not use
(`به جان می‌خری` for "run the risk"), do not drop a structure the sentence is
built on (the by-profession/by-avocation pairing), do not add a verb that is not
there (`رم کرد و در رفت` for "bolted").

**Never the exam sentence.** That is joined in at build time from
`occurrences[]`, and reusing it teaches the answer to one question rather than
the word. `s10` rejects an example that reproduces one of the word's own stems.

### 6. Translations: at most three

Most common first. More than three only when the word genuinely has a further
common meaning that the first three do not cover. This is the field the app
shows, so the count drives how crowded a card looks.

### 7. `definition`: learner-dictionary register, in English

Not a synonym. "to slow something down or make it more difficult to move or
happen", not "to hinder". Written fresh — see the legal premise. No markdown: the
app renders this string, so asterisks ship as literal characters. Use quotation
marks to set off a collocation.

### 8. Note languages

`confusables[].note` is **Persian** — the user reads it.
`homograph.note` is **English** — only the owner and later passes read it.

### 9. `homograph` never proposes a split

One spelling is one entry (ADR-0013). There are no `word-1` / `word-2` ids.

`homograph.suspected: true` means **the senses are far enough apart that a reader
would not guess one from another** — different stress, different part of speech,
unrelated etymology (`content`, `bear`, `bolt`). Two consumers read it: the card
renderer, which shows such senses as separate blocks, and the hint pass, which
must say which sense its mnemonic targets. When true, `note` explains the
distance.

### Other standing rules

- **`confusables`** — the words this one is mistaken for, visible in the four
  options while you read them (`conscience`/`conscious`, `affluent`/`effluent`,
  `vicious`/`viscous`). Konkour distractors are built from exactly this. Leave
  the array empty when there is genuinely nothing; a forced confusable is worse
  than none.
- **`ipa`** — per sense, because `attribute` the verb and the noun differ. Use
  the **learner-dictionary (Oxford/Cambridge) convention**: `/r/` not `/ɹ/`,
  `/e/` not `/ɛ/`, syllabic `/ˈkənˈtrɪʃn/`. The hint pass generates `تداعی صوتی`
  hints *from* this, so a wrong one teaches a wrong sound.
- **Domain terms** — 45 context words carry a `domain` block with field codes.
  Use the discipline's own Persian term, not a general paraphrase: `morphology`
  in linguistics is «صرف / ساخت‌واژه», not «ریخت‌شناسی». Nothing maps a field code
  to a field name yet (`.scratch/stem-vocab/issues/02-field-code-names.md`); it
  does not block the work, but say so when the field is ambiguous.
- **`status` stays `draft`.** Only the owner promotes to `approved`.
- **A wrong lemma is reported, never renamed.** Word ids are frozen forever
  (constitution rule 6). `content/lexicon/histrionic.json` has
  `surfaceForms: ["histroinic"]` — a typo in the exam paper, transcribed verbatim
  as ingest rule 1 requires. Do not fix it; the lemma is right.
- **Hints are a different operation.** `content/hints/<word-id>.md` stays empty.
  Separate template, separate owner approval one by one, and it runs after this
  pass so that a mnemonic knows which sense it is for.

## Running a batch

### 1. Cut it

```
python extraction/scripts/s11_batch.py --status
python extraction/scripts/s11_batch.py --next 40 --out <scratchpad>/batch-NN
```

Order is the generation queue: tested words by `stats.priority`, then context
words by importance × difficulty. The pass is resumable with no state file — a
word is done when its entry has a non-empty `senses`, so `content/lexicon/` is
the state and a fresh session can pick up cold.

### 2. Hand it to an Opus subagent

The owner asked for Opus specifically. **Four to six concurrent, no more** —
twelve concurrent agents hit the account's session rate limit during the
selection pass and nine of twelve were killed by a 429.

**Agents write files; they do not reply with content.** A subagent returning 125
words of JSON in its reply burns the session's context being read. Ask for a file
path, a count, and its uncertainties.

Prompt template:

```
Read extraction/WORD-DATA.md in full, then <batch>/context.txt.

Write the word data for every word in <batch>/words.json to
<batch>/out.json, in the shape s10_apply_word_data.py takes:
{ "<word-id>": {level, senses, confusables, homograph}, ... }
Do not write a `provenance` key - s10 stamps it.

Then validate your own file until it comes back clean:
  python extraction/scripts/s10_apply_word_data.py <batch>/out.json --dry-run

Reply with ONLY: the file path, the number of words written, any
homograph flags you raised, and anything you were unsure about.
Do not paste the JSON.
```

### 3. Apply, check, commit

```
python extraction/scripts/s10_apply_word_data.py <batch>/out.json
python extraction/scripts/s6_lexicon.py --dry-run    # must be 0 created, 0 updated
python extraction/scripts/s8_fold.py --dry-run       # must be 324 already correct
```

Either dry-run reporting a change means something rewrote a field it does not
own — stop and find out what, rather than committing over it.

**Commit per batch, not at the end.** Constitution rule 1: no uncommitted work at
the end of a session.

## Done means

Every word has a `level`, at least one sense with a definition, a translation and
an example, a `provenance`, and every tested occurrence accounted for by some
sense's `testedIn`. Both dry-runs clean. Everything committed and pushed. One
line appended to `wiki/log.md`.

Report the count and every uncertainty to the owner — the owner reads the
uncertainties.
