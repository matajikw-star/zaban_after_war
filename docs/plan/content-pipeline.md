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
  "pos": ["v", "n"],
  "translations": ["نسبت دادن به", "مشخصه، ویژگی"],
  "synonyms": ["ascribe", "characteristic"],
  "examples": [
    { "en": "Ancient peoples attributed magic properties to certain stones.",
      "fa": "مردمان باستان ویژگی‌های جادویی را به سنگ‌های خاصی نسبت می‌دادند." }
  ],
  "occurrences": [
    { "examId": "arshad-1402-zaban", "questionNo": 12 },
    { "examId": "arshad-1398-zaban", "questionNo": 7 }
  ],
  "status": "draft"
}
```

- `id` is frozen at creation (`CLAUDE.md` → "Word ids"). Renaming one orphans user progress.
- `occurrences[]` is the product's core claim — every entry points at a real extracted question.
  A word with an empty `occurrences[]` has no business being in the lexicon.
- `status`: `draft` → `approved`. Only the owner promotes to `approved`.
- Translations and examples are **written fresh**, not copied from any book. This is the legal
  premise of v2 (`docs/postmortem-v1.md` → "Legal note").

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
4. Every lexicon entry has at least one translation and at least one occurrence.
5. Every exam JSON validates against the schema.

**Warnings:**

6. Words with no hint file, or a hint still unapproved.
7. Entries still `draft` after their exam has been reported complete.
8. Homograph suspects: one entry carrying translations that look like unrelated senses — it
   probably needs splitting into `word-1` / `word-2` (do this *before* users have progress on it).
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

Report findings ranked by severity, with file paths. Fix nothing silently — a lint that
auto-repairs hides the extraction problems this pipeline exists to surface.

## Chunking

`packages/content` builds the shipped artifacts:

- `chunk-free.json` — the free-tier slice (Product decides its contents).
- `chunk-NN.json` — the rest, split into roughly equal downloads.
- `manifest.json` — chunk ids, hashes, word counts, so the client can cache and revalidate.

Chunks are built in CI from `content/`, never hand-edited. Adding next year's exam is an ingest
plus a rebuild — and because word ids are stable, existing users keep every review they have.
