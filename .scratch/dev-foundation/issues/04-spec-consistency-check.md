# 04 — CI check: what.md's code-mirroring tables agree with the code

Status: ready-for-agent
Type: task
Phase: 7 (built first, before the scope-cut PR, so it verifies that PR)

## Why

`docs/spec/what.md` is normative and "always true of the code" (ADR-0014), but nothing checks
that. As of 2026-09-24 no CI step reads what.md. The scope cut (owner go 2026-09-25) is about
to change collections, routes and error codes; this check makes the spec and the code fail CI
when they drift, in both directions.

## What

A script in `tools/` (TypeScript, run like the other tools; no new dependencies unless boring
and justified), wired into the `ci` job of `.github/workflows/ci.yml` and a root script
(`pnpm spec:check`). It compares, mechanically, both directions:

1. what.md §8.1 collections ↔ the collections created by `server/pb_migrations/` (net of later
   migrations that drop or rename).
2. what.md §8.2 routes ↔ `routerAdd(...)` calls in `server/pb_hooks/`, skipping rows marked
   `[planned]` or deferred.
3. what.md §8.4 beacon names ↔ the beacon name union in `apps/web/src/net/api.ts` and the
   server's accepted list.
4. what.md §17 error codes ↔ the server's error table (`errors.js` or equivalent) and the
   client's codes.
5. what.md §18 env vars ↔ `.env.example`.

Each mismatch prints one line: which table, which name, which side is missing it, and the file
to fix. Exit 1 on any mismatch. No prose checks, no LLM, no network.

Parsing what.md: parse only the tables it needs, located by section heading; if a table's shape
is ambiguous, prefer making the table's format stricter in what.md (in the same PR) over clever
parsing. Status marks (`[live]`, `[planned]`, …) are part of what the parser reads.

## Done when

- `pnpm spec:check` passes on develop, after fixing any real drift it finds (each fix listed in
  `## Comments` with which side was wrong).
- Unit tests for the parser and the comparison (a mismatch in each direction for each table).
- CI runs it; what.md §16 (Testing and CI) describes it; one `wiki/log.md` line.

## Comments
