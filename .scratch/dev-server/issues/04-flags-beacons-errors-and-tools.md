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
  origin/main`, `--allow-branch` for staging, `--dry-run`. No rsync on this machine, so every
  transfer is `tar | ssh … tar x` into a `.new` sibling, swapped in with two renames (Linux
  `rename()` cannot replace a populated directory in one step) — `what.md` §14.4 corrected in
  the same commit. 24 unit tests for the argument parsing, the refusal rules and the plan's
  shape; `--dry-run` proved against this repository. Never connected to the VPS.
- Docs: `what.md` §8.2 rows, §10.3, §16.2's third e2e spec, §19's outbox gap all flipped to
  reflect what is live; §14.4 marked `[built, not yet deployed]`; `docs/runbooks/deploy.md`
  written; `how-why.md` §5.9 records the decisions above in full.
