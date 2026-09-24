/// <reference path="../pb_data/types.d.ts" />

// Flags, beacons, client errors, and the superuser route that serves their source maps
// (what.md §8.2, §8.4, §10.1, §15; ticket dev-server/04).
//
//   POST /api/flags                          {installId, itemId, reason, appVersion, at} → {ok}
//   POST /api/beacon                         {installId, events: [{name, at, appVersion}]} → {ok}
//   POST /api/client-errors                  one record (§10.1) → {ok, deduped}
//   GET  /api/admin/sourcemap/{sha}/{file}    superuser only → the *.map file
//
// The first three take `auth: 'optional'`: an anonymous install (no login yet) still reports —
// §19's known gap was that the client never sent them before a login existed; ticket 04 is the
// server half of closing it. `user` is only ever taken from the token, never from the body, same
// rule as sync.js.

// --- POST /api/flags ----------------------------------------------------------------------------

routerAdd('POST', '/api/flags', (e) => {
  const { withRoute } = require(`${__hooks}/lib/route.js`);
  const telemetry = require(`${__hooks}/lib/telemetry.js`);

  return withRoute(
    'flags',
    (ctx) => {
      const installId = ctx.body.installId;
      telemetry.enforceDailyCap(
        ctx.app,
        'word_flags',
        installId,
        telemetry.FLAGS_DAILY_CAP,
        Date.now(),
      );

      const row = new Record(ctx.app.findCollectionByNameOrId('word_flags'));
      row.set('installId', installId);
      if (ctx.auth) row.set('user', ctx.auth.id);
      row.set('itemId', ctx.body.itemId);
      row.set('reason', ctx.body.reason);
      row.set('appVersion', ctx.body.appVersion || '');
      row.set('at', ctx.body.at);
      ctx.app.save(row);

      return { ok: true };
    },
    {
      auth: 'optional',
      schema: {
        installId: { type: 'string', required: true, max: 64 },
        itemId: { type: 'string', required: true, max: 64 },
        reason: { type: 'string', required: true, enum: ['translation', 'example', 'hint'] },
        appVersion: { type: 'string', required: false, max: 32 },
        at: { type: 'number', required: true, min: 0 },
      },
    },
  )(e);
});

// --- POST /api/beacon ----------------------------------------------------------------------------

routerAdd('POST', '/api/beacon', (e) => {
  const { withRoute } = require(`${__hooks}/lib/route.js`);
  const telemetry = require(`${__hooks}/lib/telemetry.js`);

  return withRoute(
    'beacon',
    (ctx) => {
      const installId = ctx.body.installId;
      telemetry.enforceDailyCap(
        ctx.app,
        'beacons',
        installId,
        telemetry.BEACON_DAILY_CAP,
        Date.now(),
      );

      // Cleaned in full before anything is written: one bad event rejects the whole call, same
      // reasoning as sync.js's push — our own client minted every one of these.
      const events = ctx.body.events.map((raw, i) => telemetry.cleanBeaconEvent(raw, i));

      for (const event of events) {
        const row = new Record(ctx.app.findCollectionByNameOrId('beacons'));
        row.set('installId', installId);
        if (ctx.auth) row.set('user', ctx.auth.id);
        row.set('name', event.name);
        row.set('at', event.at);
        row.set('appVersion', event.appVersion);
        ctx.app.save(row);
      }

      return { ok: true };
    },
    {
      auth: 'optional',
      schema: {
        installId: { type: 'string', required: true, max: 64 },
        events: { type: 'array', required: true, maxItems: 20 },
      },
    },
  )(e);
});

// --- POST /api/client-errors ----------------------------------------------------------------------

