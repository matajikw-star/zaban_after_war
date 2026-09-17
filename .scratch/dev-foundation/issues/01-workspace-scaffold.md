# 01 — Workspace scaffold for the application

Status: resolved
Type: task
Phase: 1

## Goal

Create the empty-but-wired packages from `docs/spec/what.md` §3 so every later ticket has a
home: `apps/web` (Vite + React + TS + Tailwind v4 + vite-plugin-pwa, RTL html, `strings.ts`,
`version.ts` injection), `apps/landing` (Vite static), `apps/admin` (Vite + React),
`packages/design` (neutral `tokens.css` until the design system is chosen; Vazirmatn self-hosted
with a fallback stack), `android/` (README only until Phase 6), `server/` (README listing the
planned files), `tools/` scripts registered in root `package.json` (`simulate`, `errors`,
`logs`, `flags`, `deploy`, `content:build`, `e2e`) as stubs that print "not implemented".

CI: add the `e2e` job skeleton (downloads the pinned PocketBase binary from
`server/POCKETBASE_VERSION`; runs a placeholder Playwright test). Bundle-budget check step
(300 KB gzipped app shell, ADR-0005).

## Done when

`pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` all pass; `apps/web`
serves a blank RTL page with the app name from `VITE_APP_NAME`; `what.md` §3 marks flipped to
`building`.

## Watch out

- Every dependency added gets one line in `docs/spec/how-why.md` §4 or a new dated section.
- No CDN, no runtime font loading from Google — fonts are files in `packages/design`.
- Do not touch `content/` or `extraction/`.

## Comments

**2026-09-18 — done.** `apps/web` (Vite 8 + React 19 + Tailwind v4 + vite-plugin-pwa, RTL shell,
`strings.ts` / `version.ts`, the eight §7.1 folders), `apps/landing` (static, «به‌زودی»),
`apps/admin` (React placeholder), `packages/design` (`tokens.css`, `fonts.css`, Vazirmatn
v33.003 400/500/700 + OFL), `android/README.md`, a rewritten `server/README.md` plus
`server/POCKETBASE_VERSION` = `0.40.2`, six `tools/` stubs and a working `tools/budget`, the CI
`Budget` step and the new `e2e` job. `pnpm install / lint / typecheck / test / build / budget /
e2e` all pass; the shell serves `dir="rtl"` with the app name from `VITE_APP_NAME`.

Deviations, all recorded in `docs/spec/how-why.md` §5.1–5.2:

- **Playwright's browser download is blocked from Iran** (`cdn.playwright.dev` → 403). CI is
  unaffected; locally `KL_E2E_CHANNEL=msedge pnpm e2e` drives the installed Chromium. The
  smoke test passes that way.
- Apps are **not `composite`**, so root `typecheck` is `tsc --build --force` for the packages
  then `pnpm -r --if-present typecheck` for the apps.
- `%VITE_APP_NAME%` is substituted by a small Vite plugin rather than Vite's own mechanism,
  because Vite only substitutes variables that are set and the name is still unset (§19).
  `apps/landing` repeats the fallback literal; setting `VITE_APP_NAME` retires both copies.
- Biome needed `css.parser.tailwindDirectives` (for `@theme`) and `!.claude` in `files.includes`
  (a nested agent worktree read as a second root configuration). No source was bent to the linter.
- The icon is a hand-written monochrome SVG; the 192/512 and maskable PNGs were rendered with
  the Pillow already installed for the extraction pipeline, so no new dependency.
- `PocketBase 0.40.4` was the latest upstream tag; `0.40.2` was pinned as the ticket asked and
  verified to exist.
