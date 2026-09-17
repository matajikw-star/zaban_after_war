# ADR-0014 — The system is documented as a current "what" and an appended "how/why"

**Status:** accepted · **Date:** 2026-09-17

## Context

By the time development started, the project's documentation was a chronological pile: a
product brief with seven rounds of decisions, thirteen ADRs, four plans and a wiki. Each was
true when written. Learning the *current* state of the system meant reading all of it and
mentally applying every supersession. The owner asked for two documents: one that always
describes what the system is, kept current so that adding a feature or debugging never
requires archaeology; and one that records how and why it became that way.

## Decision

- `docs/spec/what.md` is **normative and current**. It describes the system on `main`:
  architecture, contracts, data, routes, screens, operations. Any commit that changes the system
  changes this file in the same commit. Sections carry a status mark (`planned` / `building` /
  `live`).
- `docs/spec/how-why.md` is **narrative and appended**. It records decisions with their
  alternatives and reasons, dated. It never needs to be current.
- ADRs continue for decisions that are expensive to reverse; `how-why.md` links to them.
- `docs/plan/roadmap.md` and `docs/plan/infrastructure.md` are superseded by
  `docs/plan/implementation-plan.md` and `what.md` §14 and carry a banner; they are kept for
  their reasoning.

## Consequences

- One place to read before touching anything: `what.md`. `CLAUDE.md` points at it.
- A PR whose diff changes behaviour without touching `what.md` is incomplete; the PR template
  asks.
- The product brief stays as the record of the design interview; nothing in it is normative
  once `what.md` covers the topic.
