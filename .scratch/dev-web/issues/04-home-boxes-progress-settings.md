# 04 — Home, boxes, word detail, progress, session summary, settings, season

Status: ready-for-agent
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
