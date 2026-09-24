# Runbook — deploying

For the agent or the owner. `tools/deploy` (what.md §14.4) is the only way a build reaches the
VPS; nobody edits files on the server by hand.

## Before you run it

- The working tree must be clean and `HEAD` must equal `origin/main` — the tool refuses
  otherwise. A staging deploy from another branch (`develop`, typically) needs
  `--allow-branch <branch>`, which lifts only the branch check, never the dirty-tree one, and
  prints a loud warning that this is not a `main` deploy.
- `DEPLOY_HOST` and `DEPLOY_USER` (default `kl`) come from `.env.local` or the environment —
  never from source. `.env.example` documents both.
- This machine has `ssh` and `tar` but no `rsync`, so every transfer is `tar | ssh … tar x`
  rather than rsync — what.md §14.4 said rsync originally; that line was corrected in the same
  commit that shipped this script (ticket dev-server/04).

## Running it

Bare `pnpm deploy` is shadowed by one of pnpm's own subcommands — always `pnpm run deploy`:

```
pnpm run deploy -- web                              # one target
pnpm run deploy -- all                               # content, server, web, landing, admin, in order
pnpm run deploy -- server --dry-run                  # print every command, run nothing
pnpm run deploy -- all --allow-branch develop         # staging, loudly
```

Targets: `web`, `server`, `content`, `landing`, `admin`, `all`. `--dry-run` is always safe, on
any branch, on any tree — use it first when unsure what a deploy will do.

## What each target does

- **`content`** — `pnpm content:build`, then ships `server/content/` (the paid package plus the
  manifest) to `/opt/kl/content`.
- **`server`** — ships `pb_hooks/` and `pb_migrations/` to `/opt/kl/pb_hooks` and
  `/opt/kl/pb_migrations`, restarts `kl-pocketbase` (migrations run on start), then
  `curl`s `/api/health` on the VPS itself.
- **`web`** — builds `apps/web`, ships everything except `*.map` to `/opt/kl/pb_public`
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

`pnpm run deploy -- server` already health-checks before returning. If it failed:

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
