/// <reference path="../pb_data/types.d.ts" />

// The four routes that do not belong to a feature: config, health, me, me/profile (what.md §8.2).
//
// PocketBase serializes every handler and runs it in its own isolated context, so each one
// re-requires what it needs through the `__hooks` global. That is not an oversight — a handler
// genuinely cannot see this file's top-level scope.

// --- startup ----------------------------------------------------------------------------------

onBootstrap((e) => {
  e.next();
  // Say in the log, once, what this process was configured with. An agent debugging from logs
  // should never have to guess whether SMS_PROVIDER was set.
  require(`${__hooks}/lib/env.js`).check($app);
});

// --- GET /api/config --------------------------------------------------------------------------
// Public. Prices live on the server (§8.3); the client only displays them.

routerAdd('GET', '/api/config', (e) => {
  const { withRoute, AppError, CODES } = require(`${__hooks}/lib/route.js`);

  return withRoute(
    'config',
    (ctx) => {
      let record;
      try {
        record = ctx.app.findFirstRecordByFilter('app_config', "id != ''");
      } catch (_err) {
        throw new AppError(CODES.INTERNAL, 'app_config has no record');
      }

      return {
        listPrice: record.getInt('listPrice'),
        salePrice: record.getInt('salePrice'),
        freePresentationLimit: record.getInt('freePresentationLimit'),
        minAppVersion: record.getString('minAppVersion'),
        supportUrl: record.getString('supportUrl'),
        notice: record.getString('notice'),
      };
    },
    { auth: 'none' },
  )(e);
});

// --- GET /api/health --------------------------------------------------------------------------
// Public. Used by the deploy script, by monitoring (§14.6) and by the test harness to know the
// server is up. Deliberately touches no table: it must answer even when the database is busy.
//
// PocketBase 0.40 registers `GET /api/health` itself, and a second routerAdd on the same pattern
// panics the router at startup ("pattern conflicts with pattern"). There is no way to unregister
// a built-in route, so ours is a global middleware that answers before the built-in handler is
// reached. Every other request falls straight through to e.next().

routerUse((e) => {
  if (e.request.method !== 'GET' || e.request.url.path !== '/api/health') {
    return e.next();
  }

  const { withRoute } = require(`${__hooks}/lib/route.js`);
  const version = require(`${__hooks}/lib/version.js`);

  return withRoute(
    'health',
    () => ({
      ok: true,
      version: version.full,
      time: new Date().toISOString(),
    }),
    { auth: 'none' },
  )(e);
});

// --- any unmatched /api/... -------------------------------------------------------------------
// An /api/ path no route owns answers the JSON envelope with 404 NOT_FOUND. Without this, the
// VPS (`--publicDir`, systemd/kl-pocketbase.service) answered `GET /api/<unknown>` with
// `200 text/html` — PocketBase's pb_public index fallback — so a client talking to an older
// server, or a typo'd path, saw success and then failed parsing JSON.
//
// A middleware, not a `/api/{path...}` route: PocketBase 0.40's router is Go's ServeMux, where a
// method-less `/api/{path...}` conflicts with the static `GET /{path...}` (neither pattern is
// more specific than the other) and would panic at startup. Instead this reads which pattern the
// mux matched (`e.request.pattern`, Go's http.Request.Pattern): a request under /api/ whose
// pattern is itself under /api belongs to a real route — ours or PocketBase's, whatever its
// method — and is passed on untouched. Only a request that fell through to a fallback (the
// static `GET /{path...}`, or PocketBase's own method-less `/` catch-all) is answered here, so
// no real route can ever be shadowed. CORS preflights are answered by PocketBase's CORS
// middleware, which runs before this one.

routerUse((e) => {
  const path = e.request.url.path;
  if (path !== '/api' && path.indexOf('/api/') !== 0) return e.next();

  // "GET /api/config", "/api/realtime", "/{path...}", "/" — the method and host come first.
  const pattern = String(e.request.pattern || '');
  const slash = pattern.indexOf('/');
  const patternPath = slash === -1 ? '' : pattern.slice(slash);
  if (patternPath === '/api' || patternPath.indexOf('/api/') === 0) return e.next();

  const { withRoute, AppError, CODES } = require(`${__hooks}/lib/route.js`);
  return withRoute(
    'api.not_found',
    () => {
      throw new AppError(CODES.NOT_FOUND, `no route for ${e.request.method} ${path}`);
    },
    { auth: 'none' },
  )(e);
});

// --- GET /api/me ------------------------------------------------------------------------------
// The client calls this on every launch that has a network: it is where the device learns whether
// it is still entitled (§7.6) and where the server learns the device is alive.

routerAdd('GET', '/api/me', (e) => {
  const { withRoute, readJsonField } = require(`${__hooks}/lib/route.js`);

  return withRoute(
    'me',
    (ctx) => {
      const user = ctx.auth;

      // Entitlement is the server's answer, never the client's claim (ADR-0004).
      let entitlement = { status: 'none', source: null, grantedAt: null };
      try {
        const granted = ctx.app.findFirstRecordByFilter(
          'entitlements',
          'user = {:user} && product = "full"',
          { user: user.id },
        );
        entitlement = {
          status: 'full',
          source: granted.getString('source'),
          grantedAt: granted.getDateTime('grantedAt').string() || null,
        };
      } catch (_err) {
        // No entitlement record: 'none' is the correct answer, not an error.
      }

      const profile = readJsonField(user, 'profile');

      // Refresh lastSeenAt. One write per launch, which is what tells the owner how many devices
      // are still studying without any analytics beyond the beacons of §8.4.
      user.set('lastSeenAt', new Date().toISOString());
      ctx.app.save(user);

      return {
        user: {
          id: user.id,
          phone: user.getString('phone'),
          profile: profile,
        },
        entitlement: entitlement,
        profileUpdatedAt:
          profile && typeof profile.updatedAt === 'number' ? profile.updatedAt : null,
      };
    },
    { auth: 'user' },
  )(e);
});

// --- PATCH /api/me/profile --------------------------------------------------------------------
// Last-writer-wins by the device's own `updatedAt`, so two devices cannot ping-pong a profile and
// an offline device that syncs late cannot undo a newer setting.

routerAdd('PATCH', '/api/me/profile', (e) => {
  const { withRoute, readJsonField, AppError, CODES } = require(`${__hooks}/lib/route.js`);

  return withRoute(
    'me.profile',
    (ctx) => {
      const profile = ctx.body.profile;

      if (typeof profile.updatedAt !== 'number' || !Number.isFinite(profile.updatedAt)) {
        throw new AppError(CODES.BAD_INPUT, 'profile.updatedAt must be an epoch-ms number');
      }

      const user = ctx.auth;
      const stored = readJsonField(user, 'profile');
      const storedAt = stored && typeof stored.updatedAt === 'number' ? stored.updatedAt : -1;

      if (profile.updatedAt <= storedAt) {
        // Not an error: the device is simply behind. It gets the winning profile back.
        return { profile: stored, updated: false };
      }

      user.set('profile', profile);
      ctx.app.save(user);

      return { profile: profile, updated: true };
    },
    {
      auth: 'user',
      schema: { profile: { type: 'object', required: true } },
    },
  )(e);
});
