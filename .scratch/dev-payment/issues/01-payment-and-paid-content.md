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
