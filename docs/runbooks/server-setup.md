# Runbook — first-time server setup

Status: **in progress, 2026-09-18.** VPS bought (Parspack, `188.212.96.127`, Ubuntu). DNS is on
Parspack's nameservers (`ns1-4.parspack.co`); the apex currently points at Parspack's parking
IP `78.159.113.57`.

## 1. First login — the owner does this once

Parspack forces a root password change on the first login, and Claude Code is not allowed to
handle a new password, so this step is the owner's. In PowerShell:

```
ssh root@188.212.96.127
```

Type the password from the order e-mail, then the new password twice when asked (store it in
your password manager). Then paste this one line and press Enter — it installs your public key
so Claude can connect without any password afterwards:

```
mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo "$(cat <<'K'
PASTE_THE_CONTENT_OF_zsecrets\public-key-file.pub_HERE
K
)" >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && echo done && exit
```

(Simpler alternative, from a second PowerShell window on your machine:
`type C:\Users\asus\Desktop\zsecrets\public-key-file.pub | ssh root@188.212.96.127 "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"`
— it asks for the new password once.)

Check from Claude's side: `ssh -i ~/.ssh/kl_root.pem root@188.212.96.127 'echo ok'` prints `ok`.

## 2. DNS — the owner does this in the Parspack panel

The domain's nameservers are already Parspack's, so records are edited at
my.parspack.com → «دامنه‌ها» → `konkurleitner.com` → «مدیریت DNS» (DNS Management). Edit the
existing `A` record for `@` and add three more:

| نوع | نام (Host) | مقدار (Value) | TTL |
|---|---|---|---|
| A | `@` | `188.212.96.127` | 300 |
| A | `www` | `188.212.96.127` | 300 |
| A | `app` | `188.212.96.127` | 300 |
| A | `admin` | `188.212.96.127` | 300 |

Delete any other `A` or `CNAME` for `@`/`www` that points at `78.159.113.57`. Propagation is
minutes to an hour. Check: `nslookup app.konkurleitner.com` returns `188.212.96.127`.

## 3. Bootstrap — Claude runs this

```
scp -i ~/.ssh/kl_root.pem -r server/deploy root@188.212.96.127:/opt/kl/deploy
ssh -i ~/.ssh/kl_root.pem root@188.212.96.127 'bash /opt/kl/deploy/bootstrap.sh'
```

What it does (idempotent): packages and upgrades, `Asia/Tehran`, user `kl` with your key and a
narrow sudo, SSH keys-only, `ufw` 22/80/443, fail2ban, unattended upgrades, Caddy from the
official repo, the placeholder page on all three hostnames with automatic TLS.

Verify: `https://app.konkurleitner.com` shows the placeholder with a valid certificate. That is
the URL to give Kavenegar's support for the `kl-otp` template review.

## 4. After bootstrap

- Root password login is disabled; root with key still works until PocketBase is deployed,
  after which `PermitRootLogin no` is set (Phase 4).
- Everything else (PocketBase, real Caddyfile, deploy scripts) is Phase 4 of
  `docs/plan/implementation-plan.md`.
