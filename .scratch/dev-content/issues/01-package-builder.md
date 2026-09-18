# 01 — Content package builder

Status: resolved
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

## Comments

**2026-09-18 — resolved.** Built in `packages/content/src/build/`: `raw.ts` (the on-disk
shapes), `rank.ts` (`assignRanks`), `stems.ts` (`joinStems`, `normalizeBlank`), `card.ts`
(`isShippable`, `buildWordCard`), `hash.ts` (`canonicalJson`, `sha256Hex`), `manifest.ts`
(`nextVersion`, `buildManifest`), `build.ts` (`buildPackages` — the only file that touches
`fs`). `ContentPackage`/`WordCard` and friends live in `packages/content/src/types.ts`,
re-exported from `index.ts` alongside `buildPackages`. `tools/content-build/index.ts` is the
CLI: resolves the real repo paths and `new Date()`, calls `buildPackages`, prints the summary.
40 tests across 6 files (`hash`, `rank`, `stems`, `card`, `manifest` pure; `build` end-to-end
against `__fixtures__/` — 6 lexicon words, 2 exam files, one hyphen-blank stem, one excluded id
(`cherry`), one word without senses (`date`), one context-only word with senses (`elderberry`),
copied per-test into a scratch dir so the tests never touch this repo's real `content/` or
`packages/content/*.json`).

Real run: **shipping 893 of 2,098 words** (895 have senses; `as-like`/`as-likewise` excluded).
`packages/content/ranks.json` (893 entries) and `exclusions.json` are committed;
`versions.json` is committed after the first real build. Sizes measured with `node:zlib`:
`free` (150 words) 303 KB raw / 74 KB gzipped; `paid` (893 words) 1.36 MB raw / 352 KB gzipped
— both will grow toward the ≈ 3.2 MB / 830 KB projected in `what.md` §6.3 as the remaining
1,203 words get senses.

`pnpm content:build` run twice: `version`/`hash` identical both times (`builtAt` differs, as
it must — it is a real timestamp, not part of the hash). `pnpm content:lint` on the real
content: **12 blocking findings**, all check 1 — vocabulary/cloze `testedWord`s with no
lexicon entry (`out`, `reclamation`, `make`, `stressed out`, `called off`, `slightly`,
`wallowing`, `disaffected`, `formulate`, `be`, `seek` across 6 papers; full list in the lint
output). Checks 2–5 are clean on the real corpus. 472 warnings: 150× check 6 (every free-150
word lacks an approved hint — expected, `content/hints/` is empty), 322× check 11
(context-only entries, matches the count already known from word-data), 0× check 12, 0× check
14. Two scoping decisions on the checklist (grammar excluded from check 1; check 4's
sense/translation/example sub-checks gated on `senses` non-empty) are recorded in
`how-why.md` §5.3, since the checklist predates having a corpus to run it against and a literal
reading would have reported non-issues on ~360 grammar questions and ~1,203 mid-pipeline
entries.

Not done, on purpose: content itself was not touched (12 missing lexicon entries and 150
missing hints are real gaps, reported not fixed, per the ticket's own rule and CLAUDE.md's "the
wiki is Claude's to write, sources are read-only" — this ticket is about the builder, not
ingest or word-data). Checklist items 7, 8, 9, 13 need editorial judgement (is a homograph flag
right, is `draft` stale, etc.) and stay a manual `query`, as `lint.ts`'s header now says.
