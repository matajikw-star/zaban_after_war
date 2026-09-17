# Owner checklist — what to buy, what to set up, what to hand over

Everything only the owner can do before and during the build. Do the items in order; each says
what Claude needs back from it. Record actual prices and dates in `wiki/log.md` when done.

Persian terms are given where you will meet them in an Iranian panel.

## A. Buy

### A1. VPS at Parspack — «سرور مجازی»

- Plan: **VPS2 — 1 vCPU, 2 GB RAM, 40 GB SSD**, location **Iran** («ایران»), monthly billing.
  PocketBase and Caddy together idle under 200 MB; this tier serves thousands of users, and
  Parspack resizes in place («ارتقا») if it ever does not. VPS1 (1 GB) would also run it but
  leaves no headroom for the nightly backup job.
- OS image: **Ubuntu 24.04 LTS** (64-bit). Nothing pre-installed (no cPanel, no Docker image).
- Traffic: unlimited domestic («ترافیک داخلی نامحدود») is enough; international traffic is
  only used by deploys and TLS issuance.
- At purchase: choose a **root password** and, if offered, paste an SSH public key (Claude will
  generate one for you in Phase 4 if not).
- Hand over: the **IP address** and the **root password** (from the order e-mail or the panel's
  «مشخصات سرور»). Put them in `.env.local` as `VPS_IP=` and `VPS_ROOT_PASSWORD=`. Claude connects
  over SSH from your machine, creates the `kl` user with a key, disables password login and
  never uses root again; you can then change or forget the root password.

### A2. SMS panel at Kavenegar — «پنل پیامک»

- Sign up at kavenegar.com as an individual («حقیقی») with your national ID; identity
  verification («احراز هویت») is required before any SMS is sent.
- **Ignore «وب‌پوش» (web push)** — that page is for browser notifications, which the product
  does not use, and its `<script>` snippet must never be added to the site (ADR-0005).
- No dedicated line is needed: OTPs go through **Verify Lookup** (sidebar «اعتبارسنجی»). Create a
  template («الگو») named `kl-otp` with exactly this text and submit it for approval:

  ```
  کد ورود شما به %token% است. این کد ۳ دقیقه اعتبار دارد.
  ```

  (If they require the app name in the text, use the placeholder name for now; the template is
  edited once the Persian name is chosen.)
- Hand over: the **API key** (user menu at the top → account settings → «API Key»; it is a long
  hex string, not the web-push `appId`), and the approved **template name**. Put them in
  `.env.local` as `SMS_API_KEY=` and `SMS_OTP_TEMPLATE=kl-otp`.
- Credit: the 550,000 rial (55,000 toman) already on the account covers a few hundred OTPs —
  enough for beta; top up before launch.

Fallback if Kavenegar rejects the account or approval stalls beyond a week: SMS.ir with its
«ارسال سریع» template. Claude's code talks to one interface; the swap is one file.

### A3. Zarinpal — already active

- In the merchant panel, make sure the registered website is `konkurleitner.com` and the
  merchant is in «درگاه مستقیم» mode.
- Merchant ID: **received 2026-09-17** and stored in `.env.local`. Amounts: the v4 API takes an
  explicit `currency` of `IRT` (toman), so no panel setting matters; Claude still verifies with
  one real 1,000-toman payment in Phase 5.
- Enable the **sandbox** («محیط تست») if the panel offers it; otherwise Claude uses Zarinpal's
  public sandbox merchant.

### A4. Domain DNS — `konkurleitner.com`

- Claude cannot click through a registrar's web panel, so DNS goes one of two ways:
  - **Option 1, Claude does it (preferred):** sign up at ArvanCloud (panel.arvancloud.ir, free,
    needs one-time identity verification), add the domain under «DNS ابری», and set the two
    nameservers it shows at your registrar. Then create an API key («کلید API» in the profile
    menu) and put it in `.env.local` as `ARVAN_API_KEY=`. Claude creates and maintains every
    record from then on.
  - **Option 2, you add four records:** in the registrar's DNS panel add `A` records `@`, `www`,
    `app`, `admin` → the VPS IP, TTL 300, when Claude gives you the IP.
- Either way, tell Claude where the domain is registered.

### A5. Backup storage — S3-compatible, a few GB

- Parspack «فضای ابری / Object Storage» if they sell it; otherwise ArvanCloud «فضای ابری» (free
  tier is enough). Create one bucket named `kl-backups`.
- Hand over: endpoint URL, bucket name, access key, secret key.

### A6. Not needed now

Cafe Bazaar developer account (phase two, 40,000 toman/year), the ارشاد digital-content
identifier (Bazaar only), a Google Play account (never), an Apple developer account (never),
a foreign VPS or CDN (never).

## B. Decide

- **Design system** — pick one from the list given on 2026-09-17 (Geist, Linear, Apple HIG,
  Material 3, Sonnat, Untitled UI) and a Persian font (Vazirmatn / Estedad free; Dana / Yekan
  Bakh paid — buy a web licence if you choose a paid one). Claude then builds one mockup screen
  for a yes/no.
- **Persian app name** — deferred; needed before the SMS template is final, before the APK is
  built, and before launch. One constant changes everywhere.
- **Support contact** — a Telegram username or channel link shown in settings and on the
  landing page.
- **Beta testers** — 10–20 real candidates you can reach in Phase 7.

## C. Hand over to Claude (Phase 4 start)

Put these in the git-ignored `.env.local` on your machine; Claude reads them from there and
copies the server-side ones to `/opt/kl/.env` on the VPS. Never paste secrets into chat if the
file works.

| Item | Where it goes |
|---|---|
| VPS IP, root password or SSH key | used once for bootstrap, then the `kl` deploy key replaces it |
| Kavenegar API key + template name | `SMS_API_KEY`, `SMS_OTP_TEMPLATE` (server) |
| Zarinpal merchant id | `ZARINPAL_MERCHANT_ID` (server) |
| S3 endpoint, bucket, key, secret | `BACKUP_S3_*` (server) |
| Registrar / DNS login, or the four A records added | — |
| GitHub: repo admin already exists | Claude adds `DEPLOY_*` and `ANDROID_*` secrets |
| Superuser email + password for PocketBase (you choose, ≥ 20 chars) | `KL_ADMIN_EMAIL`, `KL_ADMIN_PASSWORD` (local tools) |

Claude generates and hands back to you: the SSH deploy key pair, the **Android signing keystore
and its password** (store both in a password manager — losing the keystore means a new app
identity forever), and the PocketBase backup encryption key if enabled.

## D. Recurring duties after launch

- Weekly: run `pnpm backup:pull` (copies the newest server backup to your disk).
- Monthly: ask Claude to run the restore drill and log it.
- Daily for the first two weeks: open `admin.konkurleitner.com` and look at errors and reports.
- Whenever a refund is agreed: refund in the Zarinpal panel, then delete the entitlement row in
  the PocketBase admin (procedure in `docs/runbooks/`).
