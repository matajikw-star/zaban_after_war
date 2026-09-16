# Spec — stem vocabulary + exam-sentence display

## Why

The lexicon is built only from the four options of each question: every entry in
a word's `occurrences[]` carries an `optionIndex` and an `isAnswer`, because an
option is the only thing S4 records as *tested*. Two gaps the owner flagged
(2026-09-10, after the 1405 + 1398-1402 extraction batches):

1. Words that appear in a question's **stem** (the sentence around the blank)
   but are never one of the four options are invisible to the product, even
   when a student needs them to understand the question at all.
2. The stem sentence itself — the real exam sentence — should be shown in the
   product as the example sentence for a word, not just a freshly-authored
   mnemonic sentence.

## Decision

Two decisions, made four days apart. The second changed *who* judges and
*when* — not *what* the owner asked for.

### What to capture (owner, 2026-09-10) — stands

A stem word earns an entry when it is **necessary to understand the question** —
not "every word in the stem", and not "only words as hard as the options". A
context word carries no answer-key signal (no `isAnswer`, no `optionIndex`), so
it must never be folded into `timesAsAnswer` / `timesAsDistractor` / the
existing `priority` formula the way a tested word is. Keeping the two apart is
what stops a word that was merely *seen* once in a sentence from outranking a
word that was *actually tested and answered correctly* three years running.

### Who judges, and when (ADR-0010, 2026-09-14) — supersedes the mechanism

Originally the **extractor** was to judge stem words inside S4 and emit a
`contextVocab[]` array per question, on the cost argument that S4 is the only
stage that spends tokens. `docs/adr/0010-context-vocabulary-is-a-later-pass.md`
rejected that:

- **S4 captures; a separate, later pass judges.** The S4 schema gains no
  `contextVocab` field, and `.claude/agents/exam-extractor.md` is not touched.
- The pass reads `content/exams/*.json` — **text, never the scans, never a page
  image** — so it sees every stem of 1398-1405 at once and can use cross-year
  repetition as evidence of what matters. S4, seeing one paper in isolation,
  structurally cannot make that call.
- Re-running it costs the price of the text (~20k tokens), so a wrong criterion
  costs one cheap re-run rather than a re-read of every paper.
- "Transcribe verbatim" is checkable against independent OCR; "pick the
  important words" is not. Separate stages keep the verifiable stage verifiable.

### How the exam sentence reaches the product (owner, 2026-09-10) — stands

Nothing new needs extracting. `content/exams/<paperId>.json` already carries a
verbatim `stem` per question (constitution rule 1), and every lexicon
`occurrences[]` entry already carries `paperId` + `questionNo`. So the real exam
sentence is **joined at build time** (in `packages/content`, which today holds
only `lint.ts` — no chunk-builder yet), never duplicated into the lexicon file.

That also keeps it distinct from the lexicon's own `examples[]`, which
`docs/plan/content-pipeline.md` scopes to freshly-authored mnemonic sentences.
Conflating the two would blur "transcribed source" against "written fresh" —
relevant to the legal note in `docs/postmortem-v1.md`.

## State when this ticket runs

All eight launch years are now extracted and folded: 1398-1405, 58 papers,
1,089 questions, 1,776 lexicon words. Stems are verified rather than merely
transcribed — `s5_crosscheck.py` corroborates every stem word against
independent local OCR at the same 0.9 floor as options (shipped with ADR-0010).

So the pool this ticket draws from is a verified one, and the cross-year
evidence the selection depends on exists in full for the first time. This is
what the ticket was waiting for; nothing else blocks it.

## Scope of this ticket

The work list lives in `issues/01-context-vocab-and-stem-display.md` and is
current. In outline:

- Build the selection pass over `content/exams/*.json`, and decide its criterion
  from cross-year frequency. Where the pass lives — a script under
  `extraction/scripts/`, or `packages/content` at build time — is deliberately
  left open by ADR-0010.
- Add `occurrenceType: "tested" | "context"` to lexicon `occurrences[]`, plus a
  separate `stats.timesAsContext`, folded by `extraction/scripts/s6_lexicon.py`.
- Update `CLAUDE.md` ingest rule 3 (today: "for each **tested** word") and
  `docs/plan/content-pipeline.md` in the same commit, per "Maintaining the
  schema".
- Lint: flag a lexicon file whose occurrences are all `context` and none
  `tested`, so a context-only word cannot quietly become curriculum.

Explicitly **not** in scope, per ADR-0010: any change to the S4 schema or to
`.claude/agents/exam-extractor.md`, and any re-extraction or backfill of already
extracted papers — their stems are already stored and verified.

## Open questions

Product calls, for the owner rather than the implementer:

- What weight, if any, a `context` occurrence contributes to `priority`.
- Whether a context word gets its own word-id file the first time it is
  selected, or only once it has recurred across N papers or N years — which
  doubles as the selection threshold itself.

## Comments

2026-09-17 — Rewritten to match ADR-0010. The previous version still described
the superseded plan in which the extractor emits `contextVocab` during S4, which
contradicted both the ADR and the sibling issue file; the issue file was already
current and was not changed.
