# 05 — Follow-ups from the first staging deploy

Status: resolved
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

Fixed all five, plus the MAX_PATH runbook line and the four doc flips. Never connected to the
VPS; every real command was `--dry-run` or executed against a local stand-in.

1. **Date never expanded.** `plan.ts` gained `logAppendRemoteCommand(fields)`, which returns
   plain (unescaped) shell text: `echo <shellQuote(fields+' ')>"$(date -u …)" >>
   /opt/kl/deploys.log` — the fields are single-quoted, the date sits in its own double-quoted
   word concatenated with no space (POSIX joins adjacent quoted words), so only the *last* shell
   to parse the text performs the substitution. The caller (`logStep`, and
   `buildProvisionPlan`'s log step) wraps that whole string in one more `shellQuote(...)` instead
   of a bare `"…"` — a first attempt that wrapped it in literal double quotes turned out to be
   locally exploitable: bash's double-quote parsing does not treat a *nested* single quote as a
   quote character, so a `$`, backtick or `"` inside `who` (git `user.name`, arbitrary) would
   have expanded on the *local* machine, one shell parse before ssh ever saw it — same class of
   bug as the date, just at the other layer, and the reason `shellQuote` is applied recursively
   rather than a hand-escaped `\"`/`\$` pair. New `tools/deploy/log-append.test.ts` proves both
   properties empirically, not just by string shape: `ssh` is shadowed by a shell function in the
   same `bash -c` invocation `run.ts`'s `runPlan` actually uses, capturing the literal string the
   real `ssh` binary would send to the VPS; that string is then executed a second time, against a
   throwaway file, standing in for the remote shell. Four cases: date expands only there (not
   locally), a plain run produces a real timestamp, a `who` payload with `$(touch pwned)`,
   backticks, quotes and a `;` never executes and lands as inert text in the log line, and a
   plain apostrophe (`O'Brien`) round-trips intact. 27 deploy-plan tests total (was 23); also
   updated provision-plan.test.ts's date assertion to the new (still-escaped, now correctly so)
   shape.
2. **hooksWatch.** Downloaded the real Windows 0.40.2 binary (`pnpm --filter @kl/server
   pb:download`) and read `serve --help`: the flag is `--hooksWatch` (default `true`, "no effect
   on Windows" — consistent with it firing on this VPS's Linux). Added `--hooksWatch=false \` to
   `ExecStart` in `server/systemd/kl-pocketbase.service`, with a comment explaining why (the
   `pb_hooks`-before-`pb_migrations` ordering in `plan.ts`'s `serverSteps`).
3. **systemd-journal.** Added `usermod -aG systemd-journal "$KL_USER"` to `bootstrap.sh` (next to
   the existing `-aG sudo` line) and, since bootstrap already ran on the VPS, the same line to
   `install.sh` too (its own idempotent step, run before the binary/unit work).
4. **wiki/log.md.** Removed `run.ts`'s `appendWikiLog` entirely; `index.ts` and `provision.ts`
   now print `wiki/log.md line: <the line>` after a real run instead of writing the file. Updated
   `docs/runbooks/deploy.md` (the "every run appends… and the same line to wiki/log.md" sentence,
   and provision step 6) and `what.md` §10.5 and the §14.4 target list to match — the tool no
   longer touches this repo's own tree.
5. **superuser.sh cwd.** Added `cd /` immediately before the `runuser` line, with a comment on
   why (`/root` is unreadable by `kl`, which is what `runuser` was inheriting and warning about).

Docs: `what.md` §14.1, §14.2, §14.4 and the provision paragraph flipped to `[live]` (staging,
`SMS_PROVIDER=mock`), each describing the relevant fix above; `docs/runbooks/deploy.md`'s "First
deploy (one time)" status updated from "built, never run" to done (2026-09-24, `4c6a9ef`), one
line added on running deploys from a short path (Windows `MAX_PATH`, `os error 3` on `web`'s
build under a long checkout — this session hit it under the Claude scratchpad path and moved to
this worktree instead).

Verified (every command run alone, exit code read directly, none piped through grep/tail in a
way that hides it): `pnpm lint` (biome, clean), `pnpm typecheck` (tsc --build, all packages),
`pnpm test` (569 passed, 51 files, including the 4 new log-append tests and the updated
plan/provision-plan suites), `pnpm test:server` (115 passed, 7 files), `pnpm build` (web+admin+landing),
`pnpm budget` (215.9 KB of 300 KB — unchanged, this ticket touched no client code). `bash -n` and
shellcheck 0.11.0 (found under this session's own scratch dir, per the ticket's fallback) both
clean on all three changed scripts (bootstrap.sh, install.sh, superuser.sh) — no shellcheck
warnings at all. `pnpm run deploy server --dry-run --allow-branch fix/deploy-follow-ups`
confirmed the fixed log line and left `sudo -n /bin/systemctl restart kl-pocketbase` unchanged:

```
# server: restart kl-pocketbase
ssh -o BatchMode=yes kl@<DEPLOY_HOST unset> "test -f /opt/kl/.env || { echo 'DEPLOY_NO_ENV: /opt/kl/.env is missing - run pnpm run provision first' >&2; exit 1; }; sudo -n /bin/systemctl restart kl-pocketbase"

# record: append /opt/kl/deploys.log
ssh -o BatchMode=yes kl@<DEPLOY_HOST unset> 'echo '\''a23fae2 server Amin '\''"$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> /opt/kl/deploys.log'
```

Not verified (deliberately, per "never connect to the VPS"): the real `--hooksWatch=false`
against the actual Linux binary, the real `systemd-journal` group grant, and the real
`superuser.sh` cwd fix — all three need the lead's re-run of `provision` on the VPS, exactly as
the ticket's "Done when" says. e2e not run — no `apps/` code touched.
