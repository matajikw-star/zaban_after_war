# ADR-0009 — Paper ids are stable, like word ids

**Status:** accepted · **Date:** 2026-09-12

## Context

S2 gave each cluster an id by its rank in that year's size ordering:

```python
clusters.sort(key=lambda c: -len(c["members"]))
paper_id = f"arshad-{year}-p{i:02d}"
```

So `arshad-1405-p02` did not mean a paper. It meant "whichever cluster of 1405 is currently
second-biggest". Clustering is re-run every time a new year is routed, and two 1405 clusters sit
27 members against 26 — close enough that routing 1398–1404 was enough to reorder them.

It happened. `arshad-1405-p02` and `arshad-1405-p03` swapped clusters after extraction, so
`papers.jsonl` claimed p02 was the 1101 cluster while `content/exams/arshad-1405-p02.json` held
the questions read from `1117-1405.pdf`. Nothing complained: `crosscheck.jsonl` was committed
before the swap and was never re-run, and the cross-check's corroboration pool was wide enough
(the whole English section, five pages) that the wrong booklet still vouched for the options.
The swap surfaced only when ADR-0008's section scan narrowed that pool to the two pages the
model actually saw, and two papers dropped to 18% and 20%.

This is the failure `CLAUDE.md` → "Word ids" already names — *never key anything user-facing on
array position* — appearing one layer up, on the ids that word occurrences point at.

## Decision

**A paperId belongs to its cluster permanently.** `assign_ids` in `s2_cluster.py` decides in
three passes, most binding first:

1. **Anchored.** A paper with a transcript in `content/exams/` follows the booklet that
   transcript was read from (`source.file`). That booklet is by definition a member of the
   cluster the id names, so this is a constraint, not a heuristic. Two ids anchoring to one
   cluster is reported as a bug.
2. **Matched.** A paper with no transcript yet follows the members it had, greedily by overlap.
3. **New.** Only a cluster that matches nothing gets a fresh id, taken from the lowest index
   never used for that year. A retired id is never handed to a different paper.

Two things were repaired in the same commit, both of which made this failure possible or
invisible:

- **S5 corroborates against `scope_pages`** — the pages S3 actually rendered — instead of the
  whole English section. A wider pool makes the check weaker, and here it was wide enough to
  hide a wrong booklet entirely.
- **`s2_cluster.py --years` no longer deletes the years it was not asked about.** It rewrote
  `papers.jsonl` from the selected years alone; one `--years 1405` would have dropped 53 papers
  on the floor.

## Consequences

- Re-clustering is now safe to run at any time, which is what makes routing a new year an
  ordinary operation rather than a risk to finished work.
- Paper ids are no longer readable as a ranking. `arshad-1405-p07` is not the smallest cluster
  of 1405; it is a name. `bookletCount` is where size lives.
- `papers.jsonl` is written sorted by year descending then paperId, so a re-cluster produces a
  diff only where something really changed.
- The repair restored p02 and p03 to the mapping their transcripts assert. The cross-check that
  exposed the swap passes 7/7 against the narrower pool.
- Word ids were never affected: the lexicon folds `content/exams/*.json`, which carry their own
  `paperId` and were internally consistent throughout. What was wrong was `groupCodes` and
  `bookletCount` — which fields sat which paper.
