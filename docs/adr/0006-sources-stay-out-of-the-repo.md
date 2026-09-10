# ADR-0006 — Raw sources stay outside the repo

**Status:** accepted · **Date:** 2026-09-10
**Supersedes:** the Git LFS decision in `docs/plan/repo-setup.md` §5

## Context

M0 planned to track `sources/raw/` with Git LFS, on the assumption of roughly twenty exam PDFs.

The actual archive is **2,241 PDFs across 176 field codes and ~18 years, totalling ~7.9 GB**,
sitting in `raw_konkour_files/`. GitHub's free LFS allowance is 1 GB of storage and 1 GB/month
of bandwidth; even on a paid plan, pushing 7.9 GB of scanned papers through Git buys nothing —
they are read-only inputs that never diff meaningfully, and a clone would become unusable.

The archive spans every field because the target content is the **زبان عمومی** section that
appears in every field's paper, not a single زبان-specific exam.

## Decision

1. **Raw sources are never committed.** `raw_konkour_files/` is gitignored.
2. `sources/manifest.md` remains the tracked record: one row per exam actually ingested, with
   its `EXTERNAL` file path and a SHA-256 so a file can be identified later.
3. **The owner is responsible for backing the archive up** — it is not in the repo, so a disk
   failure loses it. At least one copy outside this machine.
4. **Derived text is tracked.** The OCR cache under `extraction/cache/` is small (~1 KB/page),
   expensive to regenerate, and is what every downstream step actually reads. It belongs in git.
5. `sources/raw/` stays in the tree as the home for a *sample* — the handful of papers worth
   committing so CI and tests have real fixtures. Git LFS still covers that directory.

## Consequences

- A fresh clone cannot re-run OCR from scratch without the archive. Acceptable: the OCR output
  is committed, so everything downstream of it is reproducible.
- Ingest reads from a path outside the repo, so that path is configuration
  (`EXAM_ARCHIVE_DIR`), not a hardcoded constant.
- Scope becomes an explicit decision rather than "ingest everything": 2,241 papers is a
  different project from 20. Which field codes and which years are in scope is now the first
  question M2 has to answer, and it is an open question in `wiki/index.md`.
