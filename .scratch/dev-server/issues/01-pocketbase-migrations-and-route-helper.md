# 01 — PocketBase: migrations, the route helper, config/me/profile/health

Status: ready-for-agent
Type: task
Phase: 4

## Goal

`server/pb_migrations/` creating every collection of `docs/spec/what.md` §8.1 with its API
rules, `server/pb_hooks/lib/route.js` (`withRoute(name, handler)` per §8.2 and §10.2:
validation, catch-all, structured log attrs `route, userId, installId, ms, status, code, err,
input` with phone masked and codes hashed, `{ error: { code, message } }` responses), and the
first routes: `GET /api/config`, `GET /api/health`, `GET /api/me`, `PATCH /api/me/profile`.
`review_events.id` is a 36-char text primary key (UUIDv7 from the device). `app_config` is
seeded with one record (list 450000, sale 290000, `freePresentationLimit` 100).

Also: `server/systemd/kl-pocketbase.service` (EnvironmentFile `/opt/kl/.env`, user `kl`,
`--dir /opt/kl/pb_data --hooksDir /opt/kl/pb_hooks --migrationsDir /opt/kl/pb_migrations
--publicDir /opt/kl/pb_public --http 127.0.0.1:8090`), `server/Caddyfile` (§14.2, with the
Let's-Encrypt-only `acme_ca` from `Caddyfile.bootstrap` and `X-Robots-Tag: noindex` until
launch), a `server/README.md` "run locally" section (download the pinned binary into
`server/.pb/`, `pocketbase serve --dev` with the hooks and migrations dirs), and a Vitest API
suite `server/test/*.test.ts` that starts the binary on a random port with a temp `pb_data`,
creates a superuser via the CLI, and exercises the routes over HTTP (§16.3).

## Done when

`pnpm --filter @kl/server test` (or root `pnpm test:server`) starts PocketBase and passes;
migrations apply from empty; `what.md` §8.1 and the four routes marked `live`.
