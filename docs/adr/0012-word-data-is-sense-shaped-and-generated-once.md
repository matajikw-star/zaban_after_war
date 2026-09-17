# ADR-0012 — Word data is sense-shaped, and generated once

Date: 2026-09-17
Status: accepted

## Context

The lexicon holds 2,098 words with correct ids, correct occurrences and no
content: `translations`, `pos`, `synonyms` and `examples` are empty on every
entry. Filling them is the next operation and, per `docs/plan/product-brief.md`
R8, it is on the critical path to a shippable product.

It is also the most expensive operation in the project. Every field is written
by a model reading the word and the exam question it appeared in. That gives one
governing constraint:

> **Any field left out today costs a full pass over 2,098 words to add later.**

Which cuts both ways. A bloated schema spends the model's attention on fields
nobody reads and gives the owner more to review; a thin one guarantees a second
pass. The question is not "what would be nice" but "what is either required now,
or unrecoverable later".

## What the shape has to be

The existing schema is parallel arrays: `pos[]`, `translations[]`, `synonyms[]`,
`examples[]`, with `occurrences[]` alongside. For a word with one meaning that
is fine. For `attribute`, `bear`, `set off` or `content` it silently loses the
thing that matters most:

**Which meaning was the one the exam tested.**

That is knowable only while reading the question — the stem, the four options
and the key. Once the generation pass is over, recovering it means reading all
1,089 questions again. Parallel arrays cannot express it at all: the second
translation and the third example have no stated relationship.

So the data is sense-shaped, because the subject matter is. A sense carries its
own part of speech, pronunciation, definition, translations, synonyms, example
and the occurrences that tested it.

The migration cost is zero. Every one of these fields is empty today, on every
entry. It will never be this cheap again.

## Decision

`content/lexicon/<word-id>.json` carries `level`, `senses[]`, `confusables[]`,
`homograph` and `provenance` in place of the flat `pos`/`translations`/
`synonyms`/`examples`. `id`, `lemma`, `surfaceForms`, `occurrences`, `stats`,
`domain` and `status` are unchanged — they are produced by extraction and S8 and
this operation does not touch them.

```jsonc
{
  "id": "attribute",
  "lemma": "attribute",
  "level": "B2",
  "senses": [
    {
      "pos": "v",
      "ipa": "/əˈtrɪbjuːt/",
      "definition": "to say that something was caused by a particular thing or person",
      "translations": ["نسبت دادن به", "منسوب کردن"],
      "synonyms": ["ascribe", "credit"],
      "antonyms": [],
      "examples": [
        { "en": "Ancient peoples attributed magic properties to certain stones.",
          "fa": "مردمان باستان ویژگی‌های جادویی را به سنگ‌های خاصی نسبت می‌دادند." }
      ],
      "testedIn": [{ "paperId": "arshad-1402-p03", "questionNo": 12 }]
    }
  ],
  "confusables": [
    { "word": "contribute", "note": "هم‌ریشه نیستند؛ شباهت ظاهری" }
  ],
  "homograph": { "suspected": false, "note": null },
  "provenance": { "model": "claude-opus-5", "at": "2026-09-17", "schemaVersion": 2 }
}
```

## Why each field earns its place

**`definition`** — `product-brief.md` R8 lists "English definition" first among
what a word must carry, and the old schema had nowhere to put one. This is a gap
being closed, not a field being added.

**`level`** — CEFR, A1 to C2. The owner has stated the intent to publish a
level-graded edition later (2026-09-17: "نگهشون داریم برای بعدها اگر خواستیم
ورژن سطح‌بندی شده ارائه کنیم"). Level is a judgment about a word, made most
cheaply by the model already holding the word in mind. Deferring it means that
edition begins with a full re-pass. ADR-0011 already keeps the *rejected* stem
vocabulary classified for the same reason.

**Amended 2026-09-17:** `level` is the level of **`senses[0]`** — the meaning the
exam tested — not of the word in the abstract. The calibration batch surfaced the
gap: `run` as a word is `A1`, but the meaning the exam tested is `run the risk
of`, which is `C1`. Labelling the file `A1` would have put `run` in the beginner
tier of the level-graded edition carrying content no beginner can read. For a
single-sense word the two readings coincide, so this costs nothing and is honest
where it differs. The card leads with `senses[0]`, so the label describes what
the card actually teaches.

**`ipa`** — per sense, because `attribute` the verb and the noun differ. The
hint format the product inherits from v1 is `تداعی صوتی`, sound association
(`docs/plan/content-pipeline.md` § 4): hints are generated *from* pronunciation.
Without it stored, the hint operation re-derives pronunciation for every word it
touches.

**`testedIn`** — the sense-to-question link described above. The single most
expensive thing to recover and the whole reason for the restructure.

**`confusables`** — the words this one is mistaken for. Konkour distractors are
built from exactly this (`conscience`/`conscious`, `content`/`contentment`,
`adapt`/`adopt`), it is visible in the four options while the model is reading
them, and it is invisible afterwards. It also makes a later hint far better,
because the hint's job is to break the confusion.

**`homograph.suspected`** — `CLAUDE.md` gives homographs with genuinely
different meanings a numeric suffix (`bear-1`, `bear-2`), and the lint checklist
already says to split "before users have progress on it". Word ids are frozen
forever (constitution rule 6), so the last moment to notice is while the senses
are being written. The generation pass raises the flag; it never renames a file.

**`provenance`** — which model wrote it, when, against which schema version. A
partial re-run, a model change or a quality problem found in review all need to
know which entries were written by what. Cheap now, impossible to reconstruct.

## What is deliberately left out

- **Hints.** A separate operation with its own template, rewritten more often
  than word data, and owner-approved one by one because a bad mnemonic teaches
  the wrong sound. Bundling it would couple two different review cadences.
- **Word family / derivatives.** Derivable mechanically from the lexicon itself,
  since the derived forms are mostly already present as their own entries. A
  model pass buys nothing a script cannot.
- **Collocations and register.** Real, but not what a flashcard shows, and R6
  argues for fewer concepts rather than more.
- **Audio.** An asset-pipeline question, not a content question, and constrained
  by ADR-0005 (no runtime CDNs).

## Consequences

- `extraction/scripts/s6_lexicon.py` and `s8_fold.py` carry the new keys through
  untouched, exactly as they already do for `domain` and for context
  occurrences. Neither derives them.
- `extraction/scripts/migrate_schema_v2.py` rewrites all 2,098 entries once.
  Zero data is lost because zero data exists in the fields being replaced.
- `docs/plan/content-pipeline.md` § 3 and the lint checklist are updated in the
  same commit.
- `packages/content` will need a build step that flattens a sense list into what
  a card renders. That is presentation, and it belongs there rather than in the
  stored shape.
- **The generation pass runs a calibration batch first.** The selection pass
  proved the pattern on 2026-09-17: thirty words judged, reviewed by the owner
  against the exam sentences, and the review moved the criterion before 1,498
  words were spent on it. Tone, register, how literal a translation should be
  and how long an example runs are all taste, and taste is the owner's. Thirty
  words reviewed is the cheapest insurance the project has against doing 2,098
  twice.
