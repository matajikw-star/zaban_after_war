# Runbook — deploying

For the agent or the owner. `tools/deploy` (what.md §14.4) is the only way a build reaches the
VPS; nobody edits files on the server by hand.

## Before you run it

- The working tree must be clean and `HEAD` must equal `origin/main` — the tool refuses
  otherwise. A staging deploy from another branch (`develop`, typically) needs
  `--allow-branch <branch>`, which swaps the comparison to `origin/<branch>` instead of
  `origin/main` (never the dirty-tree check) and prints a loud warning that this is not a `main`
  deploy. It is still a HEAD-equals-that-remote-ref check, not "what is this branch called
  locally" — a local branch literally named `develop` with commits `origin/develop` does not
  have is refused exactly like any other unpushed branch. Push first.
- `DEPLOY_HOST` and `DEPLOY_USER` (default `kl`) come from `.env.local` or the environment —
  never from source. `.env.example` documents both. `DEPLOY_SSH_KEY_FILE` (optional) is the
  private key file to use, e.g. `~/.ssh/kl_root.pem` (`~` is expanded; the same key works for
  `kl`, since bootstrap copied root's `authorized_keys`); without it ssh uses its own defaults.
- Every `ssh` runs with `-o BatchMode=yes`: a refused key, a passphrase prompt or an unknown
  host key fails the step instead of hanging the deploy. So connect once by hand first
  (`ssh -i ~/.ssh/kl_root.pem kl@$DEPLOY_HOST true`) so the host key is in `known_hosts`, and
  use a key without a passphrase or one already loaded in `ssh-agent`.
- The `kl` user is not root. It restarts PocketBase through the one NOPASSWD sudo rule
  bootstrap.sh gave it, as `sudo -n /bin/systemctl restart kl-pocketbase` — the path must match
  the sudoers line exactly, and `-n` makes a missing rule an error rather than a prompt.
- This machine has `ssh` and `tar` but no `rsync`, so every transfer is `tar | ssh … tar x`
  rather than rsync — what.md §14.4 said rsync originally; that line was corrected in the same
  commit that shipped this script (ticket dev-server/04).

## Running it

Bare `pnpm deploy` is shadowed by one of pnpm's own subcommands — always `pnpm run deploy`. On
this repo's pinned pnpm (`12.3.4`), `run` is one of pnpm's "specially escaped" commands
(pnpm/pnpm#13295): a `--` separator between `deploy` and the script's own arguments is **not**
stripped, and reaches the script as a literal `"--"` token, which `tools/deploy/args.ts` then
rejects as an unknown flag. Pass the target and flags straight after `deploy`, with no `--`:

```
pnpm run deploy web                              # one target
pnpm run deploy all                               # content, server, web, landing, admin, in order
pnpm run deploy server --dry-run                  # print every command, run nothing
pnpm run deploy all --allow-branch develop         # staging, loudly
```

Targets: `web`, `server`, `content`, `landing`, `admin`, `all`. `--dry-run` is always safe, on
any branch, on any tree: it runs nothing and always prints the plan. When a real run would be
refused — a dirty tree, or `HEAD` not at `origin/main` / `origin/<allow-branch>` — it prints
`DEPLOY WOULD BE REFUSED: <reason>` loudly first, then the plan, so a deploy can be previewed
from a branch that is ahead of its remote. The refusal still stops every real run. Without
`DEPLOY_HOST` set, a dry run prints `<DEPLOY_HOST unset>` in its place; a real run refuses.

## What each target does

- **`content`** — `pnpm content:build`, then ships `server/content/` (`paid.json` plus
  `manifest.json`) to `/opt/kl/content` — the server's `CONTENT_DIR`, where the content routes (`[planned]`, what.md §8.2)
  will read them. The free package does not go here; it ships with `web`.
- **`server`** — ships `pb_hooks/` and `pb_migrations/` to `/opt/kl/pb_hooks` and
  `/opt/kl/pb_migrations`, restarts `kl-pocketbase` with `sudo -n` (migrations run on start),
  then polls `/api/health` on the VPS itself. The restart refuses with `DEPLOY_NO_ENV` while
  `/opt/kl/.env` is missing: a restart also *starts* a stopped unit, and PocketBase must never
  come up without its env (run `pnpm run provision` first).
- **`web`** — runs `pnpm content:build` first (unless `content` is part of the same run and
  already did), because the free package `free.json` is not in git: `content:build` writes it
  to `apps/web/public/content/`, Vite copies it into `dist/content/free.json`, and PocketBase
  serves it from `pb_public` with the site. A dist without it fails the deploy
  (`DEPLOY_NO_FREE_PACKAGE`) instead of swapping in a site with no words. When `content/`
  changed, deploy `content web` together, so the free file and the manifest in
  `/opt/kl/content` describe the same build. Then it builds `apps/web`, ships everything
  except `*.map` to `/opt/kl/pb_public`
  (PocketBase serves this directly), and ships the `*.map` files separately to
  `/opt/kl/sourcemaps/<sha>/` — never into `pb_public`, so a client can never fetch its own
  source map. `tools/errors` reads them back through the superuser-only
  `GET /api/admin/sourcemap/:sha/:file`.
- **`landing`** / **`admin`** — build and ship to `/opt/kl/landing` / `/opt/kl/admin`.

Every live directory is written as `<dir>.new` first, then swapped in — an old copy is moved
aside, the new one is moved into place, and the old one is removed. Each `mv` is atomic; the
directory is briefly (milliseconds) either the old or the new one, never a mix, and never
missing. (A single `mv` cannot replace a populated directory in one step — `rename()` on Linux
refuses a non-empty target — which is why it is two renames rather than one.)

Every run appends one line to `/opt/kl/deploys.log` on the VPS (`sha, targets, who, when`) and
the same line to `wiki/log.md` in this repo (what.md §10.5) — commit that change along with
whatever the deploy shipped.

## After a `server` deploy

`pnpm run deploy server` already health-checks before returning (a 30s poll loop, not a single
racy request right after the restart — `DEPLOY_HEALTH_TIMEOUT` on the VPS-side output if it
never comes up). If it failed:

1. `pnpm logs --since 15m --route health` — did the process even come back up?
2. `ssh kl@$DEPLOY_HOST systemctl status kl-pocketbase` — a migration that fails on start leaves
   the old process down; `journalctl -u kl-pocketbase -n 100` has the reason.
3. Nothing here rolls back automatically. The previous `pb_hooks` / `pb_migrations` are gone (the
   swap already deleted `.prev`) — fix forward, or restore the last `/opt/kl/backups` snapshot
   per what.md §14.5 if a migration corrupted data.

## After a `web` deploy

Load `app.konkurleitner.com`, confirm the build sha in settings matches what you just shipped,
and that `pnpm errors --since 1h` shows no new fingerprint from that build within the hour (the
debug-from-log runbook's §5).

## First deploy (one time)

Status: **built, never run.** Nobody has run `provision` or a real `deploy` against the VPS —
what.md §14 marks both `[built, not yet deployed]`. Everything below is exercised only by
`--dry-run`, by `tools/deploy/*.test.ts`, and (for the binary download and the install kit's
tarball) locally; `server/deploy/install.sh` has been through `bash -n` but has never executed
on a Linux machine. The lead runs it, in this order, and each step is its own decision.

The VPS today (server-setup.md): bootstrapped — user `kl` with the narrow sudo, Caddy serving
the placeholder `Caddyfile.bootstrap` on all three hostnames with working TLS, `/opt/kl/*`
directories — and nothing of PocketBase.

### 0. Local prerequisites

In `.env.local` (git-ignored; names in `.env.example`):

```
DEPLOY_HOST=188.212.96.127
DEPLOY_SSH_KEY_FILE=~/.ssh/kl_root.pem
KL_ADMIN_EMAIL=<the owner's admin email>
KL_ADMIN_PASSWORD=<at least 20 characters — provision refuses a shorter one (what.md §15)>
```

plus whatever server secrets exist (`SMS_API_KEY`, `ZARINPAL_MERCHANT_ID`, …). Then make sure
both logins work without a prompt, which also puts the host key in `known_hosts` (every tool
ssh runs with `BatchMode=yes` and will not ask):

```
ssh -i ~/.ssh/kl_root.pem root@188.212.96.127 true
ssh -i ~/.ssh/kl_root.pem kl@188.212.96.127 true
```

### 1. Provision — `pnpm run provision`

```
pnpm run provision --dry-run                   # read it first: plan + env names, values masked
pnpm run provision                             # from main at origin/main
pnpm run provision --allow-branch develop      # or: staging, from develop at origin/develop
```

Same refusal as `deploy` (clean tree, `HEAD` at `origin/main` or `origin/<allow-branch>`), and
the same `--dry-run` preview. What it does (`tools/deploy/provision.ts`; the plan is
`provision-plan.ts`):

1. **Locally**: downloads `pocketbase_<POCKETBASE_VERSION>_linux_amd64.zip` and the release's
   `checksums.txt` from GitHub (the VPS may not reach github.com), and accepts the zip only if
   its sha256 equals both the `checksums.txt` entry and the pin in `server/POCKETBASE_SHA256`
   (`PB_CHECKSUM_MISMATCH` otherwise; nothing is shipped). Extracts `pocketbase` into
   `server/.pb/linux_amd64/` (git-ignored, reused next time) with a `pocketbase.sha256` line.
   Also builds `/opt/kl/.env` **in memory** from `.env.example`'s VPS / PocketBase names — see
   below — and validates the superuser credentials. Any problem refuses before connecting.
2. As **root**: ships the kit (binary, its sha256, `POCKETBASE_VERSION`, `server/Caddyfile`,
   `server/systemd/kl-pocketbase.service`, `server/deploy/install.sh`, `superuser.sh`) to
   `/root/kl-provision` (mode 700 — a script root runs never sits in a directory `kl` can write).
3. Streams the env over ssh into `install -m 600 -o kl -g kl /dev/stdin /opt/kl/.env.new`. It
   is never written to a local file and never printed.
4. Runs `install.sh` (idempotent — re-running changes only what differs): re-checks the
   binary's sha256 and `--version`; installs `/opt/kl/pocketbase` (owner `kl`, 755) via a
   rename; installs the unit, `daemon-reload`, `enable` (at boot) — **does not start it**;
   swaps `.env.new` into `/opt/kl/.env` (600, `kl`) if it differs; restarts PocketBase only if
   it was already running and its binary, unit or env changed; validates the real Caddyfile
   with `caddy validate` **before** touching `/etc/caddy/Caddyfile`, keeps the old one as
   `Caddyfile.prev`, reloads Caddy, and puts the old one back if the reload fails.
5. Runs `superuser.sh`: reads the email and password from stdin and runs `pocketbase superuser
   upsert … --dir /opt/kl/pb_data` as `kl`. **Residual exposure**, stated rather than hidden:
   PocketBase's CLI takes the credentials only as arguments, so for the second the upsert runs
   they are in its argv, visible to root and `kl` via `ps` on the VPS. They are in no shell
   history (a non-interactive ssh command is not recorded), not on the local command line,
   and not in any file.
6. Removes `/root/kl-provision`; appends to `/opt/kl/deploys.log` and `wiki/log.md`.

**The env it writes.** Exactly the names under `# --- VPS / PocketBase` in `.env.example`. A
value comes from, in order: a **staging override fixed in code** — `SMS_PROVIDER=mock`,
`ZARINPAL_SANDBOX=1` (there is no flag to change them: shipping `kavenegar` from this step is
impossible, and no real money may move while any phone can sign in with `123456`) — then
`.env.local`/the environment, then the non-secret default `.env.example` documents. A name
with none is left out, and the server warns about it at boot (`lib/env.js`). It refuses a
value with a quote, backslash, control character or surrounding whitespace (systemd's
`EnvironmentFile` would misread it), and refuses if `PUBLIC_APP_ORIGIN`, `CONTENT_DIR` or
`SOURCEMAP_DIR` end up without a value. Moving to real SMS later is a deliberate edit to
`STAGING_OVERRIDES` in `tools/deploy/server-env.ts`, in its own reviewed commit.

After provisioning, Caddy runs the real Caddyfile, so the placeholder is gone and
`app.konkurleitner.com` answers 502 until PocketBase starts in the next step — run it straight
away.

### 2. Deploy everything — `pnpm run deploy all`

```
pnpm run deploy all --dry-run
pnpm run deploy all                            # or --allow-branch develop for staging
```

Its `server` step's `sudo -n /bin/systemctl restart kl-pocketbase` is what first **starts**
PocketBase, which applies every migration (the collections, the trusted proxy, the rate limits)
and loads the hooks. It refuses with `DEPLOY_NO_ENV` if step 1 did not leave `/opt/kl/.env`.

### 3. Verify

```
curl -sS https://app.konkurleitner.com/api/health
#   {"ok":true,"version":"0.40.2+hooks.<n>","time":…} — over HTTPS, through Caddy
curl -s -o /dev/null -w '%{http_code}\n' https://app.konkurleitner.com/_/                # 404: no admin UI on the app origin
curl -s -o /dev/null -w '%{http_code}\n' https://admin.konkurleitner.com/_/              # 200: the admin UI lives here only
curl -s -o /dev/null -w '%{http_code}\n' https://app.konkurleitner.com/content/free.json # 200
ssh -i ~/.ssh/kl_root.pem kl@188.212.96.127 systemctl status kl-pocketbase --no-pager
```

Then log in to `https://admin.konkurleitner.com/_/` with `KL_ADMIN_EMAIL`; check that Settings
→ Rate limits shows the four rules of what.md §8.2, and that `pnpm logs --since 15m` shows the
boot's `env.problem … SMS_PROVIDER=mock on a production origin` warning — expected in staging,
and the reminder that every phone signs in with `123456` until the owner switches to real SMS.

### 4. Close root login — separate and deliberate

server-setup.md §4: root with a key stays allowed until PocketBase is deployed. Once step 3
passes, and only after confirming `kl` can log in (step 0):

```
ssh -i ~/.ssh/kl_root.pem root@188.212.96.127 \
  "sed -i 's/^PermitRootLogin .*/PermitRootLogin no/' /etc/ssh/sshd_config.d/10-kl.conf && sshd -t && systemctl reload ssh"
ssh -o BatchMode=yes -i ~/.ssh/kl_root.pem root@188.212.96.127 true   # must now fail
ssh -o BatchMode=yes -i ~/.ssh/kl_root.pem kl@188.212.96.127 true     # must still work
```

What this costs: `pnpm run provision` needs root, so it cannot run again afterwards. A new
PocketBase version, a change to the unit or the Caddyfile, or a change to `/opt/kl/.env` then
needs root back for the duration — through Parspack's web console — and the same `provision`
run. `kl`'s sudo covers only restarting, reloading and the status of the two services.

Not part of this: nightly backups (§14.5) and the health/disk timer (§14.6) are still planned.
