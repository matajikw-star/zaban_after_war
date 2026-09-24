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

## The first real deploy

Nobody has run this against the real VPS yet — what.md marks it "built, not yet deployed". The
lead does that first run; everything above is otherwise exercised by `--dry-run` and by
`tools/deploy`'s own unit tests (`tools/deploy/*.test.ts`) for the argument parsing and the
refusal rules.
