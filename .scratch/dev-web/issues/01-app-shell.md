# 01 — App shell: routing, stores, Dexie, repo, engine adapters, logging, UI primitives

Status: ready-for-agent
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
