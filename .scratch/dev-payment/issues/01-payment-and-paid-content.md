# 01 — Payment, discount codes, entitlement, paid content download

Status: ready-for-agent
Type: task
Phase: 5
Blocked by: dev-server/03

## Goal

Server (`docs/spec/what.md` §8.2, §8.3, §15): `POST /api/pay/quote`, `POST /api/pay/request`,
`GET /api/pay/callback`, `GET /api/pay/status/:id`, `POST /api/admin/grant`, crons
`reconcileUnverified` (15 min) and expire pending > 2 h. Zarinpal REST v4 with `currency: IRT`,
sandbox switch, a `mock` gateway (`ZARINPAL_PROVIDER=mock`) for CI that redirects straight to
the callback. Discount code validation order exactly as §8.3. `GET /api/content/manifest` and
`GET /api/content/paid` (entitled only, `Range`, 20/user/day).

Client: `/paywall`, `/checkout`, `/purchase/result` screens (§7.8), `pendingPayment` recovery
on launch, entitlement cache (§7.6, never revoked by the client), `sync/download.ts` wired per
§7.5 (Range resumption, sha256 verify, atomic swap, progress in settings and the result screen).

## Done when

API tests for every `codeStatus`, wrong-amount callback, callback replay, unentitled content
gate, 100 % code grants without the gateway; client download machine tests with interrupted
streams; Playwright: paywall → login → checkout with a 50 % code → mock gateway → result → paid
package downloaded → offline → study from it → reload. Marks `live`. The real 1,000-toman
verification is done by the owner's request later and recorded in §8.3.

## Hard requirement added 2026-09-24 (from the OTP review)

While `SMS_PROVIDER=mock`, `/api/otp/verify` accepts `123456` for **any** phone number, so anyone
can sign in as anyone. That is acceptable only while accounts hold nothing of value. Therefore:
every payment route (`/api/pay/*`) and the paid-content download must refuse with an error code
(e.g. `PAYMENT_DISABLED_MOCK_SMS`, 503) whenever `SMS_PROVIDER=mock`, and an API test must prove
it. Payment goes live only after the owner's Kavenegar identity verification and a switch to
`SMS_PROVIDER=kavenegar`.

## Comments

### 2026-09-24 — server half done on `feat/payment-server`; client half pending

Status left at `ready-for-agent`: the ticket resolves only when the client half and the
Playwright journey land. The contract is `docs/spec/what.md` §8.2 (rows marked `[live]`), §8.3
and §7.5/§7.6; the decisions are `docs/spec/how-why.md` §5.14.

Per route (`server/pb_hooks/pay.pb.js`, `content.pb.js`, rules in `lib/pay.js`, gateway in
`lib/zarinpal.js`):

- **Gate.** While `SMS_PROVIDER=mock` every `/api/pay/*` route and `GET /api/content/paid` answer
  503 `PAYMENT_DISABLED_MOCK_SMS` before auth, body, writes or gateway calls
  (`test/payment-gate.test.ts`). `manifest`, `me`, `admin/grant` are not gated.
- **`POST /api/pay/quote`** `{code?}` → `{listPrice, salePrice, discountAmount, payable,
  codeStatus, code}`; `codeStatus` ∈ `none | ok | invalid | expired | exhausted | used |
  already-entitled`. Every status and the §8.3 order are tested.
- **`POST /api/pay/request`** `{code?}` → `{paymentId, gatewayUrl}` or `{paymentId, granted: true}`
  (100 % code, no gateway call, entitlement `source: discount`). Errors `ALREADY_ENTITLED` 409,
  `DISCOUNT_REJECTED` 400 + `codeStatus`, `GATEWAY_FAILED` 502.
- **`GET /api/pay/callback`** → 302 to `/purchase/result?status=ok&ref=&paymentId=` ·
  `status=failed&reason=cancelled|amount_mismatch|not_paid|unknown_payment&paymentId=` ·
  `status=pending&paymentId=` (gateway unreachable; poll status). Replay, 4 concurrent callbacks,
  wrong amount, cancelled, not paid all tested.
- **`GET /api/pay/status/:id`** → `{paymentId, status, refId, failReason, entitled}`; another
  user's id is `NOT_FOUND`.
- **`POST /api/admin/grant`** (superuser) `{phone, note?}` → `{userId, entitlementId, created}`,
  idempotent.
