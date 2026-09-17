# ADR-0007 — The paper, not the booklet, is the unit of ingest

**Status:** accepted · **Date:** 2026-09-10

## Context

`docs/plan/content-pipeline.md` was written for a handful of hand-picked exam files, one
`ingest` per file, with exam ids shaped `<degree>-<year>-<field>` — `arshad-1402-zaban`.

The real corpus does not fit that. There is no single زبان exam: the زبان عمومی section
appears inside **every** field's booklet, and within a year many fields share the same English
paper. Measured in 1403 by fingerprinting the OCR of the English pages: codes 1101, 1102 and
1301 carry one identical paper; 1103 and 1501 carry a different one. About 120 booklets per
year collapse to a handful of distinct papers.

Ingesting per booklet would transcribe the same questions ~30 times per year. It would also
be wrong in the data: the same question would appear as thirty separate occurrences of a word,
inflating every frequency count the curriculum depends on.

## Decision

The unit of extraction and of `content/exams/` is the **distinct English paper**.

- Paper id: `arshad-<year>-p<NN>`, e.g. `arshad-1403-p01`. The `pNN` suffix is assigned by
  cluster size, largest first, and is stable once written.
- Each paper records `groupCodes[]` (every field code that sat it), `bookletCount` (its reach),
  and the representative booklet its pages were read from.
- Booklets are identified by `<code>-<year>` and tracked in `extraction/state/`, but they are
  no longer ingest units.
- An occurrence in the lexicon points at a `paperId` and a question number, and carries the
  year and `isAnswer` alongside. A word tested once in 1403 counts once, however many fields
  sat that paper.

Papers are discovered by clustering, not declared by hand. `extraction/scripts/s2_cluster.py`
groups booklets of the same year by order-free word fingerprints of their English pages.
Matching is conservative: a false split costs one redundant extraction, while a false merge
would silently lose a paper.

## Consequences

- Extraction cost drops by 20–40×, which is what makes it affordable to use a strong model and
  a verification pass on every page.
- Frequency data becomes truthful. `stats.byYear` counts papers, not booklets, so "tested in
  four of the last five years" means what it says.
- `docs/plan/content-pipeline.md`'s exam-id format is superseded for this corpus. The rest of
  that document — transcribe don't repair, `null` plus `uncertain[]`, one lexicon file per
  word, frozen ids — stands unchanged.
- Adding an older year cannot renumber an existing paper: ids are namespaced by year.
- If the clustering threshold is ever retuned, already-extracted papers keep their ids and
  status; `s2_cluster.py` preserves the `extraction` field across re-clusters.
