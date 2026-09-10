# 01 — Extract stem-context vocabulary; join exam stems as product examples

Status: needs-triage
Type: task

## Goal

Two related gaps, both from the owner directly (2026-09-10):

1. Words in a question's stem that matter for understanding it, but were
   never one of the four options, currently have no lexicon entry at all.
2. The real exam sentence (already captured verbatim as `stem` in
   `content/exams/<paperId>.json`) should be shown in the product as a word's
   example — but isn't surfaced anywhere yet.

Full reasoning: `.scratch/stem-vocab/spec.md`.

## Already true, nothing to build

- Stem text itself is already extracted for all 97 questions across the 7
  1405 papers (and will be for every future paper — it's part of the existing
  `stem` field, not a new field). Confirmed by reading
  `content/exams/arshad-1405-p05.json`.
- `occurrences[]` in every lexicon file already carries `paperId` +
  `questionNo`, which is enough to join back to the stem at build time.

## Left to do

1. Add `contextVocab[]` to the S4 exam-question schema — extractor's own
   judgment of which stem words are necessary to understand the question.
   Update `.claude/agents/exam-extractor.md` (run
   `mattpocock-skills:writing-for-agents` first — this file is also the
   subagent's live prompt) and `docs/plan/content-pipeline.md` stage 2's
   schema sample.
2. Add `occurrenceType: "tested" | "context"` to lexicon `occurrences[]`.
   Update `docs/plan/content-pipeline.md` stage 3's schema sample and
   `CLAUDE.md` rule 3 in the same commit.
3. Update `extraction/scripts/s6_lexicon.py` to fold `contextVocab` in with
   `occurrenceType: "context"` and a separate `stats.timesAsContext` counter —
   must not feed `timesTested` / `timesAsAnswer` / `timesAsDistractor` or the
   existing `priority` formula the same way a tested occurrence does.
4. Decide + implement the weight (if any) `timesAsContext` contributes to
   `priority`, and whether a context word needs to reach a repeat threshold
   before it gets a lexicon file at all (see spec's open questions).
5. Owner decision: backfill the 7 already-extracted 1405 papers now (cheap —
   PNGs already rendered and cached under `extraction/cache/pages/`, just
   re-run `exam-extractor` on them) or leave them without `contextVocab` for
   now.
6. Run `s5_crosscheck.py` logic (or extend it) to cover `contextVocab` words
   too, so hallucinated context words get caught the same way option words do.
7. `pnpm content:lint` / `lint.ts`: extend the blocking checks so a
   `contextVocab` entry with no matching lexicon file, or a lexicon file
   with only `context` occurrences and zero `tested` ones, gets flagged
   (the existing checklist in `content-pipeline.md` needs a line for this).
8. No `packages/content` chunk-builder work needed yet (doesn't exist —
   only `lint.ts` does today) — just don't let it, when built, duplicate stem
   text into lexicon `examples[]`; join by `occurrences[].paperId` +
   `questionNo` instead. `examples[]` stays reserved for freshly-authored
   mnemonic sentences (see spec — legal note in `docs/postmortem-v1.md`).

## Watch out

- Don't let `contextVocab` words silently outrank real tested words in
  `priority` — that's the whole reason this needs a distinct `occurrenceType`
  rather than just appending to `occurrences[]` unmarked.
- This changes `CLAUDE.md` rule 3 (currently "for each **tested** word") —
  update it in the same commit that ships the code, per "Maintaining the
  schema".
