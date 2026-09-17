# Wiki index

The catalogue of what this project knows. Updated on every `ingest` and whenever a `query`
produces an answer worth keeping.

## Project knowledge

- [WHAT — the system as it is](../docs/spec/what.md) — the current, normative description: architecture, contracts, routes, screens, ops. Read before any application work.
- [HOW and WHY](../docs/spec/how-why.md) — how the design got this way; appended per decision session.
- [Implementation plan](../docs/plan/implementation-plan.md) — phases 0–8, estimates, risk register.
- [Owner checklist](../docs/plan/owner-checklist.md) — what to buy (Parspack VPS, Kavenegar, S3), what to decide, what to hand over.
- [Debug from a log record](../docs/runbooks/debug-from-log.md) — the procedure for fixing a bug from `pnpm errors`.
- [Post-mortem of v1](../docs/postmortem-v1.md) — what the test build got wrong, and why.
- [Product brief](../docs/plan/product-brief.md) — the owner's product statement, decoded into R1-R12 and the decisions it forces.
- [Roadmap](../docs/plan/roadmap.md) — superseded by the implementation plan; kept for reasoning.
- [Infrastructure](../docs/plan/infrastructure.md) — superseded by `what.md` §14; kept for reasoning.
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

- The app's Persian name, which reaches the manifest, the TWA package id, onboarding copy and the
  store listing. Deferred again by the owner 2026-09-17; `VITE_APP_NAME` is the one constant.
- The design system and Persian font. The owner is choosing from a list given 2026-09-17
  (Geist, Linear, Apple HIG, Material 3, Sonnat, Untitled UI); `what.md` §7.9 waits on it.
- Whether Kavenegar approves the OTP template quickly (owner buying per the checklist), whether
  Let's Encrypt / ZeroSSL issue from the Parspack IP, and whether GitHub Actions can SSH to it.
  All three are day-one checks of Phase 4 with fallbacks recorded in the risk register.
- Whether an Iranian VPS can reach `api.telegram.org` without a proxy — decides whether owner
  notification for content flags is a `pb_hook` relay or a nightly digest. Not on the launch path.

Answered, kept here as pointers: years in scope are **1398-1405** (`docs/plan/product-brief.md`);
the free slice is the first ~150 words by exam value with a 100-presentation soft paywall; the
price is **290,000 toman one-off** (`wiki/market-and-pricing.md`); the Zarinpal merchant account is
active as of 2026-09-10.
