# Wiki index

The catalogue of what this project knows. Updated on every `ingest` and whenever a `query`
produces an answer worth keeping.

## Project knowledge

- [Post-mortem of v1](../docs/postmortem-v1.md) — what the test build got wrong, and why.
- [Roadmap](../docs/plan/roadmap.md) — phases, milestones, and the work breakdown.
- [Infrastructure](../docs/plan/infrastructure.md) — hosting, cost, deployment, backups.
- [Content pipeline](../docs/plan/content-pipeline.md) — how a scanned exam becomes lexicon data.
- [Extraction runbook](../extraction/RUNBOOK.md) — running the corpus through, session by session.
- [Extraction pipeline](../extraction/PIPELINE.md) — why the pipeline is shaped the way it is.
- [Decisions](../docs/adr/) — ADRs, newest last.
- [Glossary](../CONTEXT.md) — the domain vocabulary.

## Content

Extraction is a pipeline, not a per-file task — see the [runbook](../extraction/RUNBOOK.md).
Live counts: `python extraction/scripts/status.py`.

| Paper | Field codes | Questions | Words extracted | Extracted |
|---|---|---|---|---|
| arshad-1405-p01 | 29 | 10 | 28 | 2026-09-10 |

## Open questions

Things nobody has answered yet. Each becomes a wiki page or an ADR once resolved.

- Which of the 176 field codes and which years are in scope? 2241 papers is a different project
  from 20 — see ADR-0006. Blocks M2 scoping.
- What is the free-tier slice — how many words, chosen how?
- Price point for premium, and whether it is one-off or a subscription.
- Does a Zarinpal merchant account already exist for this domain?
