# Runbook — first-time server setup

Status: **done, 2026-09-18.** VPS bootstrapped (Parspack, `188.212.96.127`, Ubuntu 24.04). All
three hostnames (`konkurleitner.com`, `app.`, `admin.`) serve the placeholder over HTTPS with a
real Let's Encrypt certificate, verified from the server itself. `www` redirects to the apex.
Two problems hit and fixed along the way, recorded here so they are not re-discovered:

1. **DNS is not on `ns1-4.parspack.co`.** Parspack's domain-management page has no zone editor;
   the actual DNS product is their **CDN service** (free "ساده" plan), which runs on its own
   nameservers (`hail.parspack.net` / `star.parspack.net`) that must be set via «تنظیم نیم سرور
   اختصاصی» → «تغییر نیم سرورها» — a *different* page from the CDN product itself. Every A
   record has a proxy toggle («فقط DNS» vs «پروکسی»); it must stay on **«فقط DNS»** for all four
   records (`@`, `www`, `app`, `admin` → `188.212.96.127`), otherwise Caddy's own TLS breaks.
2. **ZeroSSL (Caddy's other default ACME issuer) returned a malformed, non-JSON response** when
   tested from this VPS — plausibly filtered from an Iranian IP. Fixed by pinning
   `acme_ca https://acme-v02.api.letsencrypt.org/directory` in the global Caddy block, which
   `server/deploy/Caddyfile.bootstrap` now does unconditionally. Let's Encrypt alone works.

## 1. First login — the owner does this once

Parspack forces a root password change on the first login, and Claude Code is not allowed to
handle a new password, so this step is the owner's. In PowerShell:

```
ssh root@188.212.96.127
```

Type the password from the order e-mail, then the new password twice when asked (store it in
your password manager), then type `exit`. Still in PowerShell, run this one line — it installs
your public key so Claude can connect without any password from then on (it asks for the new
password once):

```
type C:\Users\asus\Desktop\zsecrets\public-key-file.pub | ssh root@188.212.96.127 "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys && echo done"
```

Check from Claude's side: `ssh -i ~/.ssh/kl_root.pem root@188.212.96.127 'echo ok'` prints `ok`.

## 2. DNS — done, via Parspack's CDN product

Not the domain-settings page — that has no zone editor. The path that actually worked:

1. Parspack panel → the domain's **CDN** product → plan **«ساده»** (free, 50 GB/month, plenty).
2. Inside it, «ایجاد DNS جدید» → four `A` records, all with the proxy toggle left on **«فقط
   DNS»** (never «پروکسی» — a proxied record would break Caddy's own TLS):
   `@`, `www`, `app`, `admin`, each → `188.212.96.127`. The pre-existing `@`/`www`/`*` records
   pointing at the old parking IP (`78.159.113.57`) were deleted.
3. Separately, back in the domain page → «نیم سرورها» → «تغییر نیم سرورها»: NS1/NS2 set to
   `hail.parspack.net` / `star.parspack.net` (the CDN product's own nameservers — *not*
   `ns1-4.parspack.co`, which is a different, unrelated zone that the CDN panel does not write
   to). This is the step that actually delegates the domain to the records from step 2.

Verified from Google (`8.8.8.8`), Cloudflare (`1.1.1.1`), Quad9 (`9.9.9.9`) and the zone's own
authoritative servers — all agree. (`ns1.parspack.co` itself still answers with stale data
indefinitely; it is no longer authoritative for this domain, so that is expected and harmless.)

## 3. Bootstrap — done

```
scp -i ~/.ssh/kl_root.pem -r server/deploy root@188.212.96.127:/opt/kl/deploy
ssh -i ~/.ssh/kl_root.pem root@188.212.96.127 'bash /opt/kl/deploy/bootstrap.sh'
```

What it does (idempotent): packages and upgrades, `Asia/Tehran`, user `kl` with your key and a
narrow sudo, SSH keys-only, `ufw` 22/80/443, fail2ban, unattended upgrades, Caddy from the
official repo, the placeholder page on all three hostnames with automatic TLS.

Verified: `https://app.konkurleitner.com`, the apex, and `admin.konkurleitner.com` all return
`200` with a valid Let's Encrypt certificate (expires 2026-12-16, Caddy auto-renews). That is
the URL to give Kavenegar's support for the `kl-otp` template review.

## 4. After bootstrap

- Root password login is disabled; root with key still works until PocketBase is deployed,
  after which `PermitRootLogin no` is set (Phase 4).
- Everything else (PocketBase, real Caddyfile, deploy scripts) is Phase 4 of
  `docs/plan/implementation-plan.md`.
- Re-running `server/deploy/bootstrap.sh` at any point is safe (idempotent); it will not touch
  DNS or the ACME issuer setting since those live in `Caddyfile.bootstrap`, not the script.
