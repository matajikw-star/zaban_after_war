# Wiki index

The catalogue of what this project knows. Updated on every `ingest` and whenever a `query`
produces an answer worth keeping.

## Project knowledge

- [Post-mortem of v1](../docs/postmortem-v1.md) — what the test build got wrong, and why.
- [Product brief](../docs/plan/product-brief.md) — the owner's product statement, decoded into R1-R12 and the decisions it forces.
- [Roadmap](../docs/plan/roadmap.md) — phases, milestones, and the work breakdown.
- [Infrastructure](../docs/plan/infrastructure.md) — hosting, cost, deployment, backups.
- [Content pipeline](../docs/plan/content-pipeline.md) — how a scanned exam becomes lexicon data.
- [Extraction runbook](../extraction/RUNBOOK.md) — running the corpus through, session by session.
- [Extraction pipeline](../extraction/PIPELINE.md) — why the pipeline is shaped the way it is.
- [Decisions](../docs/adr/) — ADRs, newest last.
- [Market and pricing](market-and-pricing.md) — ~520-650k arshad candidates a year all sit the same paper; books run 450-550k toman; the konkour-vocabulary shelf is empty and abandoned.
- [Push notifications in Iran](web-push-in-iran.md) — web push rides Google's socket, cannot be moved off it, and dies in a protocol-whitelist regime. Treat notifications as a bonus, never a mechanism.
- [Glossary](../CONTEXT.md) — the domain vocabulary.

## Content

Extraction is a pipeline, not a per-file task — see the [runbook](../extraction/RUNBOOK.md).
Live counts: `python extraction/scripts/status.py`.

Reading comprehension and standalone grammar blocks are **located, never transcribed**: their
page ranges live in `readingPages` / `grammarPages` on every `extraction/state/routes.jsonl`
row, per booklet. A future reading feature starts there, not in the scans —
[ADR-0008](../docs/adr/0008-locate-reading-and-grammar-without-transcribing.md),
[runbook §6](../extraction/RUNBOOK.md).

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
