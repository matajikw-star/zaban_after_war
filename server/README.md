# server/

The PocketBase deployment: one Go binary with SQLite and JavaScript hooks, behind Caddy, on one
Parspack VPS (ADR-0001). The normative description is `docs/spec/what.md` §8 (routes and
collections) and §14 (machine, Caddy, deploy). Only `deploy/` and `POCKETBASE_VERSION` exist
today; everything else is planned.

```
pb_hooks/                    PocketBase JS hooks — one file per concern (§8.2)   [planned]
  lib/route.js               shared helpers: auth, rate limit, error envelope, request id
  otp.pb.js                  POST /api/otp/request, /api/otp/verify
  sync.pb.js                 POST /api/sync/push, GET /api/sync/pull
  pay.pb.js                  POST /api/pay/quote, /api/pay/request; GET /api/pay/callback, /status/:id
  content.pb.js              GET /api/content/manifest, /api/content/paid   (entitlement gate)
  flags.pb.js                POST /api/flags
  beacon.pb.js               POST /api/beacon                                (fixed names, §8.4)
  errors.pb.js               POST /api/errors                                (client error records, §10.1)
  admin.pb.js                GET /api/admin/*                                (dashboard, superuser only)
  cron.pb.js                 reconcileUnverified, backups, log rotation
pb_migrations/               collections and API rules, one file per change    [planned]
Caddyfile                    three origins, TLS, /api proxy, assetlinks        [planned]
systemd/kl-pocketbase.service  the unit that runs the binary as user `kl`      [planned]
deploy/                      one-time machine bootstrap                        [exists]
  bootstrap.sh, Caddyfile.bootstrap, placeholder.html
content/                     built paid.json + manifest.json — git-ignored,    [planned]
                             shipped by the deploy script, served by content.pb.js
POCKETBASE_VERSION           the pinned binary version; CI downloads exactly   [building]
                             this tag for the e2e job
```

Rules that hold whatever lands here:

- **Entitlement is decided server-side.** Paid content never reaches an unpaid client
  (ADR-0004). `content.pb.js` is the only place that reads `server/content/paid.json`.
- **Secrets are environment variables** in `/opt/kl/.env` (mode 600, owner `kl`), never in this
  directory. `.env.example` is the list of record (§18).
- **The binary version is pinned.** `POCKETBASE_VERSION` is the single source; CI, the deploy
  script and a developer's local run all read it, so they cannot drift.
- `pb_data/` (the SQLite database) is git-ignored and lives only on the VPS and in backups
  (§14.5).
