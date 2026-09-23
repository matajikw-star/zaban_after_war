# 02 — OTP request/verify with a provider interface

Status: resolved
Type: task
Phase: 4
Blocked by: 01

## Goal

`POST /api/otp/request` and `POST /api/otp/verify` per `docs/spec/what.md` §8.2 and §15:
E.164 normalisation of Iranian numbers (`09xx…` → `+989xx…`), 5-digit code hashed at rest in
`otp_codes`, 3-minute expiry, 5 attempts, limits 3/phone/10 min and 10/IP/hour, find-or-create
the user by phone, return PocketBase's auth response, token duration 365 days.

SMS providers behind one interface in `server/pb_hooks/lib/sms.js`, selected by
`SMS_PROVIDER`:

- `kavenegar` — Verify Lookup with `SMS_API_KEY` and `SMS_OTP_TEMPLATE` (built in full).
- `console` — prints the code to the log (CI, tests).
- `mock` — **the code is always `123456`**; nothing is sent. The owner's SMS account cannot
  send to anyone but the owner until identity verification, so this is what the staging
  deploy runs until then. The route logs `sms.provider=mock` so it is visible.

Cron: purge expired `otp_codes` hourly.

Client: `/login` screen (§7.8) with the state machine `enterPhone → sending → enterCode →
verifying → done` and the three error states; on success store `userId` + token in `kv`
(§7.2), then run the login merge (ticket 03). «قبلاً حساب داشتم» from onboarding lands here.

## Done when

API tests: happy path with `console`, wrong code ×5 → locked, rate limit → 429 with
`retryAfter`, `mock` provider accepts `123456` only; the client machine is unit-tested with a
fake API; Playwright: login with the mock code against a real PocketBase. Marks `live`.

## Comments

### 2026-09-24 — probe first, then build

The probe (808fdc2) ran against the pinned 0.40.2 binary before any route was written; every
answer is in how-why §5.7 and the probe file is deleted. Three answers changed the design:
`$apis.recordAuthResponse` writes its own body and keeps running (a following `e.json` appended a
second JSON object), so verify builds `{token, record}` itself with `record.newAuthToken()`; a
filter date must be `YYYY-MM-DD HH:MM:SS.sssZ` — an ISO `T` string silently matched nothing, which
would have left the rate limits never tripping; and `e.realIP()` is Caddy's `127.0.0.1` for
everyone until `trustedProxy` is set (new migration `1758700000_trusted_proxy.js`).

Server: `pb_hooks/otp.pb.js` (both routes), `lib/phone.js`, `lib/sms.js` (kavenegar / console /
mock), `lib/otp.js` (numbers, hashing, limits, burn, purge), `cron.pb.js` (`otp_purge`). New
error codes `PHONE_INVALID`, `OTP_WRONG` (+`attemptsLeft`), `OTP_EXPIRED`, `OTP_LOCKED`,
`SMS_FAILED`, `SMS_PROVIDER_UNKNOWN`; `AppError` gained a 5th `pub` argument for the fields a
client may see, and `withRoute` sets `Retry-After` whenever one of them is `retryAfter`.

Decisions taken here:
- A used code is burnt (attempts = 5, expiresAt = now), not deleted — deleting would hand the
  phone its rate-limit slot back. A replay answers `OTP_EXPIRED`.
- The purge deletes rows expired more than an hour ago, not at expiry, for the same reason: the
  IP window is an hour.
- A failed SMS send keeps its row, so a failing gateway cannot be used to dodge the limit.
- An attempt is spent atomically (`UPDATE … WHERE attempts < 5`) before the compare.
- `retryAfter` on a successful request is 0 unless that request used the phone's last slot.
- No code requested, expired, or used → all `OTP_EXPIRED`: verify never distinguishes "no such
  account" from anything else.
- `mock` on the production origin is allowed (staging) but warned at every boot.
- After login: home if a local profile exists, else `/onboarding`. Restoring the profile from the
  server is ticket 03's merge; `sync/login-merge.ts` `runLoginMerge` is the no-op it fills in.
- `login_done` beacon not sent yet — left for ticket 04 with the beacon route.

Tests: 36 new API tests (`server/test/otp.test.ts`, 64 total), 41 client unit tests
(`machine.test.ts`, `flow.test.ts`, one in `api.test.ts`), 3 Playwright specs in
`e2e/login.spec.ts` against a real PocketBase on 8091 (15 e2e total).
