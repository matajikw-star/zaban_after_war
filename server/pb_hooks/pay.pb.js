/// <reference path="../pb_data/types.d.ts" />

// Payment and entitlement routes (what.md §8.2, §8.3; ticket dev-payment/01). The rules live in
// lib/pay.js; these handlers only wire HTTP to them.
//
//   POST /api/pay/quote        user       {code?} → {listPrice, salePrice, discountAmount, payable,
//                                                   codeStatus, code}
//   POST /api/pay/request      user       {code?} → {paymentId, gatewayUrl} | {paymentId, granted}
//   GET  /api/pay/callback     none       ?Authority=&Status= → 302 /purchase/result?…
//   GET  /api/pay/status/{id}  user (own) → {paymentId, status, refId, failReason, entitled}
//   POST /api/admin/grant      superuser  {phone, note?} → {userId, entitlementId, created}
//
// Every /api/pay/* route refuses with PAYMENT_DISABLED_MOCK_SMS (503) while SMS_PROVIDER=mock,
// before auth and before the body is read (`guard: pay.guard`). /api/admin/grant is not gated:
// only the owner can call it, and what it grants cannot be downloaded while the gate is up.

// --- POST /api/pay/quote ----------------------------------------------------------------------

routerAdd('POST', '/api/pay/quote', (e) => {
  const { withRoute } = require(`${__hooks}/lib/route.js`);
  const pay = require(`${__hooks}/lib/pay.js`);

  return withRoute(
    'pay.quote',
    (ctx) => pay.quote(ctx.app, ctx.auth.id, ctx.body.code, Date.now()),
    {
      auth: 'user',
      guard: pay.guard,
      schema: { code: { type: 'string', required: false, max: 64 } },
    },
  )(e);
});

// --- POST /api/pay/request --------------------------------------------------------------------

routerAdd('POST', '/api/pay/request', (e) => {
  const { withRoute } = require(`${__hooks}/lib/route.js`);
  const pay = require(`${__hooks}/lib/pay.js`);

  return withRoute(
    'pay.request',
    (ctx) => pay.requestPayment(ctx.app, ctx.auth, ctx.body.code, Date.now()),
    {
      auth: 'user',
      guard: pay.guard,
      schema: { code: { type: 'string', required: false, max: 64 } },
    },
  )(e);
});

// --- GET /api/pay/callback --------------------------------------------------------------------
// Zarinpal sends the user's browser here. No auth: the authority is the only link to our payment,
// and nothing about the answer depends on who is asking. Always a 302 to the result screen once
// past the gate, so the browser never lands on a JSON body.

routerAdd('GET', '/api/pay/callback', (e) => {
  const { withRoute, redirectResponse } = require(`${__hooks}/lib/route.js`);
  const pay = require(`${__hooks}/lib/pay.js`);

  return withRoute(
    'pay.callback',
    (ctx) => {
      const query = ctx.e.request.url.query();
      const authority = String(query.get('Authority') || '').slice(0, 64);
      const status = String(query.get('Status') || '');
      return redirectResponse(pay.handleCallback(ctx.app, authority, status, Date.now()));
    },
    { auth: 'none', guard: pay.guard, status: 302 },
  )(e);
});

// --- GET /api/pay/status/{id} -----------------------------------------------------------------
// Another user's payment is NOT_FOUND, not FORBIDDEN: an id says nothing about whether it exists.

routerAdd('GET', '/api/pay/status/{id}', (e) => {
  const { withRoute, AppError, CODES } = require(`${__hooks}/lib/route.js`);
  const pay = require(`${__hooks}/lib/pay.js`);

  return withRoute(
    'pay.status',
    (ctx) => {
      const id = ctx.e.request.pathValue('id') || '';
      let payment = null;
      if (/^[a-z0-9]{15}$/.test(id)) {
        try {
          payment = ctx.app.findRecordById('payments', id);
        } catch (_err) {
          payment = null;
        }
      }
      if (!payment || payment.getString('user') !== ctx.auth.id) {
        throw new AppError(CODES.NOT_FOUND, 'no such payment');
      }

      return {
        paymentId: payment.id,
        status: payment.getString('status'),
        refId: payment.getString('refId') || null,
        failReason: payment.getString('failReason') || null,
        entitled: !!pay.entitlementOf(ctx.app, ctx.auth.id),
      };
    },
    { auth: 'user', guard: pay.guard },
  )(e);
});

// --- POST /api/admin/grant --------------------------------------------------------------------
// The owner's manual grant (a refund reversed, a gift, a Bazaar purchase before its integration).
// Creates the account if the phone has never signed in. Idempotent: a phone already entitled
// answers `created: false` and keeps its existing entitlement untouched.

routerAdd('POST', '/api/admin/grant', (e) => {
  const { withRoute, AppError, CODES } = require(`${__hooks}/lib/route.js`);
  const { normalizeIranMobile } = require(`${__hooks}/lib/phone.js`);
  const users = require(`${__hooks}/lib/users.js`);
  const pay = require(`${__hooks}/lib/pay.js`);

  return withRoute(
    'admin.grant',
    (ctx) => {
      const phone = normalizeIranMobile(ctx.body.phone);
      if (!phone) throw new AppError(CODES.PHONE_INVALID, 'not an Iranian mobile number');

      const user = users.findOrCreateByPhone(ctx.app, phone).user;
      let granted = null;
      ctx.app.runInTransaction((tx) => {
        granted = pay.grant(tx, user.id, 'manual', '', ctx.body.note || '', Date.now());
      });

      ctx.app
        .logger()
        .info(
          'pay.manual_grant',
          'userId',
          user.id,
          'entitlementId',
          granted.record.id,
          'created',
          granted.created,
        );
      return { userId: user.id, entitlementId: granted.record.id, created: granted.created };
    },
    {
      auth: 'superuser',
      schema: {
        phone: { type: 'string', required: true, max: 32 },
        note: { type: 'string', required: false, max: 500 },
      },
    },
  )(e);
});
