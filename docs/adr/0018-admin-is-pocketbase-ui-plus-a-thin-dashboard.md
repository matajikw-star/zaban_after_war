# ADR-0018 — Admin is PocketBase's own UI plus a thin read-only dashboard

**Status:** accepted · **Date:** 2026-09-17

## Context

The owner needs to manage users, grant access, create discount codes, read user reports and
bug logs, and see sales. PocketBase ships a mature admin UI that covers every CRUD part of
that. What it cannot do is aggregate.

## Decision

- All CRUD administration happens in the PocketBase admin UI on `admin.konkurleitner.com/_/`.
- A small React dashboard on `admin.konkurleitner.com/` shows aggregates only: sales and
  funnel, flags per word, errors per fingerprint (symbolicated, exportable), and a user lookup
  with one write action (grant access, `source: manual`).
- Everything the dashboard shows comes from one superuser-only stats route plus direct list
  calls; it holds no state of its own.

## Alternatives

A fully custom panel (rejected: weeks of code guarding money, for pages PocketBase already
has). PocketBase UI only (rejected: the funnel and the error groups are the numbers the owner
must see daily).

## Consequences

- Discount-code and refund procedures are runbooks over the PocketBase UI, not custom screens.
- The dashboard can be rebuilt or dropped without touching data.
