# ADR-0010 — Context vocabulary is selected after extraction, not during it

Date: 2026-09-14
Status: accepted
Supersedes nothing. Extends ADR-0008.

## Context

A tested word is one of a question's four options. But a question's **stem** —
the real exam sentence — is full of vocabulary that matters:

> A person's test score is, at best, simply ..... his ability to use his
> knowledge to answer some questions and nothing more.

Only `indicate` is tested here. `ability`, `knowledge` and `score` are konkour
English too, and today they have no lexicon entry at all.

The obvious place to fix that looked like S4. A model already reads the page
there, already infers the answer key; asking it in the same breath to mark the
stem words that matter costs almost no extra output. The ticket
(`.scratch/stem-vocab/issues/01`) was written that way, and the cost argument
pointed the same direction: S4 is the only stage that spends tokens, so anything
S4 could do for free should be done in S4 or paid for twice.

That argument was wrong, and the reason it was wrong is the point of this ADR.

## Decision

**S4 captures. A separate, later pass judges.**

S4's contract does not change: transcribe the stem and the options verbatim,
infer the key, never guess. No `contextVocab` field is added to the S4 schema
and no extractor is asked which words are important.

Selecting context vocabulary is a distinct stage that reads
`content/exams/*.json` — never the scans, never a page image — and writes its
selection back. It can run over every extracted year at once, and it can be
re-run with different criteria for the price of the text.

## Why

**The stem is already stored losslessly.** Every question carries its full
`stem` verbatim. The words are on disk; only the judgment about them is missing.
So this is ADR-0008's principle applied one layer up: capture cheaply and
permanently, defer the opinion. The escape hatch is already open, and unlike the
reading pages, exercising it does not even cost a re-render.

**The later pass is strictly better informed.** S4 sees one paper in isolation.
Asked "which words here matter?", it can only guess. A pass over the whole
corpus sees ~830 stems across eight years at once, so "matters" stops being
taste and becomes evidence: a word appearing in twelve stems across five years
is obviously worth an entry; one appearing once probably is not. **S4 cannot
make that call at all** — not cheaply, but structurally, because the evidence
does not exist inside a single paper.

**The cost asymmetry is the other way round.** S4 reads page *images*. The
later pass reads *text*: roughly 20k tokens for every stem of all eight years,
small enough to redo whenever the criteria improve. Getting the selection wrong
costs one cheap re-run; getting it wrong inside S4 would cost a re-read of every
paper.

**Mixing them would corrupt a clean contract.** "Transcribe verbatim, never
repair the English" (CLAUDE.md rule 1) is checkable — S5 corroborates it against
independent local OCR. "Pick the important words" is a judgment call that no
cross-check can falsify. Keeping the two in separate stages keeps the verifiable
stage verifiable.

## Consequences

- **Nothing blocks extraction.** The 53 pending papers of 1398–1404 are
  extracted with today's schema. This was previously believed to be a
  prerequisite; it is not.
- **Stems become first-class data**, so they are now verified like options.
  `s5_crosscheck.py` corroborates every stem word against the local OCR at the
  same 0.9 floor. Measured on the seven 1405 papers: 97–100% of stem words
  corroborated, the misses all OCR failures on proper nouns (`Sigmund`) and
  short words. This had to ship *before* the remaining papers so that all 60 are
  verified alike.
- The stem is also the product's example sentence — a real konkour sentence
  shown against the word. That is a second reason it must be right, and a reason
  `examples[]` stays reserved for freshly authored mnemonic sentences rather
  than being filled with stem copies (join by `paperId` + `questionNo` instead).
- S6 still needs `occurrenceType: "tested" | "context"` and a separate
  `stats.timesAsContext`, so context words never inflate the priority of a word
  that was actually tested. That work is local, free, and unchanged by this
  decision — only its timing moved.

## Alternatives considered

**Add `contextVocab` to S4 now.** Rejected: structurally worse selection, and it
welds a judgment call onto the one stage that must stay mechanically verifiable.

**Skip context vocabulary entirely.** Rejected: it discards real konkour
vocabulary that is already sitting in `content/exams/`, at no acquisition cost.

**Do it in `packages/content` at build time.** Deferred, not rejected. Where the
pass lives is an implementation detail; this ADR fixes only that it happens after
extraction and reads text rather than scans.
