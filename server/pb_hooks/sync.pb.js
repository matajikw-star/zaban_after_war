/// <reference path="../pb_data/types.d.ts" />

// Backup: the review-event log in both directions (ADR-0002; what.md §7.4, §8.2, §15; ticket
// dev-server/03). The logic, and why the pull cursor is safe, is in lib/sync.js.
//
//   POST /api/sync/push              {events: ReviewEvent[]} (≤ 500) → {accepted, duplicates}
//   GET  /api/sync/pull?since=&limit=                                 → {events, cursor, more}
//
// `user` always comes from the token; a `user` in the body or on an event is never read.

// --- POST /api/sync/push ----------------------------------------------------------------------

routerAdd('POST', '/api/sync/push', (e) => {
  const { withRoute } = require(`${__hooks}/lib/route.js`);
  const sync = require(`${__hooks}/lib/sync.js`);

  return withRoute(
    'sync.push',
    (ctx) => {
      const userId = ctx.auth.id;
      const result = sync.push(ctx.app, userId, ctx.body.events, Date.now());

      // ADR-0002: a device clock can be wrong. The event is stored exactly as sent; the log is
      // where a skewed device shows up. One line per push, not per event.
      if (result.outOfRange.length > 0) {
        ctx.app
          .logger()
          .warn(
            'sync.at_out_of_range',
            'route',
            'sync.push',
            'flag',
            'at_out_of_range',
            'userId',
            userId,
            'installId',
            ctx.installId,
            'count',
            result.outOfRange.length,
            'sampleIds',
            result.outOfRange.slice(0, 5).join(','),
          );
      }
      // Another user's id in this user's push: never overwritten, but worth knowing about.
      if (result.conflicts > 0) {
        ctx.app
          .logger()
          .warn(
            'sync.id_conflict',
            'route',
            'sync.push',
            'flag',
            'id_conflict',
            'userId',
            userId,
            'installId',
            ctx.installId,
            'count',
            result.conflicts,
          );
      }

      return { accepted: result.accepted, duplicates: result.duplicates };
    },
    {
      auth: 'user',
      // 500 events of at most ~260 bytes each, with room to spare.
      maxBodyBytes: 256 * 1024,
      schema: { events: { type: 'array', required: true, maxItems: sync.MAX_PUSH } },
    },
  )(e);
});

// --- GET /api/sync/pull -----------------------------------------------------------------------

routerAdd('GET', '/api/sync/pull', (e) => {
  const { withRoute } = require(`${__hooks}/lib/route.js`);
  const sync = require(`${__hooks}/lib/sync.js`);

  return withRoute(
    'sync.pull',
    (ctx) => {
      const query = ctx.e.request.url.query();
      const limit = sync.parseLimit(query.get('limit'));
      return sync.pull(ctx.app, ctx.auth.id, query.get('since'), limit);
    },
    { auth: 'user' },
  )(e);
});
