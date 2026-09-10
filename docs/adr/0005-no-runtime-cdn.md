# ADR-0005 — Everything is bundled and self-hosted

**Status:** accepted · **Date:** 2026-09-10

## Context

v1 loaded React, Supabase, Tailwind and heroicons from `aistudiocdn.com`, `jsdelivr`,
`cdn.tailwindcss.com` and `unpkg.com` at runtime. For an audience behind filtering, on an app
that advertises offline use, this is the worst possible dependency shape: first paint requires
four foreign hosts, any of which may be blocked, and none of which we control.

## Decision

Every dependency is a build-time dependency, resolved by the bundler and served from our own
origin. This covers scripts, styles, icons (as tree-shaken components), and **fonts** — the
Persian face (Vazirmatn) is self-hosted with a real system fallback stack.

The service worker precaches the app shell, so a repeat visit renders with the network off.

Analytics, error reporting, and embeds are held to the same rule: anything that phones a
third-party host at runtime does not ship.

## Consequences

- The bundle is larger than v1's near-empty one. Correct trade — a slightly slower first load
  beats a blank page. Budget: app shell under 300 KB gzipped, checked in CI.
- Upgrading a dependency requires a rebuild and redeploy, which is the desired behaviour: the
  deployed app stops changing under us.
- Content chunks are the deliberate exception to "no runtime fetches" — they come from our own
  origin, are entitlement-gated (ADR-0004), and are cached after first fetch.
