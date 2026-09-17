# ADR-0017 — Errors are first-party, structured, and written for an AI to debug from

**Status:** accepted · **Date:** 2026-09-17

## Context

The owner delegates all engineering to an agent and is not a developer. When something breaks,
the log is the only bug report the agent will get. Third-party error services are ruled out by
ADR-0005 and by reachability from Iran; self-hosting one is a second database on a small VPS.

## Decision

- The client captures every uncaught error, rejection, React boundary hit, service-worker error
  and explicit state-machine failure into one record shape (`what.md` §10.1) that carries, beyond
  the stack: the last 50 breadcrumbs, a snapshot of the engine's inputs (last 20 events, package
  versions, goal), sync and download machine states, storage state, build id and environment.
- Records ride the same offline outbox as review events and land in a PocketBase collection,
  deduplicated by fingerprint per hour.
- Source maps are uploaded at deploy to a private directory and never served publicly; a
  superuser-only route serves them to `pnpm errors`, which symbolicates and prints a readable
  report. The same tool family covers server logs and word flags.
- Server routes all run through one wrapper that logs structured attributes and returns stable
  error codes.
- `docs/runbooks/debug-from-log.md` is the procedure.

## Consequences

- One collection, three routes, one CLI; no external service.
- Breadcrumbs never contain bodies or phone numbers; the only free text is an optional
  500-character user note.
- A build whose source maps were not uploaded is a broken deploy: the deploy script fails if
  the upload fails.
