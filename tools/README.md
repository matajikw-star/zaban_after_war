# tools/

Scripts that are neither shipped to a user nor imported by the apps. Each is a TypeScript entry
point run by Node's type stripping (`node --experimental-strip-types`), so there is no build
step and no bundler here. Every one is registered as a root `pnpm` script.

| Script | Entry | Does | State |
|---|---|---|---|
| `pnpm simulate` | `tools/simulate/index.ts` | Runs a synthetic user through the engine and prints the schedule (what.md §5.7). | working |
| `pnpm errors` | `tools/errors/index.ts` | Groups `client_errors` into a ranked list and symbolicates a stack (§10.3). | stub |
| `pnpm logs` | `tools/logs/index.ts` | Tails and filters the server's structured logs by request id (§10.2). | stub |
| `pnpm flags` | `tools/flags/index.ts` | Lists and resolves user-submitted word flags (§10.3). | stub |
| `pnpm run deploy` | `tools/deploy/index.ts` | Builds, ships and health-checks a release on the VPS (§14.4). | stub |
| `pnpm content:build` | `tools/content-build/index.ts` | Builds `free.json`, `paid.json` and the manifest (§6.2). | stub |
| `pnpm budget` | `tools/budget/index.mjs` | Fails if the gzipped app shell exceeds 300 KB (ADR-0005, §16.2). | working |
| `pnpm e2e` | `apps/web` Playwright | Runs the Playwright suite against the built app (§16.2). | working (smoke only) |

A stub prints `<name>: not implemented` and exits 1, so a script that is wired but empty can
never be mistaken for one that succeeded.

**`deploy` must be run as `pnpm run deploy`.** Bare `pnpm deploy` is one of pnpm's own
subcommands and shadows the script; every other entry here works either way.

`keepawake.py` belongs to the extraction pipeline, not to the application; see
`extraction/RUNBOOK.md`.

Credentials for the server-facing tools come from `.env.local` (`KL_API_ORIGIN`,
`KL_ADMIN_EMAIL`, `KL_ADMIN_PASSWORD`) and never from source (what.md §18).
