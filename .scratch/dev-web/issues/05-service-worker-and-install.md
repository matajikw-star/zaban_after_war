# 05 — Service worker, updates, install, in-app browsers

Status: ready-for-agent
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
