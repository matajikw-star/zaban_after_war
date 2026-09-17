# Implementation plan

The build order for the system in `docs/spec/what.md`, cut into phases that each end in
something demonstrable. Supersedes `roadmap.md` (M0–M6), whose reasoning still holds. The owner's
purchase and access list is `owner-checklist.md`.

Team: the owner (decisions, purchases, credentials, review) and Claude Code (everything else).
Effort is given in focused sessions (roughly one working day each); calendar time depends on
the owner's lead times, which are listed separately.

Status: **planned, 2026-09-17.** Nothing below has started. Phase 0 is the owner's.

---

## Phase 0 — Owner: purchases and accesses (owner, ~1 week of lead time)

Everything in `owner-checklist.md`. The engineering phases 1–3 do not depend on it; phases 4+ do.
Gate: VPS reachable over SSH, SMS template approved, Zarinpal panel accessible, DNS editable.

## Phase 1 — Foundation and the engine (3–4 sessions)

Tickets under `.scratch/dev-foundation/`:

1. Repo: `apps/web`, `apps/landing`, `apps/admin`, `packages/design`, `android/` scaffolds;
   root scripts; CI `e2e` job skeleton; `.env.example` complete. (Branch protection is already
   on: `main` takes a green-`ci` PR only, verified 2026-09-18.)
2. `packages/core` rewritten to `what.md` §5: types, `params.ts`, `fold`, `progress`, `streak`,
   `paceEstimate`, `nextCard`, `goalFromMinutes`. Exhaustive tests (§16.1) including fast-check.
3. `tools/simulate`: a 90-day synthetic user; output checked by hand once and pinned as a
   snapshot test.
4. `packages/design`: tokens and fonts — **waits for the design-system choice**; until then a
   neutral token file so building can start.

Done when: `pnpm test` covers the engine; the simulator shows a 7-day conquest is possible and
the median is 2–3 weeks; CI green.

## Phase 2 — Content build (2 sessions, plus content work in parallel)

Tickets under `.scratch/dev-content/`:

1. `packages/content`: package builder (§6), `exclusions.json`, blank-marker normalisation,
   stem join, hint join, manifest with hashes; `pnpm content:build`.
2. Lint additions: a word in the free 150 without an approved hint is an error; a word without
   senses is reported as "not shipping".
3. Content pipeline (separate sessions, ongoing): finish word data for the remaining 1,203
   words; generate and approve hints for the free 150 first.

Done when: `free.json` (150 words, all with hints) and `paid.json` build reproducibly with the
same hash twice; sizes recorded in `what.md` §6.3.

## Phase 3 — The offline app (7–10 sessions)

Tickets under `.scratch/dev-web/`, one per screen or machine:

1. App shell: routing, stores, Dexie schema, repo layer, strings, version injection, error
   capture with breadcrumbs (§10.1) from day one.
2. Content loading: free package from precache; active-package abstraction.
3. Onboarding (all steps, all skippable) + placement.
4. Review screen with the full card, grading, know, flag sheet, feedback, goal-reached sheet,
   paywall trigger.
5. Home, boxes, word detail, progress (chart, pace), session summary, settings (local parts),
   season summary.
6. Service worker: precache, prompt-style update, persistence request, install sheet, in-app
   browser detection, iOS instructions.
7. Playwright: onboarding → reviews → offline → reviews → reload (no server yet).
8. Design pass on the chosen system: the approved mockup applied to every screen.

Done when: the owner installs it from a staging URL (or a local build) on a phone, studies the
free package, switches to airplane mode, keeps studying, kills and reopens the app, and nothing
is lost.

## Phase 4 — Server, accounts, backup (4–5 sessions) — needs Phase 0

Tickets under `.scratch/dev-server/`:

1. VPS bootstrap script and runbook; Caddy; PocketBase pinned; systemd; env; backups to S3;
   `/api/health`; TLS verified from an Iranian IP; SSH from GitHub Actions tested (decides the
   deploy path).
2. Migrations for every collection in §8.1, with API rules; the widened `review_events.id`.
3. `withRoute` helper and structured logging; `config`, `me`, `profile`.
4. OTP request/verify with Kavenegar behind a provider interface and a `console` provider;
   rate limits.
5. Sync push/pull; client backup state machine; login merge; restore flow; settings backup UI.
6. Flags, beacons, client-errors routes; outbox draining; `pnpm errors`, `pnpm logs`,
   `pnpm flags` tools; source-map upload in deploy.
7. Deploy scripts (`pnpm deploy`), first staging deploy of the app to `app.konkurleitner.com`
   behind a `noindex` header until launch.

Done when: study on a phone, delete the app, reinstall, log in, and every review is back; a
second device merges instead of overwriting; a forced client error appears symbolicated in
`pnpm errors` within a minute.

## Phase 5 — Payment, discount codes, paid content (3–4 sessions)

Tickets under `.scratch/dev-payment/`:

