# 07 — Word-detail flag sends a malformed payload

Status: resolved
Type: bug
Found: 2026-09-24, by the dev-web/06 design-pass agent

## What is wrong

`screens/word/WordDetail.tsx` queues `outboxEnqueue('flag', { itemId, reason, at })` with the
Persian button label as `reason` and no `installId` / `appVersion`. `/review`
(`screens/review/Review.tsx`, ~line 208) builds a full `FlagBody` (`net/api.ts`) with a reason
code. The same user action therefore reaches `POST /api/flags` in two shapes, and the
word-detail one does not match the contract (what.md §7.8 `/word/:id`, §8.2 flags).

Also: `WordDetail` reserves bottom-nav spacing but has no bottom nav.

## Done when

- One function builds a `FlagBody` from `(itemId, reasonCode)` and both screens use it; the flag
  sheet's three reasons are codes with Persian labels from `strings.ts`.
- A unit test proves both screens enqueue the same shape; a server-contract check (existing API
  test or a new one) proves the body is accepted.
- What the outbox does today with a body the server rejects is stated in the ticket comments
  (dropped? retried forever?), and if it retries forever that is its own ticket.
- The stray spacer is gone.

## Comments

**Fix.** Added `apps/web/src/engine/flag-body.ts`, a pure `buildFlagBody(itemId, reason,
context)` — `context` is `{installId, appVersion, at}`, gathered by the caller (store reads, the
clock) the same way every other `engine/` function takes its inputs as parameters (`what.md`
§17.7). `screens/review/Review.tsx`'s `onFlag` and `screens/word/WordDetail.tsx`'s `FlagSheet`
`submit` both now build their `FlagBody` through it, so the two call sites cannot drift into two
shapes again — there is only the one function.

The three reason codes and their Persian labels were duplicated: `screens/review/FlagSheet.tsx`
already had the real ones (`translation`/`example`/`hint`, with `strings.review.flagTranslation`
etc. as labels — this is what the server's `word_flags.reason` enum and `net/api.ts`'s `FlagBody`
actually expect), while `WordDetail` rendered three buttons from `strings.word.flagReason*`,
free-text Persian with no codes at all, so its `outboxEnqueue` call sent the *label* as `reason`.
Exported `FLAG_REASONS` (the `{reason, label}` list) from `FlagSheet.tsx` and import it in
`WordDetail.tsx` instead — one set. Removed the now-dead `word.flagReasonWrongTranslation` /
`flagReasonBadExample` / `flagReasonOther` / `flagSubmit` strings from `strings.ts`; kept
`word.flag` / `flagTitle` / `flagSent`, which are `WordDetail`'s own sheet chrome, not reasons.
Also moved the `FlagReason` type itself from `FlagSheet.tsx` into `net/api.ts` next to `FlagBody`
(the same place `BeaconName` lives for `BeaconBody`) and tightened `FlagBody.reason` from `string`
to `FlagReason`, so a typo in a reason code is now a type error, not just a runtime 400.

Removed `BOTTOM_NAV_SPACER_CLASS` from `WordDetail`'s `<main>` — confirmed no other screen in
`screens/word/` uses it and nothing in the test suite pins its presence there.

**Tests.** `apps/web/src/engine/flag-body.test.ts` (new): `buildFlagBody` produces the exact
`FlagBody` shape for each of the three reason codes, and a same-inputs-same-output check standing
in for "both screens enqueue the same shape" — true by construction once both call sites share
the one function, which is what this fix does. `server/test/telemetry.test.ts` already had
`POST /api/flags` tests for the anonymous case, the logged-in case and the `BAD_INPUT` rejection
of an unknown reason (covering exactly the `{installId, itemId, reason, appVersion, at}` shape
both screens now send); added one more case that round-trips all three reason codes
(`translation`/`example`/`hint`) in one test, since nothing previously exercised `example`.

**The outbox finding.** `apps/web/src/sync/backup.ts`'s `drainOutbox` (~line 321): on a 2xx it
deletes the row; on a **non-429/401 4xx** (`toAppError` + `statusOf`) it **deletes the row and
breadcrumbs `backup.outbox.dropped`, then continues to the next row** — it does not retry and does
not block later items. On anything else (network error, 5xx, 429, 401) it calls
`outboxRecordFailure` and **returns from the whole `drainOutbox` call**, deferring every row after
it in that batch to the next drain (timer, `online`, session-end, …); there is no attempt cap, so
a persistently-failing item in that second category would retry indefinitely and hold up rows
behind it — but that is the outbox's existing, deliberate, already-tested design (`backup.ts`'s
own comment: "anything transient stops the drain until the next run"; covered by
`backup.test.ts`'s "deletes on 2xx, drops a non-429 4xx with a breadcrumb, keeps a 429 and stops",
~line 840), not something this bug introduced.

The word-detail bug specifically: `POST /api/flags`' schema (`server/pb_hooks/telemetry.pb.js`)
requires `installId` and validates `reason` against the enum — both a missing `installId` and a
Persian label in place of a reason code fail `withRoute`'s schema validation with
`AppError(CODES.BAD_INPUT, …)`, which is HTTP **400**. 400 falls in the "drop" branch above. So the
malformed word-detail flags were being **silently dropped after their first send attempt** — lost
reports, not an infinite retry and not a blocked queue. No new ticket: it doesn't meet the
"retries forever or blocks the queue" bar this ticket set for opening one.

**Verification** (all exit 0):
- `pnpm lint` — Checked 290 files. No fixes applied.
- `pnpm typecheck` — apps/web typecheck: Done
- `pnpm test` — Test Files 54 passed (54), Tests 581 passed (581)
- `pnpm test:server` — Test Files 7 passed (7), Tests 116 passed (116)
- `pnpm build` — apps/web build: Done
- `pnpm budget` — 216.6 KB total gzipped (limit 300.0 KB), 83.4 KB to spare
- `KL_E2E_CHANNEL=msedge pnpm e2e` — 17 passed, 12 skipped (the screenshot recorder,
  `KL_SCREENSHOTS` not set)

**Out of scope, reported not fixed:** `word.flag`'s Persian text is byte-identical to
`review.flag` («این کلمه اشکال دارد») — a second literal copy of the same string, not touched here
since the ticket's "no second set" instruction was scoped to the three *reasons*. `WordDetail`'s
flag sheet keeps its own inline "sent" confirmation UI (unlike `/review`, which closes the sheet
and shows a toast) — a UX difference, not a payload one, left as is.
