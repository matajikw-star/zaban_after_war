# tools/

Scripts that are neither shipped to a user nor imported by the apps. Each is a TypeScript entry
point run by Node's type stripping (`node --experimental-strip-types`), so there is no build
step and no bundler here. Every one is registered as a root `pnpm` script.

| Script | Entry | Does | State |
|---|---|---|---|
| `pnpm simulate` | `tools/simulate/index.ts` | Runs a synthetic user through the engine and prints the schedule (what.md §5.7). | working |
| `pnpm errors` | `tools/errors/index.ts` | Groups `client_errors` into a ranked list and symbolicates a stack (§10.3). | working |
| `pnpm logs` | `tools/logs/index.ts` | Tails and filters the server's structured logs (§10.2, §10.3). | working |
| `pnpm flags` | `tools/flags/index.ts` | Lists and resolves user-submitted word flags (§10.3). | working |
| `pnpm run deploy` | `tools/deploy/index.ts` | Builds, ships and health-checks a release on the VPS (§14.4). | working (never yet run against the real VPS — the lead's first real deploy is still to do) |
| `pnpm run provision` | `tools/deploy/provision.ts` | One-time, as root: installs the verified PocketBase binary, its unit, `/opt/kl/.env` (from memory) and the real Caddyfile, and creates the superuser (§14.4). | working (never yet run against the real VPS) |
| `pnpm content:build` | `tools/content-build/index.ts` | Builds `free.json`, `paid.json` and the manifest (§6.2). | working |
| `pnpm budget` | `tools/budget/index.mjs` | Fails if the gzipped app shell exceeds 300 KB (ADR-0005, §16.2). | working |
| `pnpm e2e` | `apps/web` Playwright | Runs the Playwright suite against the built app (§16.2). | working |

A stub prints `<name>: not implemented` and exits 1, so a script that is wired but empty can
never be mistaken for one that succeeded.

`tools/lib/` holds what `errors`, `logs`, `flags` and `deploy` share: `.env.local` reading
(`env.ts`), a superuser PocketBase client (`pb.ts`), the `--since`/`--kind`/… flag parser
(`args.ts`), and sourcemap symbolication (`symbolicate.ts`, via the `source-map` package —
the one dependency this ticket added; see `how-why.md` §5, 2026-09-24).

**`deploy` must be run as `pnpm run deploy`.** Bare `pnpm deploy` is one of pnpm's own
subcommands and shadows the script; every other entry here works either way. Do not put `--`
before its arguments (`pnpm run deploy web`, not `pnpm run deploy -- web`) — this repo's pinned
pnpm (`12.3.4`) does not strip that separator for `run` (pnpm/pnpm#13295), so it would reach
`tools/deploy/args.ts` as a literal token and be rejected as an unknown flag.

`keepawake.py` belongs to the extraction pipeline, not to the application; see
`extraction/RUNBOOK.md`.

Credentials for the server-facing tools come from `.env.local` (`KL_API_ORIGIN`,
`KL_ADMIN_EMAIL`, `KL_ADMIN_PASSWORD`, plus `DEPLOY_HOST`/`DEPLOY_USER`/`DEPLOY_SSH_KEY_FILE`
for `deploy`) and never from source (what.md §18). Every `ssh` the deploy runs is
`ssh -o BatchMode=yes [-i <DEPLOY_SSH_KEY_FILE>]`, so it fails instead of prompting.

`--dry-run` always prints the plan and runs nothing. When a real run would be refused (dirty
tree, HEAD not at `origin/main` or `origin/<allow-branch>`), the dry run says so in a loud
warning first; the refusal itself only ever stops a real run.
