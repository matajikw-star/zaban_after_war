# Handoff — generate the word data

**Written:** 2026-09-17
**Repo:** `C:\Users\asus\Desktop\zaban_second` (private, `github.com/matajikw-star/zaban_after_war`)
**Branch:** `feat/stem-vocab-selection`, working tree clean, pushed
**Your job:** write the Persian word data for 2,098 lexicon words. Nothing is being selected any more — the selecting is finished.

## Start here: run a calibration batch first

**Do not start with 2,098 words.** Do 25, show them to the owner, and wait.

The selection pass proved this on 2026-09-17: thirty words were judged, the owner reviewed each one against its exam sentence, and the review changed the criterion *before* 1,498 words were spent on it. Word data is a far bigger spend, and tone, register, how literal a translation should be and how long an example runs are all taste — the owner's, not yours.

Pick the 25 to expose disagreement, not to look good:

- the top 5 of the queue (`perilous`, `derive`, `affluent`, `apprehensive`, `withdraw`)
- 5 more from the middle of the tested range
- 3 context words from tier 1 (`extraneous`, `avocation`, `contrition`)
- 2 domain terms (`covariance` → field 1121, `morphology`)
- 5 words you expect to be **polysemous** — where `senses[]` has to carry more than one entry, and where the exam tests only one of them
- 5 words with a **confusable** (`conscience`, `contentment`, `adjacent`, `elusive`, `render`)

Write them, then build a review sheet like `.scratch/stem-vocab/calibration-review.md` — each word with its full verbatim exam sentence, what you wrote, and a blank `**شما:**` line. The owner reads Persian; the sheet is for them.

Then stop and wait. Scale only after they answer.

## Where the project is

Word **selection** finished. Word **data generation** has not started: **0 of 2,098 words have a translation.** The lexicon is 2,098 files with correct ids, correct occurrences and empty content fields. That is the entire job.

| | count | what it is |
|---|---|---|
| tested words | 1,774 | appeared as one of the four options on a real question |
| both | 2 | tested, and also appeared in a stem |
| context words | 322 | appeared only inside a stem, and a candidate plausibly cannot read the question without them |

## Read these first, in order

1. `CLAUDE.md` — the schema. The three layers, the three operations, the constitution. Read before any work.
2. `docs/plan/content-pipeline.md` § 3 — **the exact shape you are filling in**, with a worked example and the rules that go with it.
3. `docs/adr/0012-word-data-is-sense-shaped-and-generated-once.md` — why the shape is what it is, and what each field is for. Short.
4. `docs/postmortem-v1.md` → "Legal note" (lines 194-200) — why translations and examples are **written fresh** and never copied from a book or dictionary. This is the legal premise of v2; a rights problem killed v1.

You do **not** need to read `extraction/`. That pipeline is finished for this corpus.

## The queue

`extraction/state/generation-queue.json`, rebuildable with `python extraction/scripts/s9_generation_queue.py`. `generation-queue.md` is the same list as a table.

Order: **tested words first by `stats.priority`**, then **context words by importance × difficulty**. A tested word outranks a context word because a word the exam actually tested is what the candidate is studying for. Rank 1 is `perilous`; the strongest context word is `extraneous` at 1777. If the budget runs out, it runs out at the least valuable end.

Each row carries `kind`, `priority`, `timesTested`, `timesAsAnswer`, `timesAsContext`, `years`, and for a context word its `tier`, `importance`, `difficulty` and an English `gloss`. **The gloss is a seed, not a translation** — it is English and it was written to justify a verdict, not to teach.

## What you write, and what you must not touch

Two provenances live in one file and must never cross.

**Extraction owns** `id`, `lemma`, `surfaceForms`, `occurrences`, `stats`, `domain`. They are a fold over `content/exams/` and are re-derived on every pipeline run. **Leave them exactly as they are.**

**You own** `level`, `senses`, `confusables`, `homograph`, `provenance`. Nothing re-derives them.

```jsonc
{
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
  "provenance": { "model": "claude-opus-5", "at": "2026-09-17", "schemaVersion": 2 }
}
```

