# ADR-0001 — PocketBase on an Iranian VPS

**Status:** accepted · **Date:** 2026-09-10

## Context

The app needs: accounts, server-side backup of progress, entitlement checks, a Zarinpal payment
callback, and SMS OTP through an Iranian provider. Users are inside Iran. The owner is
cost-sensitive, wants open-source BaaS rather than a hand-built backend, and wants deployment
to stay simple enough to drive entirely from Claude Code.

v1 used Supabase Cloud's free tier and lost the entire backend to inactivity deletion, along
with every user account. Foreign SaaS also fails on sanctions (account suspension) and on
filtering (users cannot reach it reliably).

Two hard constraints rule out the cheapest shapes:

- **Zarinpal needs a callback URL that its servers reach and that we control**, and payment
  verification must run somewhere the client cannot forge. That is a server, not static hosting.
- **Iranian SMS providers expect requests from Iranian infrastructure**, and their API keys must
  never reach the browser.

So the question is not "server or shared host" — a persistent process is required. The question
is which backend runs on it.

## Decision

A single small **Iranian VPS** running **PocketBase**, fronted by **Caddy** for TLS.
PocketBase serves the API *and* the static PWA, so there is one process and one origin.

Custom behaviour (SMS OTP issuance, Zarinpal request + verify, entitlement-gated content chunks)
goes in PocketBase's JS hooks under `pb_hooks/`.

## Alternatives considered

| Option | Verdict |
|---|---|
| Supabase Cloud free tier | Rejected — deleted itself once already; sanctions; unreachable for the audience. |
| Self-hosted Supabase | Rejected — ~10 containers and 2 GB+ RAM to store one small event log per user. The ops cost buys nothing here. |
| Iranian shared host (PHP/static) | Rejected — no persistent process, so no payment verification and no OTP. |
| Custom Node/Hono + SQLite | Rejected for now — re-implements auth, admin UI, rules and backups. Reconsider only if PocketBase blocks something real. |
| Foreign VPS (Hetzner and similar) | Rejected — cheaper, but Iranian users reach it unreliably and Iranian payment/SMS APIs are hostile to foreign IPs. |

## Consequences

- One machine to secure, patch and monitor. Mitigated by keeping the surface tiny: Caddy,
  PocketBase, `ufw`, unattended upgrades, SSH keys only.
- SQLite means one node. Fine: the data is a few KB per user and traffic is a burst at login and
  a trickle at sync. Vertical scaling covers years of the realistic user count.
- Backups are the owner's responsibility now, which is the point — v1 had none. See
  `docs/plan/infrastructure.md` under "Backups".
- PocketBase's API changes between minor versions. Pin the binary version and read the changelog
  before upgrading; verify hook APIs against the installed version rather than from memory.