- **`GET /api/content/manifest`** → `{free, paid}`; **`GET /api/content/paid`** → 200 / 206 with
  `Content-Range` / 416, `ETag` = paid hash (send `If-Range`), `X-Content-Version`,
  `NOT_ENTITLED` 403, 21st fetch in 24 h → 429 `RATE_LIMITED` + `retryAfter`.
- **Crons** `reconcile_unverified` (15 min) and `expire_pending` (5 min; pending past
  `expiresAt` = created + 2 h), run in tests via `POST /api/crons/<id>`.
- **Schema** `pb_migrations/1759000000_payment.js`: `payments.failReason/expiresAt`, unique
  authority, unique (`user`, `product`) on entitlements, `discount` source, `content_downloads`.
- **Env** `ZARINPAL_PROVIDER` (`zarinpal`|`mock`) and `ZARINPAL_API_BASE` (tests only), in
  `.env.example` and §18.

For the client agent — things the e2e journey will need that are **not** done here:

1. `server/scripts/e2e.mjs` runs `SMS_PROVIDER=mock`, so every payment route is gated there. The
   journey needs that server on `SMS_PROVIDER=console` (the code is printed to stdout as
   `sms.console phone=… code=NNNNN`, which is how `server/test/otp.test.ts` reads it) — or a
   second PocketBase for the payment spec. Changing it is a client-half decision; the existing
   e2e specs log in with `123456` today.
2. The same script sets neither `ZARINPAL_PROVIDER=mock`, `ZARINPAL_CALLBACK_URL` (the mock gateway
   redirects to it; it must be the e2e server's `/api/pay/callback`) nor `CONTENT_DIR` (should be
   `server/content`, which `pnpm content:build` fills); `PUBLIC_APP_ORIGIN` is already the preview
   origin, which is where the callback's 302 lands.
3. Mock-gateway `refId`s look like `MOCK-0123456789`; the real ones are numbers.

Still open for the owner: the real 1,000-toman verification (§8.3), which is also where the
Zarinpal v4 field names in `lib/zarinpal.js` get confirmed (how-why §5.14 lists them).

### 2026-09-24 — lead review: two fixes on `feat/payment-server`

1. **A 100 % code's last use could go to every racer.** The free-grant path checked `maxUses`
   only in `quote()`, outside the transaction, then counted the use unconditionally: eight users
   racing for a `maxUses: 1` free code got 4–7 packages in the new test (red before the fix, three
   runs). Now the grant claims the use first inside its transaction
   (`… WHERE code = ? AND usedCount < maxUses`); a lost claim saves nothing and answers
   `DISCOUNT_REJECTED` + `codeStatus: exhausted`. The paid path still counts unconditionally, on
   purpose (the user has paid; the overrun is logged as `pay.code_over_limit`).
