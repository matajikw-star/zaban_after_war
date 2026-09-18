# 02 — OTP request/verify with a provider interface

Status: ready-for-agent
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
