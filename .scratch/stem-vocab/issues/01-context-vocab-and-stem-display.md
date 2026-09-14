# 01 — Extract stem-context vocabulary; join exam stems as product examples

Status: blocked-on-data (deliberately — see "When")
Type: task

## Goal

Two related gaps, both from the owner directly (2026-09-10):

1. Words in a question's stem that matter for understanding it, but were
   never one of the four options, currently have no lexicon entry at all.
2. The real exam sentence (already captured verbatim as `stem` in
   `content/exams/<paperId>.json`) should be shown in the product as a word's
   example — but isn't surfaced anywhere yet.

Full reasoning: `.scratch/stem-vocab/spec.md`. The shape of the solution
changed on 2026-09-14 — see `docs/adr/0010-context-vocabulary-is-a-later-pass.md`.

## When

**After every year is extracted, not before.** This ticket was once thought to
block extraction, on the theory that the selection had to happen inside S4 or be
paid for twice. It doesn't and it isn't:

- the stem is stored verbatim, so nothing is lost by waiting;
- a pass over all ~830 stems at once can use cross-year repetition as evidence,
  which S4 — seeing one paper — structurally cannot;
- re-running it costs the price of the text, not of the page images.

So extraction of 1398–1404 proceeds with today's schema, and this runs once
afterwards.

## Already true, nothing to build

- Stem text is extracted for all 97 questions across the 7 1405 papers, and for
  every future paper — it is the existing `stem` field, not a new one.
- `occurrences[]` in every lexicon file already carries `paperId` +
  `questionNo`, which is enough to join back to the stem at build time.
- **Stems are cross-checked** (shipped 2026-09-14 with ADR-0010):
  `s5_crosscheck.py` corroborates every stem word against the local OCR at the
  same 0.9 floor as options. Measured on 1405: 97–100%. So the pool this ticket
  draws from is verified, not just transcribed.

## Left to do

1. Build the selection pass. It reads `content/exams/*.json` and **never** the
   scans or a page image. Input is text, so it can see every year at once;
   that is the point. Where it lives (a script under `extraction/scripts/`, or
   `packages/content` at build time) is open — ADR-0010 fixes only that it runs
   after extraction and reads text.
2. Decide the selection criterion, now that cross-year frequency is available:
   a stem word plausibly needs to recur across N papers or N years before it
   earns a lexicon file. Record the threshold and the reasoning with the pass.
3. Add `occurrenceType: "tested" | "context"` to lexicon `occurrences[]`.
   Update `docs/plan/content-pipeline.md` stage 3's schema sample and
   `CLAUDE.md` ingest rule 3 in the same commit.
4. Update `extraction/scripts/s6_lexicon.py` to fold context words in with
   `occurrenceType: "context"` and a separate `stats.timesAsContext` counter —
   must not feed `timesTested` / `timesAsAnswer` / `timesAsDistractor` or the
   existing `priority` formula the same way a tested occurrence does.
5. Decide + implement the weight (if any) `timesAsContext` contributes to
   `priority` (see spec's open questions).
6. `pnpm content:lint` / `lint.ts`: flag a lexicon file whose occurrences are
   all `context` and none `tested`, so a context-only word cannot quietly
   become curriculum. Add the line to `content-pipeline.md`'s checklist.
7. No `packages/content` chunk-builder work needed yet (doesn't exist — only
   `lint.ts` does today) — just don't let it, when built, duplicate stem text
   into lexicon `examples[]`; join by `occurrences[].paperId` + `questionNo`
   instead. `examples[]` stays reserved for freshly-authored mnemonic sentences
   (see spec — legal note in `docs/postmortem-v1.md`).

## No longer to do

- ~~Add `contextVocab[]` to the S4 exam-question schema.~~ Rejected by ADR-0010:
  it welds an unverifiable judgment onto the one stage that must stay
  mechanically checkable, and it makes the worse selection. `.claude/agents/
  exam-extractor.md` stays as it is.
- ~~Backfill the 7 already-extracted 1405 papers.~~ Nothing to backfill — their
  stems are already stored and now verified.
- ~~Extend S5 to cover `contextVocab` words.~~ Done differently and better: S5
  covers the whole stem, so any word the later pass can pick is already
  corroborated.

## Watch out

- Don't let context words silently outrank real tested words in `priority` —
  that's the whole reason this needs a distinct `occurrenceType` rather than
  just appending to `occurrences[]` unmarked.
- This changes `CLAUDE.md` ingest rule 3 (currently "for each **tested** word")
  — update it in the same commit that ships the code, per "Maintaining the
  schema".
