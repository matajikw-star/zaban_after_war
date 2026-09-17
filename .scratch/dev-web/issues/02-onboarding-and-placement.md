# 02 — Onboarding and placement

Status: ready-for-agent
Type: task
Phase: 3
Blocked by: 01

## Goal

`/onboarding` per `docs/spec/what.md` §7.8 row 1 and §5.5–5.6: three slides → minutes/day
(10/20/30/45) → exam date (Jalali picker, skippable) → field (skippable, names from
`content/field-codes.json` copied into the free package build or imported as JSON) → placement
(top 100 words by rank as a swipe/tap list; «بلدم» emits a `know` event, «بلد نیستم» nothing;
skippable) → install nudge (a sheet; the real prompt wiring is ticket 05) → home.

Writes `profile` through the settings store; queues `beacon onboarding_done`; requests
`navigator.storage.persist()` at the end. «قبلاً حساب داشتم» on the first slide routes to
`/login` (placeholder until Phase 4). A returning user (profile exists) never sees onboarding.

## Done when

Unit tests for the goal derivation and the placement event emission; a Playwright spec that
completes onboarding with 10 minutes and skips the rest, lands on home, reloads, and is still on
home. `what.md` §7.8 onboarding row marked `live`.
