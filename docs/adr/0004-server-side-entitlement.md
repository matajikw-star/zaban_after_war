# ADR-0004 — Entitlement is server-side; no client banning

**Status:** accepted; "chunks" amended to two packages by ADR-0016, entitlement `source` added per product-brief D11 (2026-09-17) · **Date:** 2026-09-10

## Context

v1 shipped the entire 1.6 MB lexicon and every hint into the JS bundle for every visitor, then
tried to enforce the paywall in the UI, backed by `useSecurityCheck`, which set `is_banned = true`
on any non-premium account whose progress exceeded the free tier.

The content was already fully readable by anyone who opened devtools, so the ban punished only
users who had paid nothing *and* copied nothing — while a sync race could permanently lock out a
paying customer. See `docs/postmortem-v1.md` §5.

## Decision

1. The lexicon is split into **chunks**. The free-tier slice is its own chunk; the rest are
   fetched from the server only for an account the server considers entitled.
2. **The server decides entitlement**, from a payment record it verified with Zarinpal itself.
   The client caches the answer for offline use but never authors it.
3. Fetched chunks are cached in IndexedDB, so a paid user stays fully offline-capable after the
   first sync.
4. **Automatic banning is removed.** No client-reported state triggers an irreversible penalty.
   Abuse, if it appears, is met with rate-limited fetches and the owner acting on evidence.

## Consequences

- A paid user's device does hold the content. That is unavoidable for an offline app and it is
  the right trade: the goal is to stop *unpaid* distribution, not to attempt DRM.
- Study requires having fetched at least one chunk while online. First run needs connectivity;
  everything after it does not.
- Choosing the free-tier slice becomes a product decision with revenue consequences, not a
  constant in a config file. Tracked as an open question in `wiki/index.md`.
- Payment verification is the one flow that is never optimistic: entitlement flips only after a
  server-side verify call to Zarinpal succeeds.
