# Handoff — generate the word data

**Written:** 2026-09-17
**Repo:** `C:\Users\asus\Desktop\zaban_second` (private, `github.com/matajikw-star/zaban_after_war`)
**Branch:** `feat/stem-vocab-selection` @ `e75163a`, working tree clean, pushed
**Your job:** fill in the Persian data for 2,098 lexicon words. Nothing is selected any more — the selecting is done.

## Where the project is

Word **selection** finished today. Word **data generation** has not started: **0 of 2,098 words have a translation.** The lexicon is 2,098 files of correct ids, correct occurrences and empty `translations`, `pos`, `synonyms` and `examples`. That is the entire job.

How the 2,098 got there:

| | count | what it is |
|---|---|---|
| tested words | 1,774 | appeared as one of the four options on a real question |
| both | 2 | tested, and also appeared in a stem |
| context words | 322 | appeared only inside a question's stem, and a candidate plausibly cannot read the question without them |

The 322 came from a sieve over every stem in all 58 papers (3,831 lemmas → 1,498 shortlist) followed by a judging pass in which twelve Opus agents weighed each word against the verbatim exam sentence it appeared in. 282 `yes`, 45 `domain-term`, 1,171 `no`. The rejected words are not deleted — they are classified and kept in `extraction/state/stem-vocab.json` for a level-graded edition later.

## Read these first, in order

1. `CLAUDE.md` — the schema. The three layers, the three operations, the constitution. Read before any work.
2. `docs/plan/content-pipeline.md` § "3. Enrich the lexicon" — **the exact JSON shape you are filling in**, with a worked example. § "4. Generate hints" has the hint template.
3. `docs/postmortem-v1.md` → "Legal note" (lines 194-200) — why translations and examples must be **written fresh** and never copied from a book or a dictionary. This is the legal premise of v2. A rights problem killed v1.
4. `docs/adr/0011-context-vocabulary-is-selected-by-importance-not-frequency.md` — only if you need to know why the 322 context words are there. You do not need it to do the work.

You do **not** need to read `extraction/`. The pipeline is finished for this corpus.

## The queue

`extraction/state/generation-queue.json` — all 2,098 words in the order to work through, regenerate with `python extraction/scripts/s9_generation_queue.py`. `generation-queue.md` is the same list as a table.

The order: **tested words first, by `stats.priority`** (being the correct answer counts triple, breadth across years counts double), **then context words, by importance × difficulty.** A tested word outranks a context word because a word the exam actually tested is the thing the candidate is studying for.

So rank 1 is `perilous` (tested 10×, the answer 7×) and rank 1777 is `extraneous`, the strongest of the context words. If the budget runs out, it runs out at the least valuable end.

Each queue row carries `kind`, `priority`, `timesTested`, `timesAsAnswer`, `timesAsContext`, `years`, and for a context word its `tier`, `importance`, `difficulty` and an English `gloss` the judge wrote. **The gloss is a seed, not a translation** — it is English, and it was written to justify a verdict, not to teach.

## What to write into each file

Edit `content/lexicon/<word-id>.json` in place. Fill these four fields and change nothing else:

```jsonc
{
  "pos": ["v", "n"],
  "translations": ["نسبت دادن به", "مشخصه، ویژگی"],
  "synonyms": ["ascribe", "characteristic"],
  "examples": [
    { "en": "Ancient peoples attributed magic properties to certain stones.",
      "fa": "مردمان باستان ویژگی‌های جادویی را به سنگ‌های خاصی نسبت می‌دادند." }
  ]
}
```

- **`translations`** — Persian, and one entry per distinct sense, in the order the exam uses them. This is the field the app shows; everything else supports it.
- **`synonyms`** — English. Prefer ones that are themselves in the lexicon; a synonym the candidate also has to learn is worth more than a rarer one.
- **`examples`** — at least one `{en, fa}` pair, **written fresh**. Not the exam sentence: the exam sentence is already joined in at build time from `occurrences[]`, and repeating it teaches the candidate the answer to that one question rather than the word.
- **`pos`** — `v` `n` `adj` `adv` `prep` `conj` `phr`.

Leave `id`, `lemma`, `occurrences`, `surfaceForms`, `stats`, `domain` and `status` exactly as they are. `status` stays `draft`; only the owner promotes a word to `approved`.

### The exam data is already there — do not duplicate it

