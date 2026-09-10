# Infrastructure

Answers the owner's question — *server, or is a simple host enough?* — and then specifies exactly
what to buy, install, deploy and back up.

## The short answer

**A simple host is not enough. Buy one small Iranian VPS.** Not because the app is heavy — it is
about as light as a real app gets — but because three things require code running on a machine
we control:

1. **Zarinpal verification.** The payment callback must be verified server-to-server before
   entitlement flips. A client that grants its own premium is v1's placeholder bug (`is_premium`
   flipped by a button), and it is the difference between a business and a demo.
2. **SMS OTP.** The SMS provider's API key cannot be in the browser, and Iranian SMS panels
   expect Iranian-origin requests.
3. **Entitlement-gated content.** ADR-0004 requires the paid chunks to be withheld from unpaid
   clients — a decision only a server can make.

Static hosting could serve the PWA. It could not do any of the three. Splitting them (static host
+ separate API server) means paying for and maintaining two things, so one VPS serving both is
strictly simpler.

The data itself is tiny — a few KB per user — so the *smallest* VPS tier is genuinely enough.
This is a "cheap server, not no server" situation.

## Target architecture

```
                    konkourleitner.com
                            │
                  ArvanCloud DNS + CDN (free tier)
                            │  caches the static PWA, hides origin IP
                            ▼
      ┌──────────────── Iranian VPS ────────────────┐
      │  Caddy  :443  ── automatic TLS               │
      │    ├── /            → static PWA (pb_public) │
      │    ├── /api/*       → PocketBase              │
      │    └── /pay/verify  → PocketBase hook         │
      │                                               │
      │  PocketBase (systemd, pinned version)         │
      │    ├── collections: users, review_events,     │
      │    │   payments, entitlements, chunks         │
      │    └── pb_hooks/: otp, zarinpal, chunk-gate   │
      │                                               │
      │  pb_data/  ← SQLite + uploads = ALL state     │
      └───────────────────────────────────────────────┘
                            │  nightly
                            ▼
              Object storage (S3-compatible) + weekly local copy
```

One process, one origin, one directory to back up.

## What to buy

| Item | Spec | Notes |
|---|---|---|
| VPS | 1–2 vCPU, 2 GB RAM, 25–40 GB SSD, Iranian datacenter | 2 GB is comfortable; 1 GB would work but leaves no headroom for builds or a stray backup job. |
| OS | Ubuntu LTS | Whatever the provider's current LTS image is. |
| DNS / CDN | ArvanCloud free plan | Iranian CDN, so the static assets are served from inside the country. Requires Iranian identity verification. |
| Object storage | S3-compatible, a few GB | For nightly `pb_data` backups. PocketBase can push these itself. |
| Domain | `konkourleitner.com` — already owned | Point nameservers at ArvanCloud. |
| SMS | Kavenegar / SMS.ir / Ghasedak | Pay per message. Compare per-SMS price *and* OTP-pattern approval speed — the pattern approval is the slow part. |
| Payment | Zarinpal merchant | Requires an Iranian business/identity record. **Start this first — it is the longest lead time in the whole plan.** |

Candidate Iranian VPS providers to price up: ArvanCloud, Parspack, IranServer, MabnaHost,
Hetzner-equivalent local options. The owner already had a Parspack relationship in v1.

### Cost

Iranian hosting prices move constantly, so treat these as *shape*, not quotes — verify at
purchase time and record actuals in `wiki/log.md`:

| Line | Order of magnitude |
|---|---|
| VPS (2 GB) | the single largest recurring cost; low hundreds of thousands of Toman per month |
| ArvanCloud DNS/CDN | free tier |
| Object storage | negligible at this data size |
| Domain renewal | roughly $10/year |
| SMS | per-message; the only cost that scales with signups, and the only one abusable — rate-limit OTP requests per phone and per IP from day one |
| Zarinpal | a percentage per transaction |

Total recurring spend is dominated by one VPS. That is the whole point of this architecture.

## Deployment

Constitutional rule: everything ships through Git. See `docs/plan/roadmap.md` M0 for the repo
setup itself.

**Frontend** — GitHub Actions on push to `main`:

1. `pnpm install --frozen-lockfile`
2. `pnpm test` and `pnpm build` (fail the deploy on either)
3. Check the bundle budget from ADR-0005
4. `rsync` `apps/web/dist/` to `/opt/pocketbase/pb_public/` over SSH, using a deploy key stored
   as a GitHub secret

No FTP and no password in CI — v1 used both.

**Backend** — PocketBase is a pinned binary plus `pb_hooks/` and `pb_migrations/` from this repo.
Same workflow, separate job: rsync the hooks and migrations, then `systemctl restart pocketbase`.
Migrations are files in the repo, so schema changes are reviewable in a diff.

**If GitHub Actions cannot reach the VPS** (some Iranian providers block foreign inbound SSH),
fall back to a pull-based deploy: Actions publishes a build artifact to a GitHub Release; a small
timer on the VPS fetches and unpacks the newest release. Same Git discipline, reversed direction.
Decide this by testing SSH from an Actions runner during M0, not by guessing.

## Backups

v1 lost every user account because nobody owned this. The rules:

- **Nightly**: PocketBase's own backup to S3-compatible object storage. Keep 14 dailies.
- **Weekly**: the owner downloads one backup to a local disk. A backup nobody has ever restored
  is a rumour.
- **Monthly**: actually restore the newest backup into a scratch PocketBase and log in. Record
  the result in `wiki/log.md`. This is the step everyone skips and the only one that proves the
  rest works.
- Before any schema migration or PocketBase upgrade: a manual backup first.

`pb_data/` is the entire state of the business. Nothing else on the VPS needs backing up, because
everything else is rebuildable from this repo — which is exactly why the repo is constitutional.

## Security baseline

Small surface, kept small:

- SSH keys only, password auth disabled, root login disabled.
- `ufw`: 22, 80, 443. Nothing else.
- Unattended security upgrades on.
- PocketBase admin UI behind a strong password and, ideally, an IP allowlist in Caddy.
- Every secret (SMS key, Zarinpal merchant id, S3 credentials) in the systemd unit's environment
  or an `.env` readable only by the service user. `.env.example` documents the names.
- Rate-limit OTP send, OTP verify, and chunk fetch. These are the three endpoints that cost real
  money or leak real value when abused.

## Open questions

- Does a Zarinpal merchant account exist, and under whose identity? Blocks all of M5.
- Which SMS provider, and how long does OTP pattern approval take? Blocks M4.
- Expected user count in year one — the input to whether 2 GB is the right tier.
