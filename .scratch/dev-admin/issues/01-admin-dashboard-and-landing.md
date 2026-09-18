# 01 — Admin dashboard and landing page

Status: ready-for-agent
Type: task
Phase: 6
Blocked by: dev-payment/01

## Goal

`apps/admin` per `docs/spec/what.md` §11.2: superuser login (PocketBase auth), four pages
(Overview, Reports, Errors with symbolicated view + export, Users with «Grant access»), data
from `GET /api/admin/stats?range=` (new route, superuser only) and PocketBase list calls.
English UI, tokens from `packages/design`.

`apps/landing` per §12: the one page, real numbers from the content manifest (word count,
years), the boxes picture, price with the launch discount, «نصب نسخهٔ وب», «دانلود اپ اندروید»
(→ `/downloads/konkurleitner-<version>.apk`), support link, privacy line, in-app browser
detection, `www` redirect (Caddy).

## Done when

The owner reads sales and errors on `admin.konkurleitner.com`; the landing page is live on the
apex with the APK link. §11.2 and §12 `live`.
