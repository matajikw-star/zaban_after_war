# Spec — stem vocabulary + exam-sentence display

## Why

The lexicon currently only captures the four option words per question
(`optionLemmas` / `testedWord`). Two gaps the owner flagged in the same
conversation (2026-09-10, after the 1405 + 1398-1402 extraction batches):

1. Words that appear in a question's **stem** (the sentence around the blank)
   but are never one of the four options are invisible to the product, even
   when they're important enough that a student needs to know them to
   understand the question at all.
2. The stem sentence itself — the real exam sentence — should be shown in the
   product as the example sentence for a word, not just a freshly-authored
   mnemonic sentence.

## Decision (owner, 2026-09-10)

For (1): the extractor **judges** which stem words are necessary to understand
the question, and stores those, distinct from tested words — not "every word",
not "only when identical difficulty to options". A context word carries no
answer-key signal (no `isAnswer`, no `optionIndex`), so it must not be folded
into `timesAsAnswer` / `timesAsDistractor` / the existing `priority` formula
the same way a tested word is. Keeping the two separate is what stops a word
that was merely *seen* once in a sentence from outranking a word that was
*actually tested and answered correctly* three years running.

For (2): the stem text is **already fully captured** — `content/exams/<paperId>.json`
question objects already carry a verbatim `stem` field (constitution rule 1:
transcribe verbatim). Nothing new needs extracting. What's missing is
surfacing it in the product. Since every lexicon `occurrences[]` entry already
carries `paperId` + `questionNo`, the real exam sentence can be **joined at
build time** (in `packages/content`, which today has only `lint.ts` — no
chunk-builder yet) rather than duplicated into the lexicon file. This also
keeps it distinct from the lexicon's own `examples[]` field, which
`docs/plan/content-pipeline.md` already scopes to freshly-authored/mnemonic
sentences, not verbatim exam text — conflating the two would blur what's
"transcribed source" vs "written fresh" (relevant to the postmortem's legal
note on not copying from books).

## Scope of this ticket

- Schema: add a per-question `contextVocab[]` array to the exam JSON (S4
  output) and an `occurrenceType: "tested" | "context"` field to lexicon
  `occurrences[]`.
- `.claude/agents/exam-extractor.md`: extend the extractor's spec/prompt to
  judge and emit `contextVocab`. Use `mattpocock-skills:writing-for-agents`
  before editing this file — it doubles as the subagent's system prompt.
- `extraction/scripts/s6_lexicon.py`: fold `contextVocab` into the lexicon with
  `occurrenceType: "context"`, tracked in its own `stats.timesAsContext`
  counter, kept out of `timesTested` / `timesAsAnswer` / `timesAsDistractor`
  and out of the existing `priority` formula (or weighted far below a tested
  occurrence — exact weight is a product call, flag it rather than guess).
- `CLAUDE.md` rule 3 and `docs/plan/content-pipeline.md` stage 2/3: update in
  the same commit, per "Maintaining the schema".
- Decide whether to re-run the 7 already-extracted 1405 papers to backfill
  `contextVocab` now (cheap — PNGs are already cached, no re-render) or leave
  them without it until a natural re-extraction.
- No `packages/content` build-time work is required by this ticket — just
  record the join design above so whoever builds the chunk-builder later
  doesn't duplicate stem text into lexicon files.

## Open questions for the ticket child

- Exact weight (if any) a `context` occurrence contributes to `priority`.
- Whether `contextVocab` words get their own `word-id` files immediately, or
  only get promoted to a full lexicon entry once they've appeared as context
  more than once (avoids one-off noise words cluttering the lexicon).
