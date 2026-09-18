# 01 — App shell: routing, stores, Dexie, repo, engine adapters, logging, UI primitives

Status: resolved
Type: task
Phase: 3

## Goal

Everything in `docs/spec/what.md` §7.1–7.3 and §10.1 that every screen depends on, with no
screens yet beyond placeholders. After this ticket a screen is a file that reads stores and
calls `repo`/`net` functions.

## Deliverables (`apps/web/src/`)

- `routes.tsx` — one flat `createBrowserRouter` table with every route of §7.8, each pointing
  at a placeholder screen file under `screens/<name>/<Name>.tsx` that renders its title from
  `strings.ts`. A root layout with the error boundary and the theme attribute.
- `db/dexie.ts` (schema §7.3, version 1) and `db/repo.ts` (typed reads/writes; the only file
  that imports Dexie): `appendEvent`, `allEvents`, `unsyncedEvents`, `markSynced`, `insertPulled`,
  `outbox*`, `getPackage/putPackage`, `kv.get/set`.
- `engine/clock.ts` (`now()` — the only `Date.now()` in the app; injectable for tests),
  `engine/rng.ts`, `engine/fold-cache.ts` (holds the current `Fold`, re-folds on append),
  `engine/index.ts` re-exporting `@kl/core` functions bound to the cache. Components never
  import `@kl/core` directly (§17.6).
- `stores/` (zustand): `settings.ts` (theme, profile: minutes/goal/examDate/fieldCode),
  `content.ts` (active package, `items`, `byId`, loads `free.json` from the precache on start),
  `session.ts` (current card, recent ids, presentations today, session counters),
  `auth.ts` (installId, userId, token, entitlement — read from `kv`), `sync.ts` (backup and
  download machine states, mirrored for the UI). Every action records a breadcrumb.
- `log/breadcrumbs.ts` (ring of 50), `log/errors.ts` (capture from `window.onerror`,
  `unhandledrejection`, the React boundary, SW messages; `reportError(kind, err, data)`;
  builds the §10.1 record; queues it in `outbox`), `log/snapshot.ts`.
- `net/api.ts` — typed `fetch` wrappers for every route in §8.2 (the server does not exist yet;
  the types are the contract), each logging a breadcrumb and mapping HTTP errors to
  `AppError` codes. `net/pocketbase.ts` is not needed: the app talks to our routes only.
- `AppError` in `errors.ts` (§17.4).
- `strings.ts` grows with every key used. `version.ts` exists.
- `ui/` — shadcn-style primitives on `radix-ui`, styled with the tokens and the glass look
  (ADR-0020): `Button` (variants: primary, secondary, ghost, success, danger; sizes with a 44 px
  minimum), `Card` (glass), `Sheet` (bottom), `Dialog`, `Progress` (ring and bar), `Tabs`,
  `Disclosure` (collapsible), `Chip`, `Switch`, `Input`. Persian digits helper `faNumber()` in
  `ui/format.ts`.
- Theme: `data-theme` on `<html>` from settings (`system` | `light` | `dark`).
- Tests (Vitest, `happy-dom` or `fake-indexeddb` for Dexie): repo round-trips, fold cache
  re-folds on append, breadcrumb ring caps at 50, error record shape, `faNumber`.

## Done when

`pnpm dev` shows the placeholder home; every route renders; `pnpm test` covers the above;
`what.md` §7.1–7.3 marked `live`, §7.8 `building`.

## Comments

**2026-09-18 — resolved.** `apps/web/src` now holds the whole shell: `routes.tsx` (one flat
`createBrowserRouter` table with all thirteen routes of §7.8 plus a not-found, inside a root
layout that owns the theme attribute, the React error boundary and a `nav` breadcrumb per route
change), `db/dexie.ts` (schema version 1 exactly as §7.3) and `db/repo.ts` (the only importer of
Dexie), the engine adapters (`clock.ts`, `rng.ts`, `fold-cache.ts` and `index.ts`, whose bound
functions are the only way a component reaches `@kl/core`), five zustand stores, the three
logging files, `net/api.ts` with one typed function per §8.2 route, the two state machines, and
eleven UI primitives on `radix-ui` with the tokens and the glass look.

243 unit tests (232 existing + the app's own, across eight files): repo round-trips, the fold
cache re-folding on `recordReview`, the breadcrumb ring capping at 50, the §10.1 record carrying
every field, both `transition()` tables in full (backup 4 x 5, download 6 x 8), `faNumber` /
`faPercent`, the `AppError` mapping against a mocked `fetch`, and the content store including
the dev-fixture fallback. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm budget`
(146.7 KB gzipped of 300 KB) and `KL_E2E_CHANNEL=msedge pnpm e2e` all pass.

No runtime dependency was added. Two devDependencies of `apps/web` were: `happy-dom` 20.14.5 and
`fake-indexeddb` 6.2.5, recorded in `how-why.md` §5.3. The root `vitest.config.ts` is now a
two-project configuration so one `pnpm test` covers `packages/*` (node) and `apps/web`
(happy-dom).

Decisions the spec left open are in `how-why.md` §5.4. The three that change behaviour: a
missing content package is reported and not fatal, so the shell still works without one; a
git-ignored `free.json` falls back to a twelve-word dev fixture behind `import.meta.env.DEV`;
and `net/pocketbase.ts` was dropped from §7.1 because the app calls only our own routes.
