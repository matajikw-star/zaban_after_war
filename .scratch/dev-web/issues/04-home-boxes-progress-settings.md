# 04 — Home, boxes, word detail, progress, session summary, settings, season

Status: resolved
Type: task
Phase: 3
Blocked by: 01

## Goal

The remaining offline screens of `docs/spec/what.md` §7.8: `/` (goal ring, streak, progress %,
conquered, «شروع مرور», update chip slot, backup dot), `/boxes` (five columns → list → word),
`/word/:id` (full card + review timeline + know + flag), `/progress` (percent with the
one-sentence rule, conquered/total, 30-day SVG bar chart of reviews per day, pace estimate vs
exam date with a goal nudge), `/session/summary`, `/settings` (local parts only: goal, exam
date, field, theme, «گزارش مشکل» → `user_report` record into the outbox, about + version +
support link; the account/backup/download rows render their state from the stores and are wired
in Phase 4/5), `/season` (shown once when the exam date passes).

Monochrome throughout; charts gray-scale; Persian digits everywhere.

## Done when

Unit tests for the chart data derivation and the season trigger; a Playwright spec that opens
every screen after 10 reviews and checks the numbers agree with the summary. Rows marked `live`.

## Comments

- Built all seven screens: `screens/home/Home.tsx`, `screens/boxes/Boxes.tsx`,
  `screens/word/{Word,WordDetail}.tsx`, `screens/progress/{Progress,ChartBars}.tsx`,
  `screens/session-summary/SessionSummary.tsx`, `screens/settings/Settings.tsx`,
  `screens/season/Season.tsx`.
- New pure, unit-tested modules: `engine/chart-data.ts`, `engine/season.ts`,
  `engine/box-items.ts`, `ui/relative-time.ts` — 24 tests. Plus `engine/use-fold.ts`
  (`useSyncExternalStore` over `fold-cache.ts`) so a review recorded on `/word/:id` repaints
  `/boxes` and `/progress` without polling.
- New `screens/layout/BottomNav.tsx`, rendered by each of the four top-level screens rather than
  added to the shared `Layout.tsx` (kept the diff off a file another agent's screens also render
  inside).
- Shared-file edits, kept minimal: `db/dexie.ts` gained one `KvKey` (`seasonShownFor`);
  `strings.ts` gained new blocks (`home` extended, `boxes`, `word`, `progress`, `summary`,
  `settings`, `season`) appended at the end, no existing keys reordered.
- `content/field-codes.json` (repo root) is imported straight into `Settings.tsx` — only the
  `codes` map (named codes) is offered in the field picker, per the ticket.
- Exam date is a `۱۴۰۵/۱۱/۱۵`-shaped text input parsed/formatted with `date-fns-jalali`; theme
  picker is three controlled `Switch`es (no `RadioGroup` primitive exists yet).
- Did not touch `screens/review/**`, `screens/paywall/**`, `stores/session.ts` (read-only import
  in `SessionSummary.tsx`), or add `engine/card-content.ts`/`engine/paywall-counter.ts`/
  `ui/GradeButtons.tsx`.
- Verification (all green): `pnpm lint` (0 errors), `pnpm typecheck`, `pnpm test` (305 tests),
  `pnpm build`, `pnpm budget` (182.4 KB / 300 KB gzipped), `KL_E2E_CHANNEL=msedge pnpm e2e`
  (7 passed, including the pre-existing smoke spec).
- Docs updated in this commit: `docs/spec/what.md` §7.8 rows flipped to `[live]` (settings
  starred: local parts live, account/backup/download show live store state, `run()` still a
  Phase 4/5 stub); `docs/spec/how-why.md` new §5.6; `wiki/log.md` appended.
