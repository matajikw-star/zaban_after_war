# 03 — Sync push/pull, the backup state machine, login merge, restore

Status: resolved
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

## Comments

Resolved on `feat/server-sync` (2026-09-24).

Server: `pb_hooks/sync.pb.js` + `lib/sync.js`. Push is raw `INSERT OR IGNORE` by id in one
transaction, `user` from the token only. The pull cursor is `"<created>|<id>"`, and it is only
safe because every push stamps its rows with one `created` strictly greater than anything the user
already has (`max(now, previous + 1 ms)`, inside the write transaction) — without that, two pushes
in the same millisecond or a server clock step could hide an event behind a cursor forever
(how-why §5.8). `withRoute` gained `maxBodyBytes` (push takes 256 KB; 500 events do not fit 32 KB).

Client: `sync/backup.ts` (machine + `createBackupRunner(deps)`, every effect injected),
`sync/backup-live.ts` (real deps, triggers, `OUTBOX_ROUTES_LIVE`), `sync/login-merge.ts`,
`engine/fold-cache.ts` `mergeIntoFold`, `repo.insertPulled` (now transactional, returns the new
events) and `repo.markAllUnsynced`, the settings backup row, the 50-presentation prompt
(`engine/save-progress-prompt.ts`, `screens/review/SaveProgressSheet.tsx`).

Decisions taken here:
- One malformed event rejects the whole push (`BAD_INPUT`, `events[i]`); skipping it would let
  the client mark it synced and lose it. It stays local; the 5th failure files a `sync` report.
- An id owned by another user counts as a duplicate and is logged `id_conflict`, never an error.
- `RETRY` removed from the machine: a retry is `START` from `error`, so the ladder climbs (the
  skeleton's `error → RETRY → idle` reset the count and never left 1 minute).
- Backoff gate `mayRunNow`: manual/online/login jump it; nothing jumps a 429; after a 401 only
  login/manual retry. Settings shows a quiet re-login line for a 401.
- A trigger during a run is queued (latest wins) and runs once after it.
- The login merge fires the backup and does not await it; it does reconcile the profile
  (newer `updatedAt` wins) so a restored device lands on home.
- The cursor is per user (`kv.syncCursor = {userId, cursor}`).
- Session end = `/session/summary` mounting or the page going hidden.
- Outbox kinds without a route (all three, until ticket 04) are kept with a breadcrumb.

Left for later: continuous profile backup after login; draining the outbox for anonymous installs
(ticket 04); the paid download on restore (Phase 5).

Tests: 21 API tests (`server/test/sync.test.ts`; 86 server total, 3 runs green), 55 backup +
12 login-merge + 4 prompt + 5 repo/fold unit tests (488 total), `e2e/sync.spec.ts` (16 e2e total).
