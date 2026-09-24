/// <reference path="../pb_data/types.d.ts" />

// The content packages (what.md §6, §7.5, §8.2; ticket dev-payment/01).
//
//   GET /api/content/manifest   none          → {free: {version, hash, bytes}, paid: {…}}
//   GET /api/content/paid       user+entitled → paid.json, Range-aware (200 / 206 / 416)
//
// The paid route is gated like the payment routes: refused with PAYMENT_DISABLED_MOCK_SMS while
// SMS_PROVIDER=mock, before auth — an account proves nothing when every phone logs in with 123456.

// --- GET /api/content/manifest ----------------------------------------------------------------

routerAdd('GET', '/api/content/manifest', (e) => {
  const { withRoute } = require(`${__hooks}/lib/route.js`);
  const content = require(`${__hooks}/lib/content.js`);

  return withRoute(
    'content.manifest',
    (ctx) => {
      // The client compares versions on every launch that has a network: never cached.
      ctx.e.response.header().set('Cache-Control', 'no-cache');
      return content.manifest();
    },
    { auth: 'none' },
  )(e);
});

// --- GET /api/content/paid --------------------------------------------------------------------
// Served by Go's http.ServeContent (e.fileFS), so `Range: bytes=<n>-` answers 206 with
// Content-Range, an unsatisfiable range 416, and If-Range is honoured against the ETag below —
// the manifest's paid hash, so a resume across a content update restarts from byte 0.

routerAdd('GET', '/api/content/paid', (e) => {
  const { withRoute, fileResponse, AppError, CODES } = require(`${__hooks}/lib/route.js`);
  const content = require(`${__hooks}/lib/content.js`);
  const pay = require(`${__hooks}/lib/pay.js`);

  return withRoute(
    'content.paid',
    (ctx) => {
      if (!pay.entitlementOf(ctx.app, ctx.auth.id)) {
        throw new AppError(CODES.NOT_ENTITLED, 'the paid package needs an entitlement');
      }

      const nowMs = Date.now();
      content.enforceDailyCap(ctx.app, ctx.auth.id, nowMs);
      content.requirePaidFile();

      let version = '';
      try {
        const m = content.manifest();
        version = m.paid.version;
        ctx.e.response.header().set('ETag', `"${m.paid.hash}"`);
        ctx.e.response.header().set('X-Content-Version', version);
      } catch (_err) {
        // No manifest: the file still serves, without an ETag. The manifest route reports it.
      }

      content.recordDownload(ctx.app, ctx.auth.id, version, ctx.e.request.header.get('Range'));

      ctx.e.response.header().set('Cache-Control', 'private, no-cache');
      return fileResponse($os.dirFS(content.dir()), content.PAID_FILE);
    },
    { auth: 'user', guard: pay.guard },
  )(e);
});
