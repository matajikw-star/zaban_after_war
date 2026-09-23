/// <reference path="../../pb_data/types.d.ts" />

// The review-event log on the server (ADR-0002; what.md §8.2, §15; ticket dev-server/03).
//
// The server stores and returns the log; it never computes study state. Two operations:
//
//   push(app, userId, events) — insert-ignore by event id, all in one transaction.
//   pull(app, userId, cursor, limit) — the caller's events after a cursor, in a stable order.
//
// THE CURSOR. Pull pages by (created, id). That order is only safe if an event that becomes
// visible later can never sort before an event a reader has already been handed. So every push
// stamps all its rows with one `created` that is strictly greater than every `created` this user
// already has — max(now, previous max + 1 ms) — computed inside the write transaction. Writes go
// through PocketBase's single-connection write pool, so no other push can land between the stamp
// and the commit. The rows of one push share the stamp (the id breaks the tie, and a reader sees
// the whole transaction or none of it); rows of a later push always sort after. This holds even
// if the server clock steps backwards. Without it, two pushes in the same millisecond — or a clock
// step — could hide an event behind a cursor forever, and that device would never restore it.

const { AppError, CODES } = require(`${__hooks}/lib/errors.js`);

/** what.md §8.2 / §15. */
const MAX_PUSH = 500;
const DEFAULT_PULL_LIMIT = 500;
const MAX_PULL_LIMIT = 1000;

/** what.md §15: an `at` further than this from the server's clock is stored but flagged. */
const AT_RANGE_MS = 365 * 24 * 60 * 60 * 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KINDS = ['review', 'know'];
/** PocketBase's own date text, `2026-09-23 21:38:00.123Z` (how-why §5.7), then `|`, then the id. */
const CURSOR = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}Z)\|([0-9a-f-]{36})$/;

/**
 * Validate one event. Returns the clean event or throws BAD_INPUT naming its index.
 *
 * A malformed event rejects the whole push rather than being skipped: our own client minted it,
 * so it is a bug to fix, and the client keeps it locally (unsynced) until the fix ships. Skipping
 * it would make the client mark it synced and lose it from every other device.
 */
function cleanEvent(raw, index) {
  const bad = (why) => new AppError(CODES.BAD_INPUT, `events[${index}]: ${why}`);

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw bad('not an object');
  if (typeof raw.id !== 'string' || !UUID.test(raw.id)) throw bad('id is not a lowercase UUID');
  if (typeof raw.itemId !== 'string' || raw.itemId.length < 1 || raw.itemId.length > 64) {
    throw bad('itemId must be 1-64 characters');
  }
  if (typeof raw.at !== 'number' || !Number.isSafeInteger(raw.at) || raw.at < 0) {
    throw bad('at must be a non-negative integer (epoch ms)');
  }
  if (KINDS.indexOf(raw.kind) === -1) throw bad('kind must be review or know');
  if (raw.grade !== 0 && raw.grade !== 1) throw bad('grade must be 0 or 1');
  if (typeof raw.device !== 'string' || raw.device.length > 64) {
    throw bad('device must be a string of at most 64 characters');
  }

  return {
    id: raw.id,
    itemId: raw.itemId,
    at: raw.at,
    kind: raw.kind,
    grade: raw.grade,
    device: raw.device,
  };
}

/**
 * @returns {{accepted: number, duplicates: number, conflicts: number, outOfRange: string[]}}
 *   `conflicts` are ids that already exist under ANOTHER user: they are left untouched (a body can
 *   never write into someone else's log, §15) and reported as duplicates to the client, which has
 *   nothing useful to do about them; the route logs them.
 */
