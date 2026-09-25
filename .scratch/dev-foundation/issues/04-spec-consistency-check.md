# 04 — CI check: what.md's code-mirroring tables agree with the code

Status: resolved
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

Built as `tools/spec-check/` (parsers/comparisons split into small pure modules, each with its
own `*.test.ts`, plus `index.ts` for the fs wiring — same shape as `tools/deploy/plan.ts`).
`pnpm spec:check`, wired into the `ci` job of `.github/workflows/ci.yml` right after `pnpm test`.

**Drift found and fixed (1 mismatch, real):** `VITE_SUPPORT_URL` is a real, working env var
(`.env.example`, `apps/web/src/vite-env.d.ts`, read in `Settings.tsx` for the support link) that
what.md §18 never listed. The code was right; what.md was stale — added to §18's Build line.

**Scoping decisions, both documented in what.md in the same commit:**

- **Error codes (§17):** §17 itself has no enumerated code list — only the general "errors carry
  codes" `AppError` convention. The actual closed list of *server* codes is written once, in
  §8.2's route-envelope paragraph, and matches `server/pb_hooks/lib/errors.js`'s `CODES` exactly
  (17 codes, both sides). Per the ticket's own instruction ("if §17 lists only one of those,
  compare only what §17 claims to list"), the check reads that §8.2 paragraph and compares only
  the server side. The client's `AppError` code (`apps/web/src/errors.ts`) is not a fixed enum —
  each call site names its own local failure mode (`DOWNLOAD_STALLED`, `SYNC_USER_CHANGED`, ...),
  and `net/api.ts` passes a server code through as `SERVER_<code>` — so nothing in what.md
  enumerates it and this check does not compare it. Added a one-sentence cross-reference to §17.4
  saying so, rather than duplicating the code list into §17 (a second copy would just be a new
  place for the two to drift).
- **Routes — `GET /api/health`:** registered as a `routerUse` middleware, not `routerAdd`
  (PocketBase 0.40 already owns that exact pattern; a second `routerAdd` on it panics at
  startup — see core.pb.js's own comment). The checker treats a `routerUse` block that checks
  `e.request.method !== '<M>'` and `e.request.url.path !== '<path>'` as registering that one
  route, so this is counted rather than special-cased away.
- **`[planned]`/`[deferred]` rows:** only `GET /api/admin/stats` carries `[planned]` today; no
  `[deferred]` rows exist yet. The skip logic matches both literally, ready for either.

No table shape needed to be made stricter — §8.1/§8.2 are proper pipe tables; §8.4/§18/§8.2's
error-code sentence are backtick-quoted lists in prose, parsed the same way §8.4 already implied
(a fixed, deliberately-formatted list, not free text).

**Verification:** `pnpm spec:check` exits 0 on the final tree (also confirmed exit 1 with a
deliberately renamed collection, both directions reported, then reverted); `pnpm lint`, `pnpm
typecheck`, `pnpm test` (826 passed, 50 new in `tools/spec-check/`), `pnpm build`, `pnpm budget`
(227.6 KB of 300 KB) all green.
