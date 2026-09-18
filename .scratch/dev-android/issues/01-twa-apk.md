# 01 — Android APK (TWA) built in CI

Status: ready-for-agent
Type: task
Phase: 6

## Goal

`android/` per `docs/spec/what.md` §13: a Bubblewrap project (`twa-manifest.json`,
`applicationId com.konkurleitner.app`, host `app.konkurleitner.com`, portrait, splash from the
icon, `fallbackType: customtabs`), `apps/web/public/.well-known/assetlinks.json` with the
signing key's SHA-256, a GitHub Actions `android` job (manual `workflow_dispatch` and `v*`
tags: JDK 17, Android SDK, `bubblewrap build` non-interactively with the keystore from
`ANDROID_KEYSTORE_B64` / `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_ALIAS`), uploading
`konkurleitner-<version>.apk` as a workflow artifact and a GitHub Release asset, and copying
it to `/opt/kl/landing/downloads/` when the deploy key is available.

Keystore: generated once by the builder (`keytool`), handed to the owner (password manager),
stored as GitHub secrets. Never in git.

## Done when

The `android` workflow produces an APK the owner downloads from the Actions run and installs;
it opens `app.konkurleitner.com` full-screen (asset links verified — no browser bar). §13 `live`.
