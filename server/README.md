# server/

The PocketBase deployment: one Go binary with SQLite and JavaScript hooks, behind Caddy, on one
Parspack VPS (ADR-0001). The normative description is `docs/spec/what.md` §8 (routes and
collections) and §14 (machine, Caddy, deploy).

## Run locally

```sh
pnpm --filter @kl/server pb:download   # server/.pb/pocketbase, the version POCKETBASE_VERSION pins
pnpm --filter @kl/server pb:dev        # http://127.0.0.1:8090 — admin UI at /_/
pnpm test:server                       # the API suite: a real binary, a temp pb_data, real HTTP
```

`pb:dev` keeps its database in `server/.pb/dev-data/`, creates the superuser
`dev@konkurleitner.local` on first run and prints the password, and starts with
`SMS_PROVIDER=console` so an OTP code is printed to the log instead of sent to a phone. Everything
is git-ignored.

Four routes answer today:

```sh
curl localhost:8090/api/health    # {"ok":true,"version":"0.40.2+hooks.1","time":"…"}
curl localhost:8090/api/config    # the prices and limits from the app_config record
curl localhost:8090/api/me        # 401 {"error":{"code":"UNAUTHORIZED",…}} without a token
```

Two things about the runtime are worth knowing before editing a hook:

- **PocketBase does not reload `pb_hooks/` while it is serving.** Restart `pb:dev` after an edit,
  or you will be testing the previous version of your code.
- **Every handler is serialized and run in its own isolated context**, so a `*.pb.js` file's
  top-level scope is invisible inside its own route handlers. Each handler re-`require`s what it
  needs, through the `__hooks` global — relative paths resolve against the CWD, not `pb_hooks/`.

## Layout

```
pb_hooks/                    PocketBase JS hooks — one file per concern (§8.2)
  lib/route.js               withRoute: auth, validation, error envelope, one log line   [live]
  lib/errors.js              AppError and the stable error codes                         [live]
  lib/env.js                 environment with defaults, checked at startup               [live]
  lib/version.js             the version string /api/health reports                      [live]
  core.pb.js                 GET /api/config, /api/health, /api/me; PATCH /api/me/profile [live]
  otp.pb.js                  POST /api/otp/request, /api/otp/verify                    [planned]
  sync.pb.js                 POST /api/sync/push, GET /api/sync/pull                   [planned]
  pay.pb.js                  POST /api/pay/quote, /api/pay/request; GET /api/pay/callback, /status/:id
  content.pb.js              GET /api/content/manifest, /api/content/paid   (entitlement gate)
  flags.pb.js                POST /api/flags                                           [planned]
  beacon.pb.js               POST /api/beacon                                (fixed names, §8.4)
  errors.pb.js               POST /api/client-errors                  (client error records, §10.1)
  admin.pb.js                GET /api/admin/*                                (superuser only)
  cron.pb.js                 reconcileUnverified, backups, log rotation               [planned]
pb_migrations/               collections and API rules, one file per change
  1758000000_init.js         every collection of §8.1, seeded app_config                 [live]
test/                        the Vitest API suite (§16.3) — starts a real binary          [live]
  harness.ts                 random port, temp pb_data, superuser, api() helpers
scripts/                     download-pocketbase.mjs (the pinned binary), dev.mjs         [live]
Caddyfile                    three origins, TLS, /api proxy                          [building]
systemd/kl-pocketbase.service  the unit that runs the binary as user `kl`            [building]
deploy/                      the VPS's one-time scripts (docs/runbooks/deploy.md)
  bootstrap.sh, Caddyfile.bootstrap, placeholder.html   machine bootstrap        [run 2026-09-18]
  install.sh, superuser.sh   PocketBase install, run as root by `pnpm run provision` [built, not yet run]
content/                     built paid.json + manifest.json — git-ignored,           [planned]
                             shipped by the deploy script, served by content.pb.js
POCKETBASE_VERSION           the pinned binary version; CI downloads exactly this tag     [live]
POCKETBASE_SHA256            sha256 of that version's linux_amd64 zip — provision ships it only on a match [live]
.pb/                         the downloaded binary and the local dev database — git-ignored
```

Rules that hold whatever lands here:

- **Every route goes through `withRoute`.** It is what guarantees the `{ error: { code, message } }`
  envelope, the stable codes, the 32 KB body cap and the one structured log line per request that
  `pnpm logs` and an agent debugging from logs both depend on (§10.2).
- **Entitlement is decided server-side.** Paid content never reaches an unpaid client
  (ADR-0004). `content.pb.js` is the only place that reads `server/content/paid.json`.
- **API rules are the security boundary.** `""` means anyone; `null` means nobody through the REST
  API — only a hook or a superuser. Hooks write with `app.save()`, which bypasses rules by design.
- **Secrets are environment variables** in `/opt/kl/.env` (mode 600, owner `kl`), never in this
  directory. `.env.example` is the list of record (§18).
- **The binary version is pinned.** `POCKETBASE_VERSION` is the single source; CI, the deploy
  script and a developer's local run all read it, so they cannot drift. `lib/version.js` repeats
  the tag because the JSVM exposes no runtime accessor for it, and `test/routes.test.ts` fails if
  the two ever disagree.
- `pb_data/` (the SQLite database) is git-ignored and lives only on the VPS and in backups
  (§14.5).
