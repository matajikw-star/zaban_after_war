# 01 — PocketBase: migrations, the route helper, config/me/profile/health

Status: resolved
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

## Comments

### 2026-09-18 — PocketBase 0.40.2 facts, gathered before writing code

Source of truth was the binary's own generated `pb_data/types.d.ts` (24,815 lines), not the
website. Downloaded 0.40.2 into `server/.pb/` and booted it once against a scratch dir to get it.

- **Handlers are serialized.** PocketBase's docs: "Each handler function (hook, route, middleware,
  etc.) is serialized and executed in its own isolated context as a separate 'program'." Nothing
  from a file's top-level scope is visible inside a route handler, so every `require` lives
  *inside* the handler body.
- **`require` is CJS only and resolves against the CWD**, not `pb_hooks/`. Use the `__hooks`
  global: ``require(`${__hooks}/lib/route.js`)``.
- A fresh install already has a default `users` auth collection, so the init migration updates it
  (find-or-create) rather than blind-creating.
- `collection.fields.add(field)` REPLACES a field of the same name, otherwise appends — that is
  how `review_events.id` is widened. `TextField` carries `primaryKey`, `autogeneratePattern`,
  `min`, `max`, `pattern`, `system`.
- Auth options are flat on the collection: `passwordAuth: {enabled}`, `otp: {enabled}`,
  `authToken: {duration}` in seconds.
- `$app.logger().info(msg, k, v, k, v, …)` — alternating key/value varargs, not an object. `_logs`
  is written on a **3-second debounce** (or at 200 entries).
- `$security` exposes md5/sha256/sha512 but **no sha1**, so redaction uses a sha256 prefix.
- With `passwordAuth` off there is no auth-with-password for `users`; superuser
  `POST /api/collections/users/impersonate/:id` is how a test gets a user token.

### 2026-09-18 — three things found by building, not by reading

1. **`GET /api/health` cannot be registered.** PocketBase 0.40 owns the pattern and a second
   `routerAdd` on it panics the router at startup — the server does not boot at all
   (`pattern "GET /api/health" … conflicts with pattern "GET /api/health"`). Ours is a `routerUse`
   middleware that answers that one path and calls `e.next()` for everything else.
2. **`record.get()` on a `json` field is not a JS object.** It is Go's `types.JSONRaw`: it marshals
   correctly on the way out, but its properties read as `undefined` from JS. `profile.updatedAt`
   was therefore always `undefined`, silently turning newer-wins into always-wins on
   `PATCH /api/me/profile`. Caught only because the test asserted the *older* write was rejected.
   `lib/route.js` now reads json fields through `readJsonField` (`getString` + `JSON.parse`).
3. **PocketBase does not reload `pb_hooks/` while serving.** Two rounds of "the fix did not work"
   were the old code still running. The harness starts a fresh process per test file; the README
   says so for `pb:dev`.

Also: the default `users.email` is required, which would block the OTP flow from creating an
account from a phone alone — the migration makes it optional.

### 2026-09-18 — deviations from the ticket, and why

- **sha256, not sha1**, for the hashed `code`/`token`/`password` values in the log: the JSVM
  exposes no sha1. Same property — equal inputs collide, nothing reads back.
- **`client_errors` stores the client's `userId` (§10.1) as a relation named `user`**, like every
  other collection here. Ticket 04's route does the mapping.
- **`@kl/server` has no `typecheck` script**, because the ticket limited it to `vitest` as its only
  devDependency and the harness needs `@types/node` to typecheck. `server/test/` is therefore
  covered by Biome and by running, not by `tsc`. Adding `@types/node` and a `typecheck` script is
  a one-line follow-up if that trade looks wrong.
- Biome needed **no CommonJS/globals escape hatch** — it flagged only style rules, which were
  fixed rather than suppressed. The `server/pb_hooks/**` + `server/pb_migrations/**` override in
  `biome.json` declares the JSVM globals anyway, so a future rule cannot break the build over
  `$app` or `routerAdd`; `server/test/**` turns off `noExplicitAny`.

### 2026-09-18 — verification

`pnpm install`, `pnpm lint` (exit 0, no diagnostics), `pnpm typecheck` (exit 0), `pnpm test`
(136 tests, unchanged, no binary needed), `pnpm test:server` (**28 tests, 3 files**). All four
routes also driven by hand with `curl` against `pnpm --filter @kl/server pb:dev`.
