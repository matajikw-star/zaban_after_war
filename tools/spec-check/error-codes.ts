// Check 4: the server's error codes vs. server/pb_hooks/lib/errors.js's `CODES` table (ticket
// dev-foundation/04).
//
// Scope, decided while building this check (see the ticket's Comments): §17 states only the
// *convention* ("errors carry codes"; `class AppError extends Error { code, data }`) — it does
// not enumerate a set. The actual closed list of server codes is written once, in §8.2's
// route-envelope paragraph (`answers { error: { code, message } } with a stable code — one of
// ...`), which is also where `errors.js`'s `CODES` object is meant to match. That is the list
// this check reads and is the only side of "§17 error codes" that is a fixed, checkable set.
//
// The client's `AppError` code (apps/web/src/errors.ts) is deliberately not a fixed enum: each
// call site names its own local failure mode (`DOWNLOAD_STALLED`, `SYNC_USER_CHANGED`, ...), and
// `net/api.ts` passes server codes through as `SERVER_<code>` plus `HTTP_<status>` for anything
// else. Nothing in what.md enumerates that set, so per the ticket's instruction ("if §17 lists
// only one of those, compare only what §17 claims to list") this check does not compare it.

const LIST_START = 'one of `BAD_INPUT`';
const LIST_END = 'A few errors carry';

/** what.md §8.2: the backtick-quoted `SCREAMING_CASE` codes in the route-envelope paragraph. */
export function parseWhatServerErrorCodes(section8_2: string): string[] {
  const start = section8_2.indexOf(LIST_START);
  if (start === -1) {
    throw new Error('spec-check: error-code list not found in what.md §8.2 (anchor text moved?)');
  }
  const endRel = section8_2.indexOf(LIST_END, start);
  const slice = endRel === -1 ? section8_2.slice(start) : section8_2.slice(start, endRel);
  return [...slice.matchAll(/`([A-Z][A-Z0-9_]*)`/g)].map((m) => m[1] ?? '');
}

/** server/pb_hooks/lib/errors.js: the keys of `const CODES = { ... };`. */
export function parseServerErrorCodes(errorsJsContent: string): string[] {
  const m = errorsJsContent.match(/const CODES = \{([\s\S]*?)\};/);
  if (!m?.[1]) {
    throw new Error('spec-check: CODES not found in server/pb_hooks/lib/errors.js');
  }
  return [...m[1].matchAll(/^\s*([A-Z][A-Z0-9_]*):/gm)].map((x) => x[1] ?? '');
}
