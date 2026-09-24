# 04 — Flags, beacons, client-errors routes; the log tools; deploy scripts

Status: resolved
Type: task
Phase: 4
Blocked by: 01

## Goal

Routes `POST /api/flags`, `POST /api/beacon`, `POST /api/client-errors` (dedupe by fingerprint
within an hour → `count++`), `GET /api/admin/sourcemap/:sha/:file` per `docs/spec/what.md`
§8.2, §8.4, §10.1, §15 (per-install daily caps, 32 KB bodies, unknown beacon names rejected).

Tools (`tools/errors`, `tools/logs`, `tools/flags`, §10.3): log in as superuser with
`KL_API_ORIGIN`/`KL_ADMIN_EMAIL`/`KL_ADMIN_PASSWORD` from `.env.local`, pull the records,
symbolicate stacks with `source-map` against `/api/admin/sourcemap`, print readable reports;
`--group`, `--since`, `--kind`, `--fingerprint`, `--user`, `--route`, `--level`.

Deploy (`tools/deploy`, §14.4): targets `web`, `server`, `content`, `landing`, `admin`, `all`;
refuses on a dirty tree or when `HEAD ≠ origin/main` (override flag `--allow-branch develop`
for staging, printed loudly); rsync over SSH as `kl`; atomic `pb_public.new → mv`; source maps
to `/opt/kl/sourcemaps/<sha>/` and removed from `pb_public`; server restart + health check;
append `/opt/kl/deploys.log`. `docs/runbooks/deploy.md`.

## Done when

API tests for the caps and the dedupe; `pnpm errors` symbolicates a deliberately thrown error
from a local build; a first staging deploy to `app.konkurleitner.com` is performed and the
health route answers over HTTPS. Marks `live`.

## Comments

Routes, tools and the deploy script are built, tested and marked `[live]` in `what.md` (deploy
itself is `[built, not yet deployed]`). The top-level task for this ticket explicitly said not
to connect to the VPS or run a real deploy — **the first staging/real deploy to
`app.konkurleitner.com` is still to do**, by the lead, per that instruction; everything else in
"Done when" is met.

The routes, client-outbox and `tools/errors`/`tools/logs`/`tools/flags` bullets below were
finished and verified in commits `c939b01..07e0d17`, before the session that wrote this comment
died mid-work. `tools/deploy` was salvaged unverified (commit `7366e02`, `wip(tools): deploy
tool and docs, unverified`) — a follow-up session ran it through lint/typecheck/test/build/
budget/e2e, found and fixed two real bugs in it, and corrected the `pnpm run deploy` invocation
shown everywhere in the docs. Details below.

What shipped:

- `POST /api/flags`, `POST /api/beacon`, `POST /api/client-errors`,
  `GET /api/admin/sourcemap/:sha/:file` (`server/pb_hooks/telemetry.pb.js`,
  `lib/telemetry.js`) — per-install daily caps (flags 50, beacons 200/day + 20/call, client-errors
  30; beacons had no number in `what.md` before this ticket, decided here), 32 KB bodies, unknown
  beacon names rejected, client-errors dedupe by (installId, fingerprint) within an hour →
  `count++` without touching the cap, sourcemap route's path params checked against a strict
  allow-list (verified against the real binary: PocketBase matches `{sha}/{file}` on the
  undecoded path, so a percent-encoded slash in `file` still reaches the handler decoded — the
  allow-list, not the router, is what makes traversal impossible). 24 new API tests
  (`server/test/telemetry.test.ts`), on top of the existing 86; `pnpm test:server` run 3 times,
  green every time.
- Client outbox: `OUTBOX_ROUTES_LIVE` flipped to `true` for all three kinds; `sync/backup.ts`'s
  `request()` now drains the outbox for an anonymous install too (never touching the
  login-gated `idle → pushing → pulling → idle` machine), closing the gap `what.md` §19 recorded.
  3 new unit tests plus the existing 55 in `backup.test.ts`.