function push(app, userId, rawEvents, nowMs) {
  if (rawEvents.length > MAX_PUSH) {
    throw new AppError(CODES.BAD_INPUT, `at most ${MAX_PUSH} events per push`);
  }

  const events = [];
  const outOfRange = [];
  for (let i = 0; i < rawEvents.length; i++) {
    const event = cleanEvent(rawEvents[i], i);
    events.push(event);
    if (Math.abs(event.at - nowMs) > AT_RANGE_MS) outOfRange.push(event.id);
  }

  let accepted = 0;
  const ignored = [];

  if (events.length > 0) {
    app.runInTransaction((tx) => {
      const stamp = new DynamicModel({ stamp: '' });
      tx.db()
        .newQuery(
          "SELECT MAX(strftime('%Y-%m-%d %H:%M:%fZ', 'now'), " +
            "COALESCE(strftime('%Y-%m-%d %H:%M:%fZ', " +
            '(SELECT MAX(created) FROM review_events WHERE user = {:user}), ' +
            "'+0.001 seconds'), '')) AS stamp",
        )
        .bind({ user: userId })
        .one(stamp);

      for (const event of events) {
        const result = tx
          .db()
          .newQuery(
            'INSERT OR IGNORE INTO review_events (id, user, itemId, at, kind, grade, device, created) ' +
              'VALUES ({:id}, {:user}, {:itemId}, {:at}, {:kind}, {:grade}, {:device}, {:created})',
          )
          .bind({
            id: event.id,
            user: userId,
            itemId: event.itemId,
            at: event.at,
            kind: event.kind,
            grade: event.grade,
            device: event.device,
            created: stamp.stamp,
          })
          .execute();
        if (result.rowsAffected() === 1) accepted++;
        else ignored.push(event.id);
      }
    });
  }

  // Rare path: only a replayed push has ignored ids. Tell a true duplicate from a foreign id.
  let conflicts = 0;
  for (const id of ignored) {
    const owner = new DynamicModel({ user: '' });
    app
      .db()
      .newQuery('SELECT user FROM review_events WHERE id = {:id}')
      .bind({ id: id })
      .one(owner);
    if (owner.user !== userId) conflicts++;
  }

  return {
    accepted: accepted,
    duplicates: ignored.length,
    conflicts: conflicts,
    outOfRange: outOfRange,
  };
}

/** `{created, id}` from a cursor string, or null for "from the beginning". */
function parseCursor(since) {
  if (since === undefined || since === null || since === '') return null;
  const match = CURSOR.exec(String(since));
  if (!match) throw new AppError(CODES.BAD_INPUT, 'since is not a cursor this server issued');
  return { created: match[1], id: match[2] };
}

function parseLimit(raw) {
  if (raw === undefined || raw === null || raw === '') return DEFAULT_PULL_LIMIT;
  const text = String(raw);
  if (!/^\d{1,5}$/.test(text)) throw new AppError(CODES.BAD_INPUT, 'limit must be an integer');
  const n = parseInt(text, 10);
  if (n < 1 || n > MAX_PULL_LIMIT) {
    throw new AppError(CODES.BAD_INPUT, `limit must be 1-${MAX_PULL_LIMIT}`);
  }
  return n;
}

/**
 * @returns {{events: object[], cursor: string, more: boolean}} `cursor` is where the next pull
 *   starts; when nothing new came back it is the cursor that was passed in, unchanged.
 */
function pull(app, userId, since, limit) {
  const cursor = parseCursor(since);

  const rows = arrayOf(
    new DynamicModel({
      id: '',
      itemId: '',
      at: 0,
      kind: '',
      grade: 0,
      device: '',
      created: '',
    }),
  );

  // One row past the page tells whether there is more.
  const where = cursor
    ? 'user = {:user} AND (created > {:created} OR (created = {:created} AND id > {:id}))'
    : 'user = {:user}';
  app
    .db()
    .newQuery(
      `SELECT id, itemId, at, kind, grade, device, created FROM review_events WHERE ${where} ` +
        'ORDER BY created ASC, id ASC LIMIT {:limit}',
    )
    .bind({
      user: userId,
      created: cursor ? cursor.created : '',
      id: cursor ? cursor.id : '',
      limit: limit + 1,
    })
    .all(rows);

  const more = rows.length > limit;
  const page = more ? rows.slice(0, limit) : rows;

  const events = [];
  for (const row of page) {
    events.push({
      id: row.id,
      itemId: row.itemId,
      at: row.at,
      kind: row.kind,
      grade: row.grade,
      device: row.device,
    });
  }

  const last = page.length > 0 ? page[page.length - 1] : null;
  return {
    events: events,
    cursor: last ? `${last.created}|${last.id}` : since ? String(since) : '',
    more: more,
  };
}

module.exports = {
  MAX_PUSH,
  DEFAULT_PULL_LIMIT,
  MAX_PULL_LIMIT,
  AT_RANGE_MS,
  cleanEvent,
  push,
  pull,
  parseCursor,
  parseLimit,
};
