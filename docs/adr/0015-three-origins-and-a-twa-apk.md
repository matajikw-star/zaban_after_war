# ADR-0015 — Three origins (landing, app, admin) and a TWA-built APK at launch

**Status:** accepted · **Date:** 2026-09-17 · Refines D6 in `docs/plan/product-brief.md`.

## Context

The owner wants the app off the root domain, a landing page on the root, an install prompt on
phones, and an Android APK if it can be had cheaply. Service-worker scope, IndexedDB and Android
Digital Asset Links are all bound to an origin, and the PocketBase admin UI must not be
reachable where users are.

## Decision

- `konkurleitner.com` — static landing page, APK downloads. `www` redirects to it.
- `app.konkurleitner.com` — the PWA and its API on one origin (no CORS, no cookies); the
  PocketBase admin path is blocked here.
- `admin.konkurleitner.com` — the owner's dashboard and the PocketBase admin UI.
- `bazaar.konkurleitner.com` — reserved for the phase-two store build.
- The APK is a **Trusted Web Activity** built with Bubblewrap from the same PWA, signed with a
  key the owner keeps, built by CI, and offered as a direct download from the landing page at
  launch. Fallback to Custom Tabs on devices without Chrome.

## Alternatives

Paths on one origin (rejected: shared SW scope and storage, admin exposed). Capacitor
(rejected: every release is an APK release, a second test surface). Native (rejected: cost, and
a second codebase to keep correct).

## Consequences

- Three Caddy sites, one PocketBase; the deploy scripts have three static targets.
- Asset links must be served from the app origin and updated if the signing key changes.
- Losing the keystore means a new package id; it is stored in two places from day one.