- `tools/errors`, `tools/logs`, `tools/flags` (`tools/lib/{env,pb,args,symbolicate}.ts`,
  one new dependency: `source-map`). Proved against a local PocketBase and a local build, not
  the real server: `apps/web/e2e/errors.spec.ts` — a real throw from the real built bundle
  (`main.tsx`'s `?__e2eThrow=1` hook, inert for a real user), captured, drained anonymously,
  fetched and symbolicated by the actual `tools/errors` CLI, asserting the resolved frame cites
  `src/main.tsx`, not the minified `assets/*.js` position it started from.
- `tools/deploy` (`args.ts`, `refusal.ts`, `plan.ts`, `git.ts`, `index.ts`) — targets
  `web`/`server`/`content`/`landing`/`admin`/`all`, refuses on a dirty tree or `HEAD ≠
  origin/main`, `--allow-branch <branch>` for staging (HEAD must equal `origin/<branch>`),
  `--dry-run`. No rsync on this machine, so every transfer is `tar | ssh … tar x` into a `.new`
  sibling, swapped in with two renames (Linux `rename()` cannot replace a populated directory in
  one step) — `what.md` §14.4 corrected in the same commit. **Two bugs found and fixed in the
  salvaged code, in this follow-up session (commit `8bb611f`):**
  1. `--allow-branch <branch>` compared the *local checkout's branch name* against `<branch>`
     (`refusal.test.ts` even asserted "allows … HEAD mismatch or not"), so a local branch
     literally named `develop` with unpushed commits would pass the override — exactly the
     unreviewed-code-reaches-the-VPS case the refusal exists to stop. Fixed to compare HEAD's
     sha against `origin/<branch>`'s sha instead, which is what this ticket's own instructions,
     and `what.md` §14.4's plain reading, always said.
  2. The `server` target's health check was one `curl -sf` immediately after
     `systemctl restart`, racing the restart. Replaced with a 30s poll loop that exits non-zero
     with `DEPLOY_HEALTH_TIMEOUT` on timeout.

  Also found: this repo's pinned pnpm (`12.3.4`) does not strip a `--` separator for `run`
  (pnpm/pnpm#13295) — `pnpm run deploy -- web`, the form used everywhere in the salvaged docs
  and comments, fails with "unknown flag --". Every doc and comment now says
  `pnpm run deploy web` instead (commit `4469672`).

  Verified this session: `pnpm lint`, `pnpm typecheck`, `pnpm test` (518 passed, incl. 27 deploy
  unit tests — up from the salvage's 24 because of the new refusal/health-check cases), `pnpm
  test:server` run twice (110 passed both times), `pnpm build`, `pnpm budget` (215.9 KB of
  300 KB), `KL_E2E_CHANNEL=msedge pnpm e2e` (17 passed). `--dry-run` itself could not be run to
  a successful printout from this branch — it correctly refuses here, on both the dirty-tree
  check and, once committed, on `HEAD ≠ origin/main` and (with `--allow-branch develop`) on
  `HEAD ≠ origin/develop`, since this branch is genuinely ahead of both; both refusal messages
  were demonstrated on a clean, committed tree instead. The plan `--dry-run` would print for
  `all` was demonstrated honestly by calling the real, unmodified `buildPlan()` directly with a
  placeholder context (not a real host) — content → server (ship, swap, restart, poll-health) →
  web (ship excluding `*.map`, ship maps to `/opt/kl/sourcemaps/<sha>`, swap) → landing → admin
  → the `deploys.log` line, in that order. **Still never connected to the VPS and never ran a
  real deploy**, per this ticket's instruction; the first real run is the lead's.
- Docs: `what.md` §8.2 rows, §10.3, §16.2's third e2e spec, §19's outbox gap all flipped to
  reflect what is live; §14.4 marked `[built, not yet deployed]` and corrected for the two bugs
  and the `pnpm run deploy` invocation above; `docs/runbooks/deploy.md` corrected the same way;
  `how-why.md` §5.9 records the original decisions; this session's fixes are in `wiki/log.md`.
- 2026-09-24, third session (lead's review follow-up; running notes, a kill loses nothing):
  - **A. Per-IP rate limits — done.** Migration `1758800000_rate_limits.js` switches PocketBase's
    limiter on with an explicit list that *replaces* the four disabled defaults (enabling alone
    would have switched on a `/api/` 300/10 s catch-all): `POST /api/client-errors` 120/h,
    `POST /api/beacon` 300/h, `POST /api/flags` 300/h, `_superusers:auth` 3/10 s. Hour windows,
    not the proposed 60/min, because 60/min still lets one IP write ≈ 2.8 GB/day of error rows;
    no `/api/` catch-all because of carrier-grade NAT (how-why §5.11 has the numbers). Label
    syntax and window semantics checked against the 0.40.2 binary and its source
    (`apis/middlewares_rate_limit.go`). `down` verified with `migrate down 1`: restores exactly
    the four defaults, disabled. `server/test/rate-limits.test.ts` (5 tests) proves the rules,
    a 429 for one IP rotating installIds on each telemetry route with no row written for the
    refused call and another IP still served, and superuser login limited per IP. No per-IP
    daily row ceiling: would need client IPs on permanent rows (§15, no PII). Also found and
    fixed a false harness comment: `superuser upsert` does not apply this repo's JS migrations.
  - **B. tools/deploy fixes — done** (commit `afe8496`). `sudo -n /bin/systemctl restart
    kl-pocketbase` (test reads bootstrap.sh's sudoers line) + `DEPLOY_NO_ENV` guard; optional
    `DEPLOY_SSH_KEY_FILE` → `-i`, always `BatchMode=yes`; `--dry-run` now previews with a loud
    "WOULD BE REFUSED" warning (pure `gate()` in refusal.ts), a real run still refuses. Found a
    real bug: `deploy web` on a clean checkout shipped a dist with no `free.json` (checked both
    ways locally) — web now runs `content:build` unless `content` did, and refuses a dist
    without `dist/content/free.json`. `content` ships `paid.json` + `manifest.json` to
    `/opt/kl/content` = `CONTENT_DIR` — correct as it was.
  - **C. One-time install — built, never run.** `pnpm run provision [--dry-run]
    [--allow-branch]` (tools/deploy/provision.ts; pure: provision-plan.ts, server-env.ts,
    pocketbase-release.ts, all unit-tested), `server/deploy/install.sh` + `superuser.sh`,
    `server/POCKETBASE_SHA256` pin. Download + double checksum + extraction + kit tarball
    exercised locally; `install.sh` only `bash -n` (no Linux here). Runbook: deploy.md →
    "First deploy (one time)".