routerAdd('POST', '/api/client-errors', (e) => {
  const { withRoute } = require(`${__hooks}/lib/route.js`);
  const telemetry = require(`${__hooks}/lib/telemetry.js`);

  return withRoute(
    'client-errors',
    (ctx) => {
      const installId = ctx.body.installId;
      const nowMs = Date.now();

      // Dedupe first, so a render loop hammering the same bug can never burn the day's cap: a
      // repeat within the hour only ever bumps one row's count (§8.2).
      const dup = telemetry.findRecentDuplicate(ctx.app, installId, ctx.body.fingerprint, nowMs);
      if (dup) {
        dup.set('count', dup.getInt('count') + 1);
        dup.set('at', ctx.body.at);
        dup.set('online', !!ctx.body.online);
        if (ctx.body.message !== undefined) dup.set('message', ctx.body.message);
        if (ctx.body.stack !== undefined) dup.set('stack', ctx.body.stack);
        if (ctx.body.route !== undefined) dup.set('route', ctx.body.route);
        if (ctx.body.breadcrumbs !== undefined) dup.set('breadcrumbs', ctx.body.breadcrumbs);
        if (ctx.body.snapshot !== undefined) dup.set('snapshot', ctx.body.snapshot);
        ctx.app.save(dup);
        return { ok: true, deduped: true };
      }

      telemetry.enforceDailyCap(
        ctx.app,
        'client_errors',
        installId,
        telemetry.CLIENT_ERRORS_DAILY_CAP,
        nowMs,
      );

      const row = new Record(ctx.app.findCollectionByNameOrId('client_errors'));
      row.set('kind', ctx.body.kind);
      row.set('fingerprint', ctx.body.fingerprint);
      row.set('message', ctx.body.message || '');
      row.set('stack', ctx.body.stack || '');
      row.set('appVersion', ctx.body.appVersion || '');
      row.set('buildSha', ctx.body.buildSha || '');
      row.set('route', ctx.body.route || '');
      row.set('installId', installId);
      if (ctx.auth) row.set('user', ctx.auth.id);
      row.set('at', ctx.body.at);
      row.set('online', !!ctx.body.online);
      if (ctx.body.device !== undefined) row.set('device', ctx.body.device);
      if (ctx.body.breadcrumbs !== undefined) row.set('breadcrumbs', ctx.body.breadcrumbs);
      if (ctx.body.snapshot !== undefined) row.set('snapshot', ctx.body.snapshot);
      row.set('userNote', ctx.body.userNote || '');
      row.set('count', 1);
      ctx.app.save(row);

      return { ok: true, deduped: false };
    },
    {
      auth: 'optional',
      schema: {
        kind: {
          type: 'string',
          required: true,
          enum: [
            'error',
            'unhandledrejection',
            'react',
            'sw',
            'sync',
            'download',
            'payment',
            'user_report',
          ],
        },
        fingerprint: { type: 'string', required: true, max: 64 },
        message: { type: 'string', required: false, max: 2000 },
        stack: { type: 'string', required: false, max: 20000 },
        appVersion: { type: 'string', required: false, max: 32 },
        buildSha: { type: 'string', required: false, max: 64 },
        route: { type: 'string', required: false, max: 200 },
        installId: { type: 'string', required: true, max: 64 },
        at: { type: 'number', required: true, min: 0 },
        online: { type: 'boolean', required: false },
        device: { type: 'object', required: false },
        breadcrumbs: { type: 'array', required: false },
        snapshot: { type: 'object', required: false },
        userNote: { type: 'string', required: false, max: 500 },
      },
    },
  )(e);
});

// --- GET /api/admin/sourcemap/{sha}/{file} --------------------------------------------------------
// Superuser only (`tools/errors`). The path params are the untrusted part of this route: `sha`
// and `file` are matched against a strict allow-list before they ever touch a filesystem path, so
// neither `..`, an encoded slash, nor any other character can walk out of SOURCEMAP_DIR. The
// regexes live in telemetry.js, not at this file's top level: PocketBase serializes each handler
// into its own isolated context, so a top-level const here would be invisible inside it (see the
// note at the top of lib/route.js).

routerAdd('GET', '/api/admin/sourcemap/{sha}/{file}', (e) => {
  const { withRoute, blobResponse, AppError, CODES } = require(`${__hooks}/lib/route.js`);
  const env = require(`${__hooks}/lib/env.js`);
  const telemetry = require(`${__hooks}/lib/telemetry.js`);

  return withRoute(
    'admin.sourcemap',
    (ctx) => {
      const sha = ctx.e.request.pathValue('sha') || '';
      const file = ctx.e.request.pathValue('file') || '';

      if (!telemetry.SHA_RE.test(sha))
        throw new AppError(CODES.BAD_INPUT, 'sha must be a git commit hash');
      if (!telemetry.FILE_RE.test(file)) {
        throw new AppError(CODES.BAD_INPUT, 'file must be a plain *.map name');
      }

      const dir = env.get('SOURCEMAP_DIR');
      let bytes;
      try {
        bytes = $os.readFile(`${dir}/${sha}/${file}`);
      } catch (_err) {
        throw new AppError(CODES.NOT_FOUND, 'no source map for that build and file');
      }

      ctx.e.response.header().set('Cache-Control', 'private, max-age=31536000, immutable');
      return blobResponse('application/json', bytes);
    },
    { auth: 'superuser' },
  )(e);
});