1. `discount_codes`, `payments`, `entitlements`; `quote`, `request`, `callback`, `status`;
   `reconcileUnverified` cron; amount-unit verification with one real 1,000-toman payment
   (recorded in `what.md` §8.3).
2. Gated `content/paid` with `Range`; client download state machine; entitlement cache.
3. Paywall, checkout, purchase-result screens; pending-payment recovery on launch.
4. Manual grant route and the PB admin procedure for refunds.
5. E2E: the full purchase path against the Zarinpal sandbox or the mock; API tests for every
   `codeStatus` and for callback replay.

Done when: a real small payment grants access and downloads the paid package; a forged callback
does not; a 100 % code grants without the gateway; a 50 % code halves the amount on Zarinpal's
page.

## Phase 6 — Admin, landing, APK (4–5 sessions)

Tickets under `.scratch/dev-admin/`, `.scratch/dev-landing/`, `.scratch/dev-android/`:

1. `apps/admin`: login, overview, reports, errors (with symbolicated view and export), users +
   grant; `admin/stats` route.
2. `apps/landing`: the one page; APK download link; in-app-browser notice; `www` redirect.
3. `android/`: Bubblewrap project, keystore generation (handed to the owner), `assetlinks.json`,
   CI `android` job, APK on the landing page. Test on two phones (one with Chrome default, one
   with Samsung Internet default).

Done when: the owner reads yesterday's sales and today's errors on `admin.konkurleitner.com`;
the APK installs from the landing page and opens full-screen with the app origin verified (no
browser bar).

## Phase 7 — Hardening and beta (5–7 sessions + 1–2 weeks of beta time)

1. Security review of every route (rate limits, rules, secrets) with `/security-review`.
2. Backup restore drill into a scratch PocketBase; logged.
3. Load sanity: 200 concurrent OTP requests and 50 concurrent paid downloads on the VPS —
   headroom recorded.
4. Offline torture: interrupted downloads at 10 %, 50 %, 99 %; login with 2,000 local events;
   clock set a year wrong; storage nearly full.
5. Beta with 10–20 real candidates recruited by the owner; every flag and error triaged daily;
   copy fixes; a discount code for beta users.
6. Launch checklist: DNS TTL, `noindex` removed, `app_config` prices confirmed, `wiki/log.md`
   deploy line, monitoring timer, owner's weekly backup pull scheduled.

Done when: two beta weeks with zero data-loss reports and the error dashboard quiet for 3 days.

## Phase 8 — Launch

Point the landing page at the world; Telegram/Instagram traffic; watch the funnel beacons and
`pnpm errors` daily for the first two weeks. Content updates (more hints, remaining word data)
ship as `pnpm deploy content` with no app change.

## After launch (recorded, not scheduled)

Real-exam mode · per-field view · Bazaar build (needs the ارشاد identifier) · referral code from
a 30-day streak · push notifications only if `mtalk.google.com` reachability is proven ·
uptime monitoring · superuser MFA once an SMTP route exists · FSRS as a re-fold experiment.

---

## Estimate

| Phase | Sessions | Depends on |
|---|---|---|
| 0 owner | — | owner lead times (VPS same day; SMS template 1–3 days; DNS same day) |
| 1 | 3–4 | design choice for the tokens only |
| 2 | 2 (+ parallel content) | — |
| 3 | 7–10 | 1, 2 |
| 4 | 4–5 | 0, 3 |
| 5 | 3–4 | 4 |
| 6 | 4–5 | 5 |
| 7 | 5–7 + beta | 6 |
| **Total** | **≈ 30–37 sessions** | ≈ 6–8 calendar weeks at one session per day, plus 2 beta weeks |

Content readiness (hints for the free 150; word data for the remaining 1,203) runs alongside and
is the more likely long pole for a *complete* paid package; the app can launch with the package
partially complete, growing through content updates, as `what.md` §6.2 allows.

## Risk register

| Risk | Handling |
|---|---|
| TLS issuance fails from an Iranian IP | Caddy's ZeroSSL fallback; then ArvanCloud edge TLS. Tested on day one of Phase 4. |
| GitHub Actions cannot SSH to Parspack | Deploy from the owner's machine with the same scripts; CI still gates PRs. Tested in Phase 4. |
| SMS template approval slow or OTP delivery flaky | `console` provider for all testing; second provider (SMS.ir) behind the same interface if Kavenegar misbehaves in beta. |
| Zarinpal amount unit or callback behaviour differs from docs | One real 1,000-toman payment in Phase 5 before any UI depends on it; `reconcileUnverified` as the safety net. |
| Chrome absent on some phones (TWA) | `customtabs` fallback; PWA install as the other path; Samsung Internet tested. |
| IndexedDB eviction on low-storage devices | `storage.persist()` requested; events are backed up when online; the paid package re-downloads on demand. |
| Content incomplete at launch | Packages ship what has senses; the build prints the count; updates are content-only deploys. |
| Owner loses the Android keystore | Stored in a password manager and as a GitHub secret from day one; losing it means a new package id. |