- **`senses[]`** — one entry per distinct meaning, the exam's meaning first. This is the whole point of the shape: a definition, its translations, its example and the questions that tested *that* meaning belong together.
- **`testedIn`** — which of this word's own `occurrences[]` tested this sense. Only knowable while you are reading the question, and unrecoverable afterwards. Between them the senses must account for every tested occurrence.
- **`definition`** — English, learner-dictionary register, not a synonym.
- **`translations`** — Persian. This is the field the app shows; everything else supports it.
- **`ipa`** — per sense, because `attribute` the verb and the noun differ. The hint pass needs it: hints use the `تداعی صوتی` format and are generated *from* the sound.
- **`examples`** — at least one `{en, fa}` pair per sense, written fresh. **Never the exam sentence** — that is joined in at build time from `occurrences[]`, and reusing it teaches the answer to one question rather than the word.
- **`level`** — CEFR `A1`..`C2`, for the word. The owner intends a level-graded edition later; capturing level now is what stops that edition from needing a second pass over all 2,098.
- **`confusables`** — the words this one gets mistaken for (`conscience`/`conscious`, `content`/`contentment`, `adapt`/`adopt`). Konkour distractors are built from exactly this, and you can see it in the four options while you read them. Leave the array empty when there is genuinely nothing.
- **`homograph.suspected`** — true when the senses are different enough to deserve `word-1` / `word-2`. **Raise the flag; never rename the file.** The split is the owner's call and must happen before any user has progress on the id.
- **`provenance`** — `{model, at, schemaVersion: 2}`. So a later partial re-run knows what was written by what.

`status` stays `draft`. Only the owner promotes a word to `approved`.

### Read the exam question before you write

`content/exams/<paperId>.json` has the stem, the four options and the key. A word's sense in the exam is the sense to lead with, and for the 322 context words it is the only evidence of which sense was meant.

```jsonc
"occurrences": [
  { "occurrenceType": "tested",  "paperId": "arshad-1403-p05", "questionNo": 19,
    "optionIndex": 2, "isAnswer": false, "surface": "perilous", ... },
  { "occurrenceType": "context", "paperId": "arshad-1399-p02", "questionNo": 1,
    "surface": "extraneous", ... }
]
```

`occurrenceType` says options vs stem. `isAnswer` says whether it was the key. `paperId` + `questionNo` joins to the full question. The owner asked that the word data carry all of this — **it already does.** Join to it; never restate it in prose.

### Domain terms

45 context words carry a `domain` block with field codes. They are real vocabulary (`covariance`, `morphology`, `hypothalamus`, `signifier`) but belong to a discipline rather than to konkour English, and the app will eventually show them only to candidates in those fields. Use the discipline's own Persian term, not a general paraphrase. Nothing maps `1121` to a field name yet — open ticket `.scratch/stem-vocab/issues/02-field-code-names.md`; it does not block you.

### Hints are a different job

`content/hints/<word-id>.md` is empty and stays empty unless the owner asks. Separate operation, own template, and every hint needs owner approval because a bad mnemonic teaches the wrong sound. Do not start it as a bonus.

## How to run it, once the calibration is approved

Batch the queue and give each batch to an Opus subagent — the owner asked for Opus specifically for this work.

Two things the selection pass learned the hard way:

- **Twelve concurrent Opus agents hit the account's session rate limit.** Nine of twelve were killed by a 429. They had already written their files so nothing was lost, but do not count on that. **Run four to six at a time.**
- **Have agents write files, not reply with content.** A subagent returning 125 words of JSON in its reply burns the context of the session reading it. Ask for a file plus a count.

Validate after every batch:

```
python extraction/scripts/s6_lexicon.py --dry-run   # must report 0 updates
python extraction/scripts/s8_fold.py --dry-run      # must report 324 already correct
```

Either one reporting a change means something rewrote a field it does not own. Also re-read each file you wrote: valid JSON, `id` still matches the filename, `occurrences` byte-identical.

Commit per batch, not at the end — constitution rule 1 is no uncommitted work at the end of a session. You may commit, branch and push; see `.claude/settings.json`. Force-push and hard reset are denied.

## Gotchas

- **Persian is the product language, English is the code language.** Translations, `fa` examples, hints: Persian. Identifiers, commits, comments, docs: English.
- **Word ids are frozen forever.** A wrong lemma gets reported, never renamed — a rename orphans every user's progress for that word.
- `content/lexicon/histrionic.json` has `surfaceForms: ["histroinic"]`. That is a typo **in the exam paper**, transcribed verbatim as ingest rule 1 requires. Do not fix it; the lemma is right.
- **20 papers carry `needs-owner-review`** (1403×2, 1402×2, 1400×7, 1399×7, 1398×2). If an exam sentence looks garbled, that may be why — write from the word and note the paper.
- Windows + Git Bash. `/tmp` does not exist; use the session scratchpad. CRLF warnings from `git add` under `content/` are normal.
- A long heredoc containing quotes breaks under Git Bash. Use the Write tool for scripts.
- The owner writes in Persian and a Persian reply is welcome.

## Done means

Every word has a `level`, at least one sense with a definition, a translation and an example, a `provenance`, and every tested occurrence accounted for by some sense's `testedIn`. Both dry-runs clean. Everything committed and pushed. One line appended to `wiki/log.md`.

Report the count and everything you were unsure about — the owner reads the uncertainties.
