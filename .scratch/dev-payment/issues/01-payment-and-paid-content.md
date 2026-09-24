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
