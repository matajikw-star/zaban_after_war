# 05 — Service worker, updates, install, in-app browsers

Status: resolved
Type: task
Phase: 3
Blocked by: 01

## Goal

`docs/spec/what.md` §7.7 and the install paragraph of §7.8: precache (shell, fonts,
`content/free.json`), `registerType: 'prompt'` wired to the «نسخهٔ جدید آماده است — اعمال»
chip on home (applies on tap or next cold start, never mid-session), no runtime caching of
`/api/*`, `navigator.storage.persist()` result kept in the snapshot, storage estimate helper,
`beforeinstallprompt` captured → install sheet (end of onboarding and settings), in-app browser
detection (Telegram/Instagram UA) → «در Chrome باز کنید» with copy-link, iOS Share → Add to Home
Screen instruction, `manifest.webmanifest` complete (name from `VITE_APP_NAME`, icons, RTL).

## Done when

A Playwright spec builds the app, loads it, goes offline (`context.setOffline(true)`), reloads,
and the home screen still renders from the precache with the free package; the update flow is
unit-tested with a fake registration. Rows marked `live`.

## Comments

Finished a WIP commit (`d948360`) salvaged from an agent killed mid-task by the weekly rate
limit: `pwa/install.ts`, `pwa/update.ts`, `pwa/storage.ts`, `stores/pwa.ts` and
`screens/install/InstallSheet.tsx` already existed but had never been run — `pnpm typecheck`
failed on `Settings.tsx`'s mid-edit and nothing had been wired into `main.tsx` or `Home.tsx`.

Merged `origin/develop` first (ticket 02's onboarding landed there): the only conflict was the
usual `strings.ts` seam, both blocks kept. develop's `InstallStep.tsx` was deliberately left
message-only for this ticket to wire — connected it to the same `pwa/install.ts` state and the
shared `CopyLinkButton` (exported from `InstallSheet.tsx`) that settings' sheet uses, so the
per-context copy exists in exactly one place.

What was missing and is now done:

- `main.tsx`'s `bootstrap()` calls `registerServiceWorker()` as its first synchronous act (ahead
  of any `await`, so `beforeinstallprompt` is never missed), wrapped in try/catch that reports
  through `reportError('sw', …)` — a registration failure can never take the rest of the app
  down. `register.ts`'s `onRegisterError` callback also reports, for failures that surface
  asynchronously rather than by throwing.
- `Home.tsx`'s update chip now reads `stores/pwa.ts`'s `updateReady` (kept live by
  `pwa/update.ts`'s state machine) instead of a one-shot `kv` read taken once on mount, which
  never noticed an update arriving while the screen stayed open; tapping the chip calls
  `applyUpdate()` directly.
- `Settings.tsx`'s install row (mid-edit when the WIP died — `useEffect` imported but unused,
  `strings.settings.installComingSoon` no longer existed) now opens the real `InstallSheet`.
- `log/snapshot.ts`'s `swVersion` read `kv.swUpdateAvailable` (a boolean, forced into a
  `string | null` field) — that key only ever meant "an update is waiting," never "this version
  is installed," exactly the bug `pwa/storage.ts`'s own doc comment flagged. Switched to
  `controllingServiceWorkerUrl()`.
- `apps/web/package.json` gained `workbox-window` as a direct dependency. `vite-plugin-pwa`'s
  `virtual:pwa-register` module imports it, but as a transitive peer dependency of a
  `devDependency` it was not resolvable from `apps/web`'s own dependency graph under pnpm's
  strict `node_modules` — `pnpm build` failed with "Rolldown failed to resolve... workbox-window"
  the first time `register.ts` actually got bundled (nothing had imported it before this ticket).
- `vite.config.ts`'s `VitePWA` config was already correct against §7.7 (precache shell + fonts +
  `content/free.json`, `registerType: 'prompt'`, empty `runtimeCaching`, complete manifest) —
  verified against the built `dist/sw.js`'s precache manifest rather than changed.
- New `apps/web/e2e/offline.spec.ts`: seeds a profile, waits for `navigator.serviceWorker.ready`,
  reloads so the now-active worker actually controls the page, cuts the network with
  `context.setOffline(true)`, reloads again, and asserts Home renders with the free package's own
  word count (150) in the progress line — proof `content/free.json` itself came from the
  precache, not just the shell around it.

`docs/spec/what.md`: §7.7 flipped to `[live]`, the install paragraph under §7.8 flipped to
`[live]` (and now names Facebook alongside Telegram/Instagram, matching `install.ts`'s actual
patterns), the `/onboarding` and `/settings` rows' install notes updated, Home's update-chip note
updated to describe the real wiring instead of "wired in ticket 05".

`pnpm lint` / `typecheck` / `test` (399 unit) / `build` / `budget` (209.2 KB of 300 KB) /
`KL_E2E_CHANNEL=msedge pnpm e2e` (12/12, including the new offline spec) all pass.
