# Content pipeline

How a scanned exam paper becomes lexicon data. This is the `ingest` operation from `CLAUDE.md`,
specified.

The sources are poor quality — scans, photos, bad OCR. The pipeline is built around that fact:
**an uncertainty that is recorded is cheap; a confident guess that is wrong poisons the asset.**

## Stages

### 1. Register the source

The owner drops the file in `sources/raw/` and adds a row to `sources/manifest.md`: exam id,
degree, Jalali year, field, page count, quality. Nothing is ingested that has no row.

Exam id format: `<degree>-<year>-<field>`, e.g. `arshad-1402-zaban`, `doctora-1400-zaban`.

### 2. Extract questions → `content/exams/<exam-id>.json`

Every vocabulary question, verbatim, flaws included.

```jsonc
{
  "examId": "arshad-1402-zaban",
  "degree": "arshad",
  "year": 1402,
  "field": "زبان انگلیسی",
  "source": "arshad-1402-zaban.pdf",
  "questions": [
    {
      "no": 12,
      "stem": "The scientist ...... the discovery to a lucky accident.",
      "options": ["attributed", "distributed", "contributed", "substituted"],
      "key": 0,
      "testedWord": "attribute",
      "uncertain": []
    }
  ],
  "uncertain": ["page 4 question 21: option 3 unreadable"]
}
```

Rules:

- Transcribe; never repair the English or improve the question.
- A field that cannot be read is `null`, with a note in the nearest `uncertain[]`. Never guess.
- `key` is the answer key's index. When the paper gives no key, `key: null` and a note.
- `testedWord` is the lemma the question is really testing — usually the correct option, but for
  a stem-vocabulary question it is the word in the stem.

### 3. Update the lexicon → `content/lexicon/<word-id>.json`

