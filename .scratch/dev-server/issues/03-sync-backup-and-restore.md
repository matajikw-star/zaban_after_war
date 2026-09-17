# 03 — Sync push/pull, the backup state machine, login merge, restore

Status: ready-for-agent
Type: task
Phase: 4
Blocked by: 02

## Goal

Server: `POST /api/sync/push` (≤ 500 events, insert-ignore by id, `user` from auth, out-of-range
`at` flagged in logs) and `GET /api/sync/pull?since=&limit=` (cursor = `created` + id, paged)
per `docs/spec/what.md` §8.2 and §15.

Client: `sync/backup.ts` fully wired per §7.4 — triggers (start, `online`, session end, every
5 min, after login, manual), push then pull, outbox draining (each kind to its route; delete
on 2xx; drop with a breadcrumb on non-429 4xx), backoff 1/5/15 min then hourly, re-fold on new
pulled events, login merge (set all local `synced = 0`, push, pull), restore on a fresh device,
settings rows for backup status + manual backup, the «ذخیرهٔ پیشرفت با شمارهٔ موبایل» prompt
after 50 presentations. Never blocks the UI; never shows an error beyond
«پشتیبان‌گیری در انتظار اینترنت».

## Done when

API tests: push idempotency, pull paging, cross-user isolation; client machine tests with a
fake API and clock for every transition including 429 and offline; Playwright: study 10 →
login (mock code) → backup → new context → login → the 10 reviews are back. Marks `live`.
