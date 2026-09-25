# 02 — Scope cut: one global sale instead of discount codes; admin deferred; APK after real payment

Status: ready-for-agent
Type: task
Phase: 5 (revisits dev-payment/01) and plan
Decided: by the owner, 2026-09-24; go given 2026-09-25 ("check first, then cut")
Depends on: dev-foundation/04 (the spec check, which must pass on this PR)

## Why

The owner asked why v2 grew so much larger than v1. The answer: mostly reliability that v1 lacked,
which stays. What goes is unbuilt or barely used surface that has no users yet. Priority is
reliability.

## What

1. **Discount codes → one global sale.** The owner sets a single percentage in PocketBase admin;
   every buyer sees it until it is turned off. No codes, no fixed-amount type.
   - Server: a **new** migration (never edit the applied `1758000000_init.js`) that drops
     `discount_codes`, removes any code fields from other collections that exist only for codes,
     and adds the sale percent to `app_config`. Validation: an integer 0–99 (100 % would make the
     product free for everyone; a free grant goes through `/api/admin/grant`). `pay/quote` and
     `pay/start` take no code; the price is the list price minus the sale, computed on the server
     only (entitlement and price are server-side, ADR-0004). The 100 %-code grant path goes.
     `server/test/` updated (migrations test, pay route tests).
   - Client: `/checkout` loses the code field and the grant path; it shows the list price, and when
     a sale is on, the sale price and percent. `net/api.ts` types follow. The e2e purchase journey
     sets the sale in `app_config` in its setup instead of creating a code; the 100 %-code spec is
     removed. The `kv.pendingPayment` write for grants (added 2026-09-25) goes with the grant path.
   - `apps/web/src/ui/Input.tsx`'s comment about codes.
2. **Admin dashboard deferred.** `apps/admin` stays a placeholder; the `admin.` origin stays (it
   hosts the PocketBase `/_/` UI), so Caddyfile and deploy are unchanged. what.md §11.2 marked
   deferred; `.scratch/dev-admin/issues/01-…` updated (landing part stays).
3. **Landing: one simple static page** (it already is; make the docs say so).
4. **APK ordering:** web stable → real payment and real SMS tested → first Android build. what.md
   §13 and `.scratch/dev-android/issues/01-twa-apk.md` say so.

## Docs

Normative, edit in place: `docs/spec/what.md` (§8.1 collections, §8.2 routes, §11.2, §13, and any
mention of codes), `CONTEXT.md`, `CLAUDE.md` (the Stack line "Zarinpal + discount codes"),
`docs/plan/implementation-plan.md`, tickets dev-payment/01 (a pointer comment), dev-admin/01,
dev-android/01, `wiki/market-and-pricing.md`.
History, append only: a new ADR superseding ADR-0018 and the ordering part of ADR-0015, plus a
"Superseded by" line on 0018 (and a partial note on 0015); a dated `docs/spec/how-why.md` §5 entry;
one `wiki/log.md` line. After editing, `grep -rniE "discount code|admin dashboard"` over docs and
code: every remaining hit is historical or deliberate.

## Done when

- `pnpm spec:check` passes (it compares §8.1/§8.2 with the migrations and routes).
- lint, typecheck, `pnpm test`, `pnpm test:server`, build, budget, e2e (msedge locally; the payment
  journey 10/10 at `--repeat-each=10`) green; CI green without retries.
- On staging (mock SMS) every pay route still answers 503 `PAYMENT_DISABLED_MOCK_SMS`.

## Comments