The owner asked that the word data say whether the word was in the options or the stem, whether it was the selected answer, and which questions it belongs to. **All of that is already in the file** and must not be restated in prose:

```jsonc
"occurrences": [
  { "occurrenceType": "tested",  "paperId": "arshad-1403-p05", "year": 1403,
    "questionNo": 19, "part": "vocabulary", "optionIndex": 2, "isAnswer": false,
    "surface": "perilous", "reach": 1 },
  { "occurrenceType": "context", "paperId": "arshad-1399-p02", "year": 1399,
    "questionNo": 1, "part": "vocabulary", "surface": "extraneous", "reach": 20 }
]
```

`occurrenceType` says options vs stem. `isAnswer` says whether it was the key. `paperId` + `questionNo` joins to the full question in `content/exams/<paperId>.json`, which the app does at build time. A context occurrence has no `optionIndex` and no `isAnswer` — their absence is the distinction, so never add them with a false value.

**Read the exam sentence before you write the translation.** `content/exams/<paperId>.json` has the stem and the four options. A word's sense in the exam is the sense to lead with, and for the context words it is the only evidence of which sense was meant.

### Domain terms

45 of the context words carry a `domain` block:

```jsonc
"domain": { "fieldCodes": ["1121"] }
```

They are real vocabulary (`covariance`, `morphology`, `hypothalamus`, `signifier`) but they belong to a discipline rather than to konkour English, and the app will eventually show them only to candidates in those fields. Translate them with the discipline's own Persian term, not a general paraphrase. Nothing in the repo maps `1121` to a field name yet — that is a known open ticket, `.scratch/stem-vocab/issues/02-field-code-names.md`, and it does not block you.

### Hints are a separate job

`content/hints/<word-id>.md` is empty and stays empty unless the owner asks. It is a distinct operation with its own template and it needs owner approval per hint, because a bad mnemonic teaches the wrong sound. Do not start it as a bonus.

## How to run it

Batch the queue and give each batch to an Opus subagent — the owner asked for Opus specifically for this work, and the judging pass proved the shape works.

Two things that pass learned the hard way:

- **Twelve concurrent Opus agents hit the account's session rate limit.** Nine of twelve were killed by a 429 partway through. They had already written their files, so nothing was lost, but do not count on that. **Run four to six at a time**, and have each agent write its file incrementally rather than in one call at the end.
- **Have each agent write files, not reply with content.** A subagent that returns 125 words of JSON in its reply burns the context of the session that reads it. Ask for a file plus a count.

Validate after every batch: re-read each file you wrote and check it is valid JSON, that `id` still matches the filename, and that `occurrences` is untouched. `python extraction/scripts/s6_lexicon.py --dry-run` must report **0 updates** — if it reports any, something rewrote a field it owns.

Commit per batch, not at the end. The owner's constitution rule 1: no uncommitted work at the end of a session. You have permission to commit, branch and push — see `.claude/settings.json`; force-push and hard reset are denied.

## Gotchas

- **Persian is the product language, English is the code language.** Translations, examples' `fa`, hints: Persian. Identifiers, commits, comments, docs: English.
- **Word ids are frozen forever.** If you find a wrong lemma, do not rename the file — report it. A rename orphans every user's progress for that word. Three lemma repairs and one drop already happened in `extraction/scripts/s8_finalize.py`; that was the last safe moment.
- `content/lexicon/histrionic.json` has `surfaceForms: ["histroinic"]`. That is a typo **in the exam paper**, transcribed verbatim as ingest rule 1 requires. Do not fix it; the lemma is right.
- **20 papers carry `needs-owner-review`** (1403×2, 1402×2, 1400×7, 1399×7, 1398×2). They are waiting on the owner's eyes. If an exam sentence you are reading looks garbled, that may be why — write the translation from the word, and note the paper.
- Windows + Git Bash. `/tmp` does not exist; use the session scratchpad. CRLF warnings from `git add` under `content/` are normal and harmless.
- A long heredoc containing quotes will break under Git Bash. Write scripts with the Write tool instead.
- The owner writes in Persian and a Persian reply is welcome.

## Done means

All 2,098 words have a non-empty `translations`, at least one `{en, fa}` example, and a `pos`. `s6_lexicon.py --dry-run` reports 0 updates. Everything committed and pushed. One line appended to `wiki/log.md`.

Report the count and anything you were unsure about — the owner reads the uncertainties.
