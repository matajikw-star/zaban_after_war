# Runbook — fixing a bug from a log record

For the agent. The owner will say "there is a bug" or "a user reported X"; this is what to do.
The log is the bug report; do not ask the owner to reproduce.

## 1. Get the records

```
pnpm errors --since 24h --group          # fingerprints by count, newest first
pnpm errors --since 24h --fingerprint <f>  # every record for one fingerprint, symbolicated
pnpm errors --since 7d --user 0912...      # everything from one user's devices
pnpm logs --since 24h --level error        # server side
pnpm flags --since 7d                      # word flags grouped by word
```

Credentials come from `.env.local` (`KL_API_ORIGIN`, `KL_ADMIN_EMAIL`, `KL_ADMIN_PASSWORD`).

## 2. Read one record top to bottom

1. `kind` and `message` — what failed.
2. Symbolicated `stack` — where. If frames are unresolved, the source maps for that `buildSha`
   are missing on the server: check `/opt/kl/sourcemaps/<sha>/` and the deploy log.
3. `breadcrumbs` — the last 50 things the app did, in order. The failure is usually the last
   `net` or state-machine transition before the error.
4. `snapshot` — the engine's inputs. `lastEvents` (20) plus `packageVersions` let you re-run the
   fold locally; `syncState` / `downloadState` tell you which machine was mid-flight;
   `storage` shows quota problems; `online` and `standalone` / `twa` tell you the environment.
5. `appVersion` / `buildSha` — confirm the user was on the current build; an old build's bug
   may already be fixed.

## 3. Reproduce

- Engine bugs: paste `lastEvents` into a `packages/core` test with the same `params` and the
  package's `rank`/`weight` for those ids; assert the expected state.
- State-machine bugs: replay the breadcrumb sequence against the machine with the fake API in
  `apps/web/src/sync/*.test.ts`.
- UI bugs: Playwright with the same viewport and `standalone` mode; use the breadcrumb `nav`
  entries as the route sequence.
- Server bugs: `pnpm logs --route <name>` around the same timestamp; the `input` attribute is
  redacted but the shape is intact.

## 4. Fix

Ticket under `.scratch/fix-<slug>/issues/01-*.md`, branch `fix/<slug>`, the regression test
first, then the fix, then `what.md` if any contract changed, then a PR.

## 5. Verify after deploy

`pnpm errors --since 1h --fingerprint <f>` must show no new records from the new `buildSha`
within a day. If the same fingerprint reappears from the new build, the fix was wrong; reopen.

## 6. If the record is a `user_report`

Read `userNote`, then treat the snapshot as above. Reply is not possible (no channel by design);
if the report reveals a content defect, fix the content and ship a content deploy.