2. **Unknown `/api/*` paths answered `200 text/html`** on staging (pb_public's index fallback).
   A middleware in `core.pb.js` now answers the JSON envelope, 404 `NOT_FOUND`, for any method, but
   only when the router's matched pattern is not under `/api` — so no real route is shadowed. A
   method-less `/api/{path...}` route panics PocketBase 0.40.2 at startup (tried). Client note:
   a 404 `NOT_FOUND` from a route the client expects to exist means the server is older than the
   client.

### 2026-09-25 — client half part A

Branch `feat/payment-client-2` (the WIP `e8e46eb` + `origin/develop` merged). Status unchanged:
part B (the purchase journey) is what flips the marks to `[live]`.

**Kept from the WIP**, after reading it against what.md §7.5/§7.6/§8.2 — it was sound: the
download machine and runner (Range + If-Range, 200-for-206 restart, 416, ETag check, sha256
verify, install only after verify) and its fake-server harness; `mergeEntitlement` (never
revokes); `package-hash.ts` (the builder's canonical JSON, byte-checked against it); the
`net/api.ts` contract fixes (`grantedAt` is PocketBase text, status `verified` not `paid`,
`codeStatus: 'none'`, `DISCOUNT_REJECTED`'s `codeStatus`); `adoptServerEntitlement` as the only
entitlement writer.

**Rewritten or added, and why:**
- The kv key back to the spec's `downloadReceivedBytes` (the WIP renamed it to
  `downloadPartial`); its value holds the bytes, since a reload loses the in-memory buffer
  (how-why §5.15).
- 503 `PAYMENT_DISABLED_MOCK_SMS` never reported: the WIP filed a record at the fifth failure,
  i.e. every staging account with an admin grant would have spammed `client_errors`.
- `download-live.ts` did not exist: the real bindings, triggers, a 30 s headers timeout and a
  30 s body-stall watchdog (a quiet mobile link would otherwise hold the run lock forever).
- `payment-status.ts` had no tests and no polling: added `pollPayment` (bounded, < 3 min),
  `verified`-without-entitlement is terminal (`inconsistent`), kv failures can no longer throw.
  `refreshEntitlement` can no longer throw on a failed cache write.
- The sync store breadcrumbed every download chunk; now only a change of state.
- Screens, login `?next=`, settings row, launch wiring, e2e spec: all new.

Tests: 714 unit (web 500; +90 over the WIP's 410), incl. the hard cases — cut mid-body then
resumed by a fresh runner, cut twice, offline mid-body, ETag changed between attempts (with and
without the manifest caught up), hash mismatch then retry from 0, crash before and after the swap,
failed update swap keeps the old package, entitlement never downgraded by 401/5xx/503/junk.
`e2e/payment-gate.spec.ts` (3, real Edge, gated server): calm paywall/checkout, «بعداً» works,
anonymous checkout → login → back. lint, typecheck, test, build, budget (227.0 KB of 300 KB) all
exit 0; full e2e 20 passed, 12 skipped (screenshot recorder). Server untouched.

**For part B** (the journey): a second PocketBase with `SMS_PROVIDER=console`,
`ZARINPAL_PROVIDER=mock`, `ZARINPAL_CALLBACK_URL` = that server's `/api/pay/callback`,
`CONTENT_DIR=server/content`, `PUBLIC_APP_ORIGIN` = the preview origin. The contract the screens
expose (all in what.md §7.8's rows):
- Routes: `/paywall`, `/login?next=/checkout`, `/checkout`, `/purchase/result?status=…`,
  `/settings`.
- `data-testid`s: `paywall` (`data-state`), `paywall-buy`, `paywall-later`, `paywall-price`,
  `payment-soon`; `checkout` (`data-state`), `checkout-code`, `checkout-apply`,
  `checkout-code-status` (`data-code-status`), `checkout-payable`, `checkout-discount`,
  `checkout-pay`, `checkout-retry`, `checkout-later`; `purchase-result` (`data-state`),
  `purchase-entitled`, `purchase-download-status` (`data-state` = the download state, `installed`
  when done), `purchase-start-review`, `purchase-failed` (`data-reason`), `purchase-retry`,
  `purchase-check-again`; `settings-entitlement`, `settings-download-status` (`data-state`),
  `settings-download-retry`, `settings-buy`. The progress bar is `role="progressbar"`.
- kv: `pendingPayment` `{paymentId, userId, startedAt}` (written before the redirect, cleared on
  a terminal answer), `entitlement`, `downloadReceivedBytes` `{hash, version, bytes}` (absent
  once installed); the package lands in the `packages` table as `paid`.
- With the mock gateway, `pay/request` → `gatewayUrl` is our own callback, so the browser goes
  checkout → `/api/pay/callback` → 302 `/purchase/result?status=ok&ref=MOCK-…&paymentId=…`.

**Uncertain / not done:** the paid download has never run against the real Go `ServeContent`
in a browser (only the fakes and `rangeStartOf`'s parser) — part B's journey is the first real
proof; Playwright's `setOffline` mid-body is how to prove resume there. No component tests (the
repo has none; screens are pure machine + flow, rendering proven in e2e). The paywall's anonymous
`pay/quote` produces a 401 line in the server log per anonymous paywall view — by design.

### 2026-09-25 — part A, lead review fixes

1. `7a7b870` (lead): Caddy's `encode zstd gzip` rewrites the ETag to `"<hash>-gzip"`;
   `download.ts` `etagMatches()` accepts it.
2. `c2be4c2`: the entitlement cache is per account — `kv.entitlement = {byUser: {[userId]: …}}`,
   `none` when signed out or for another account, answers keyed by the account they were asked
   as, the loaded package follows sign-in/out without a reload, a legacy record belongs to nobody.
   what.md §7.3/§7.6/§16.2, how-why §5.16. For part B: a journey that signs out and in as another
   phone should now see the free package and no download; the same phone back sees paid, offline.
