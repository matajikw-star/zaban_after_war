# 05 — Follow-ups from the first staging deploy

Status: open
Type: bug
Phase: 4
Blocked by: 04

## Goal

The first staging deploy (2026-09-24, `4c6a9ef`, `pnpm run provision` then `pnpm run deploy all`)
succeeded — health, TLS, admin-only `/_/`, mock OTP round trip all verified over HTTPS. Watching
it run found five defects in the tooling, none blocking. Fix them the boring way.

1. **`/opt/kl/deploys.log` records the literal text `$(date -u +%Y-%m-%dT%H:%M:%SZ)`** instead of
   the time: `logStep` (tools/deploy/plan.ts) and provision's record step put the `\$(…)` inside
   single quotes on the remote side, so it never expands. Both lines on the VPS today read
   `4c6a9ef provision Amin $(date …)` / `4c6a9ef content,server,web,landing,admin Amin $(date …)`.
   Fix and unit-test that the remote command expands the date (e.g. assert the quoting shape).
2. **PocketBase restarts itself mid-deploy.** The journal shows `File /opt/kl/pb_hooks/lib changed,
   restarting...` right after the pb_hooks swap — before pb_migrations ship — so new hooks briefly
   run against old migrations. Add `--hooksWatch=false` to `ExecStart` in
   `server/systemd/kl-pocketbase.service` (verify the flag name against the 0.40.2 binary's
   `serve --help`); the deploy's own restart is the only restart.
3. **`kl` cannot read `journalctl -u kl-pocketbase`** ("not seeing messages from other users and
   the system") though the runbook assumes it can. Add `kl` to the `systemd-journal` group in
   `server/deploy/bootstrap.sh` (idempotent) — and in `install.sh` too, since bootstrap already ran.
4. **The tools dirty their own tree.** `provision` and `deploy` append to `wiki/log.md` after a
   real run, so `provision` followed by `deploy` is refused (dirty tree) and the run leaves an
   uncommitted file behind. Stop writing `wiki/log.md` from the tools: print the line to paste
   instead (the lead commits it). Update runbook/what.md wording that says the tool appends it.
5. **`superuser.sh` warns `Failed to retrieve the current working directory: stat .: permission
   denied`** — `runuser -u kl` inherits `/root` as cwd. `cd /` before it.

Also: the web build fails with "The system cannot find the path specified (os error 3)" when the
repo is checked out under a long path (e.g. the Claude scratchpad under `AppData\Local\Temp\…`) —
Windows MAX_PATH. Add one line to `docs/runbooks/deploy.md`: run deploys from a short path
(`.claude/worktrees/kl-deploy` at `origin/main` worked).

Docs: `what.md` §14.1, §14.2, §14.4 and the provision paragraph flip from `[built, not yet
deployed]` to `[live]` (staging, `SMS_PROVIDER=mock`), since the deploy has happened; describe
the fixes above where they change behaviour.

## Done when

The five fixes land with unit tests where the code is pure; `bash -n` + shellcheck on changed
scripts; every check green; `what.md` marks flipped. Re-running provision + deploy on the VPS is
the lead's job afterwards (it applies 2, 3 and 5 and proves 1 and 4).

## Comments
