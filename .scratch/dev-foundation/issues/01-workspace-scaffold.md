# 01 — Workspace scaffold for the application

Status: ready-for-agent
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
