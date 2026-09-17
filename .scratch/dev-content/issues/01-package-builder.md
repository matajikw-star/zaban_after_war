# 01 — Content package builder

Status: ready-for-agent
Type: task
Phase: 2

## Goal

`pnpm content:build` builds the two packages of `docs/spec/what.md` §6 from `content/`:
`apps/web/public/content/free.json`, `server/content/paid.json` and `server/content/manifest.json`.
Code lives in `packages/content/src/build/` and is unit-tested against a small fixture lexicon.

## Rules (from §6.1–6.2, binding)

- `WordCard` shape exactly as §6.1. `weight = stats.timesTested`; `level` from the lexicon;
  `senses`, `confusables`, `homograph` copied; `hint` is `null` until `content/hints/` exists
  (join by id when it does; only `approved` hints ship).
- **Rank is frozen.** `packages/content/ranks.json` maps id → rank. The builder assigns ranks to
  ids not yet in the file by `stats.priority` desc, `timesTested` desc, `firstYear` desc, id asc,
  appending after the current maximum; it never changes an existing rank. Commit the file.
- `packages/content/exclusions.json`: `{ "ids": [...], "note": ... }`. Start with `as-like` and
  `as-likewise` (see `.scratch/word-data/issues/04`). Latin phrases ship (they were tested).
- Words with empty `senses` do not ship in either package; the build prints
  `shipping N of M words`.
- `free` = the 150 lowest-rank shipping words. `paid` = every shipping word. Both ordered by
  rank. `version` = `YYYY-MM-DD.N` (N increments if a build the same day changes the hash;
  keep `packages/content/versions.json` so the version is reproducible), `builtAt` ISO,
  `schemaVersion: 1`, `hash` = sha256 hex of the canonical JSON (sorted keys, no whitespace)
  of `items`.
- `exam.stems` joined from `content/exams/*.json`: for each `occurrences[]` entry of type
  `tested`, find the question, copy `stem` (blank marker normalised to `.....` — the 17 stems
  that use hyphens), `options`, `key`, `isAnswer`, `questionNo`, `paperId`, `year`.
  `exam.years` sorted unique; `timesTested`, `timesAsAnswer`, `lastYear` from `stats`.
- Never duplicate the stem into `examples`.
- Same input twice → byte-identical output (test it).

## Also

- Extend `packages/content/src/lint.ts` to run the blocking checks 1–5 of
  `docs/plan/content-pipeline.md` "Lint checklist" and report warnings 6, 10, 11, 12, 14; exit 1
  only on blocking findings. A free-150 word without an approved hint is reported as a
  **warning** until `content/hints/` exists (the plan says error; hints do not exist yet, so
  an error would block every build — flip to error in the launch checklist).
- Register root scripts: `content:build` → the builder, `content:lint` (exists).
- `.gitignore` already ignores the outputs; the manifest is regenerated in CI before `pnpm build`.
- `what.md` §6 marks → `live`; record the actual sizes in §6.3; §7.7 says `free.json` is
  revisioned by Workbox's content hash (not renamed by Vite) — make the text true.

## Done when

`pnpm content:build` prints counts and writes the three files; `pnpm test` includes the builder
tests; two consecutive builds give the same hash; `pnpm content:lint` runs the real checks on
`content/` and reports its findings (they are reported, not fixed).