One file per word, forever. A word already present gains an occurrence rather than a second file.

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
  "confusables": [{ "word": "contribute", "note": "شباهت ظاهری؛ هم‌ریشه نیستند" }],
  "homograph": { "suspected": false, "note": null },
  "occurrences": [
    { "occurrenceType": "tested", "paperId": "arshad-1402-p03", "year": 1402,
      "questionNo": 12, "part": "vocabulary", "optionIndex": 1, "isAnswer": true,
      "surface": "attributed", "reach": 3 }
  ],
  "stats": { "timesTested": 1, "timesAsAnswer": 1, "timesAsContext": 0, "priority": 5 },
  "status": "draft",
  "provenance": { "model": "claude-opus-5", "at": "2026-09-17", "schemaVersion": 2 }
}
```

The shape is **sense-shaped**, not parallel arrays: a translation, a definition, an example and
the question that tested them all belong to one meaning of the word. See
`docs/adr/0012-word-data-is-sense-shaped-and-generated-once.md` for why, and for what each field
is worth.

**Two provenances, never mixed.** Extraction owns `id`, `lemma`, `surfaceForms`, `occurrences`,
`stats` and `domain`; they are a fold over `content/exams/` and are re-derived on every run.
The generation pass owns `level`, `senses`, `confusables`, `homograph` and `provenance`; nothing
re-derives those, so `s6_lexicon.py` and `s8_fold.py` carry them through untouched. A change that
makes either side rewrite the other's fields is a bug.

- `id` is frozen at creation (`CLAUDE.md` → "Word ids"). Renaming one orphans user progress. If a
  lemma turns out to be wrong after the id is minted, **report it; never rename the file.**
- `occurrences[]` is the product's core claim — every entry points at a real extracted question.
  A word with an empty `occurrences[]` has no business being in the lexicon.
  `occurrenceType` is `"tested"` (the word was one of the four options, so it has an
  `optionIndex` and an `isAnswer`) or `"context"` (it appeared in the stem, so it has neither).
- `senses[].testedIn` links a meaning to the questions that tested *that* meaning. It is knowable
  only while reading the question, which is why it is written during generation and never after.
- `homograph.suspected` flags a word whose senses are far enough apart that a reader would not
  guess one from another — different stress, different part of speech, unrelated etymology.
  It does **not** mean the entry should be split: one spelling is one entry
  (`docs/adr/0013-one-entry-per-spelling-no-homograph-split.md`). The flag tells the card
  renderer to show those senses as separate blocks, and tells the hint pass to say which sense
  its mnemonic targets.
- `status`: `draft` → `approved`. Only the owner promotes to `approved`.
- Translations, definitions and examples are **written fresh**, not copied from any book or
  dictionary. This is the legal premise of v2 (`docs/postmortem-v1.md` → "Legal note").
- The exam sentence is never used as a word's `example`. It is joined in at build time from
  `occurrences[]`, and reusing it teaches the answer to one question rather than the word.

### 4. Generate hints → `content/hints/<word-id>.md`

A separate operation, run in batches after ingest, because hints get rewritten and word data
does not. v1's template worked and is kept:

```
قالب: تداعی صوتی
تداعی: «اَز تریبون»
جمله کمکی: سخنران اَز تریبون، تمام مشخصه‌های (attribute) یک شهروند خوب را به حضار نسبت داد.
```

`قالب` is one of: `تداعی صوتی`, `طنز`, `ریشه‌شناسی`, `تصویری`.

Hints are LLM-drafted and **owner-approved**. An unapproved hint never ships — a bad mnemonic is
worse than none, because it teaches the wrong sound. Approval is a `status` line in the file.

### 5. Report and log

Report counts and every `uncertain[]` item to the owner. Then append one line to `wiki/log.md`
and one row to the table in `wiki/index.md`.

## Lint checklist

Run after any bulk change. Implemented as `pnpm content:lint`, and by Claude on request.

**Blocking:**

1. Every `testedWord` resolves to a lexicon file.
2. Every `occurrences[]` entry points to an exam and question number that exist.
3. No duplicate ids; no two files whose lemmas differ only by case or whitespace.
4. Every lexicon entry has at least one sense, that sense has at least one translation and
   one example, and the entry has at least one occurrence.
5. Every exam JSON validates against the schema.

**Warnings:**

6. Words with no hint file, or a hint still unapproved.
7. Entries still `draft` after their exam has been reported complete.
8. Homograph flags: `homograph.suspected` is true but the senses are plainly related, or it is
   false while the entry carries senses a reader could not guess from one another. Never a
   split — one spelling is one entry (ADR-0013) — but a wrong flag misleads the card renderer
   and the hint pass, both of which read it.
9. `uncertain[]` items still open.
10. Orphans: exam questions whose `testedWord` is `null`.
11. Context-only entries: a lexicon file whose every occurrence is
    `occurrenceType: "context"`. Legitimate — it is what S8 produces — but it
    means the word was never actually tested, so it must never be counted as
    exam frequency, and a run of them appearing unexpectedly is a sign S8 was
    re-run with a changed criterion.
12. A context occurrence carrying an `optionIndex` or an `isAnswer`. Those
    belong to a tested occurrence only; their presence means the two kinds have
    been conflated somewhere.
13. A `senses[].testedIn` entry pointing at a question the word has no `occurrences[]` entry for,
    or a word whose senses between them claim fewer questions than it was tested in — a tested
    occurrence no sense accounts for means a meaning went unwritten.
14. An entry whose `examples[].en` reproduces the stem of one of its own occurrences. The exam
    sentence is joined at build time and must never be duplicated as the authored example.

**Duplicate papers** (ADR-0021; one measure, `packages/content/src/duplicates.ts`):

15. *Blocking.* Two live papers of one year share more than `MAX_SHARED_STEMS` (3) stems —
    one English test under two ids, so every question counts twice. The message names the
    paper the kept-paper rule keeps.
16. *Blocking.* A `duplicateOf` that names no paper, the paper itself, a retired paper or one
    of another year; that has no `duplicateReason`; or whose two papers do not share stems.
17. *Warning.* A retired paper's question whose options read differently from the kept
    paper's same-numbered question — a misreading in one transcript, which books nothing.
18. An occurrence on a retired paper. *Blocking* when the word ships (its card would count
    the duplicate), a *warning* otherwise — an orphan of a misreading, for the owner to decide.

Report findings ranked by severity, with file paths. Fix nothing silently — a lint that
auto-repairs hides the extraction problems this pipeline exists to surface.

## Chunking

`packages/content` builds the shipped artifacts:

- `chunk-free.json` — the free-tier slice (Product decides its contents).
- `chunk-NN.json` — the rest, split into roughly equal downloads.
- `manifest.json` — chunk ids, hashes, word counts, so the client can cache and revalidate.

Chunks are built in CI from `content/`, never hand-edited. Adding next year's exam is an ingest
plus a rebuild — and because word ids are stable, existing users keep every review they have.
