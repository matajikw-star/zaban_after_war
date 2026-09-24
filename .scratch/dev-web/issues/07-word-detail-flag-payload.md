# 07 — Word-detail flag sends a malformed payload

Status: ready-for-agent
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
