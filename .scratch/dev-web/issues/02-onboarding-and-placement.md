# 02 — Onboarding and placement

Status: resolved
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

## Comments

Finished a WIP commit (`8aeac1a`) salvaged from an agent killed mid-task by the weekly rate
limit: the step machine, the five step components and `placement.ts`/`redirect.ts` already
existed but had never been run.

What was missing and is now done:

- `screens/onboarding/Onboarding.tsx` drives `steps.ts`'s machine and renders each step, owning
  a single footer (back / skip / next) — every step component only renders its own content, per
  `Slides.tsx`'s existing split.
- `screens/onboarding/InstallStep.tsx`: the install nudge is a message only, no button of its
  own; the footer's next button (labelled «ادامه» on this step) is the continue action. The real
  `beforeinstallprompt` capture is ticket 05 (`feat/web-pwa`), built separately — not touched here.
- `screens/onboarding/finish.ts`: `createFinishOnboarding` is the pure(ish) finish handler —
  writes the profile via the settings store, queues `onboarding_done` through the same
  `outboxEnqueue('beacon', …)` path `Review.tsx` uses, calls a guarded
  `requestPersistentStorage()` (feature-detects, catches, never rejects or blocks), then
  navigates home. It closes over a `fired` flag so a second call (a stray re-entry into `done`)
  writes nothing twice — tested directly in `finish.test.ts` with injected deps, no React or
  IndexedDB needed.
- «قبلاً حساب داشتم» on slide 1 routes to `/login` (already wired in the salvaged `Slides.tsx`;
  confirmed and exercised by the new e2e spec).
- Fixed two bugs in the salvaged commit: `steps.test.ts`'s backward-walk loop included the
  terminal `done` step (fixed the test, not the machine — `done` staying terminal on `back` is
  correct); a biome format violation in `PlacementStep.tsx`.
- Playwright: `e2e/onboarding.spec.ts` — a fresh device lands on `/onboarding` (not home), walks
  the slides, picks 10 minutes/day, skips exam-date/field/placement, continues past the install
  step, lands on home with the goal line matching `goalFromMinutes(10) = 100`, and the outbox
  holds a queued `onboarding_done` beacon; a reload stays on home. A second test covers the
  «قبلاً حساب داشتم» → `/login` route.
- `smoke.spec.ts`, `screens.spec.ts` and `review.spec.ts` all pre-date the onboarding redirect
  and started with no profile, so `/` now bounced them to `/onboarding`. Added a shared
  `e2e/helpers.ts` (`seedProfile`/`DEFAULT_E2E_PROFILE`) writing `kv.profile` the same way
  `/onboarding`'s finish handler does; `smoke.spec.ts` and `review.spec.ts` now use it,
  `screens.spec.ts` keeps its own combined profile+events seed but navigates to `/` again after
  seeding instead of reloading (a reload was reloading `/onboarding`, where it had been bounced
  before the profile existed).

Infra fix required to make `pnpm e2e` runnable at all on this machine: `vite preview` (and
`vite dev`) were binding only the IPv6 loopback (`::1`) by default, which nothing on this box —
not curl, not PowerShell, not Playwright's own readiness probe — could reach; the machine has a
proxy client (FlClash) installed with a TUN adapter that appears to intercept IPv6 loopback but
not IPv4. Bound `apps/web/vite.config.ts`'s `server`/`preview` and
`apps/web/playwright.config.ts`'s `baseURL`/`webServer.url` to `127.0.0.1` explicitly. This is a
general robustness fix (IPv6-first `localhost` resolution is not this machine's quirk alone),
not a workaround specific to the onboarding feature, and does not touch how the app is served in
production (Caddy, §14).

All of `pnpm lint`, `pnpm typecheck`, `pnpm test` (366 tests), `pnpm build`, `pnpm budget`, and
`KL_E2E_CHANNEL=msedge pnpm e2e` (11 specs) pass.
