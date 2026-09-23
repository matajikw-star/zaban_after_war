# 04 — Flags, beacons, client-errors routes; the log tools; deploy scripts

Status: ready-for-agent
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
