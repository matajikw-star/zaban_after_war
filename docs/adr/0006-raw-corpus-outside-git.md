# ADR-0006 — The scan corpus lives outside git

**Status:** accepted · **Date:** 2026-09-10

## Context

The exam archive is 2,241 scanned PDFs — 7.7 GB, 52,467 pages, 176 field codes, years
1386–1405. It arrived as `raw_konkour_files/` at the repo root, untracked and unignored: one
`git add -A` away from being committed.

Git stores every version of a binary forever. Committing this would permanently add ~8 GB to
every clone, and the files never change — they are scans of printed papers from past years.
They are an **input**, not an asset.

`CLAUDE.md` already names `sources/` as the immutable source layer. That layer is about
provenance, not about storage: a source has to be registered and traceable, not necessarily
checked in.

## Decision

`raw_konkour_files/` is gitignored. So is `extraction/cache/` — OCR text and rendered page
PNGs, both regenerable from the PDFs by re-running the pipeline.

What *is* committed is everything needed to reason about the corpus without holding it:

- `extraction/state/booklets.jsonl` — every PDF, its field code, Jalali year, and page count.
- `extraction/state/routes.jsonl` — which pages of each booklet hold the English section.
- `extraction/state/papers.jsonl` — the distinct papers, and which booklets carry each.
- `content/exams/*.json` — the extracted questions themselves.

So the repo records what the corpus contains and what was taken from it; it just does not
carry the pixels.

## Consequences

- The owner's copy of the PDFs is the only copy. It needs its own backup, outside git, and
  `sources/manifest.md` names where it lives.
- A fresh clone cannot re-run S1–S3 without the PDFs. It can still read every extracted
  question, every route, and the whole lexicon — enough to build and test the app.
- Re-deriving the cache is cheap and offline: CPU hours, zero tokens, no network.
- The three-layer rule in `CLAUDE.md` is unchanged in spirit. `sources/` still means "raw,
  immutable, human-owned"; this ADR only settles that such files may be referenced rather
  than stored.
