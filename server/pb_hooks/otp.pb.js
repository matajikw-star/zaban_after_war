/// <reference path="../pb_data/types.d.ts" />

// Phone-OTP login (what.md §8.2, §15; ticket dev-server/02). The only way into an account.
//
//   POST /api/otp/request  {phone}        → {ok, retryAfter}
//   POST /api/otp/verify   {phone, code}  → {token, record}   (PocketBase's auth response shape)
//
// Neither answer says whether the phone already has an account: request is identical either way,
// and verify creates the account on first success.

// --- POST /api/otp/request --------------------------------------------------------------------

routerAdd('POST', '/api/otp/request', (e) => {
  const { withRoute, AppError, CODES } = require(`${__hooks}/lib/route.js`);
  const { normalizeIranMobile } = require(`${__hooks}/lib/phone.js`);
  const sms = require(`${__hooks}/lib/sms.js`);
  const otp = require(`${__hooks}/lib/otp.js`);

  return withRoute(
    'otp.request',
    (ctx) => {
      const phone = normalizeIranMobile(ctx.body.phone);
      if (!phone) throw new AppError(CODES.PHONE_INVALID, 'not an Iranian mobile number');

      // Before anything is written: a misconfigured server refuses loudly and burns no quota.
      const provider = sms.providerName();

      const ip = ctx.e.realIP();
      const nowMs = Date.now();
      otp.enforceLimit(ctx.app, 'ip', ip, otp.IP_LIMIT, otp.IP_WINDOW_MS, nowMs);
      otp.enforceLimit(ctx.app, 'phone', phone, otp.PHONE_LIMIT, otp.PHONE_WINDOW_MS, nowMs);

      const code = sms.newCode(provider);

      const row = new Record(ctx.app.findCollectionByNameOrId('otp_codes'));
      row.set('phone', phone);
      row.set('codeHash', otp.hashCode(code));
      row.set('expiresAt', otp.pbDate(nowMs + otp.EXPIRY_MS));
      row.set('attempts', 0);
      row.set('ip', ip);
      ctx.app.save(row);

      // The row stays even if the send fails: a failing gateway must not become a way around the
      // rate limit, and the user's next tap is simply a new code.
      sms.send(ctx.app, provider, phone, code);

      return {
        ok: true,
        retryAfter: otp.secondsUntilFree(
          ctx.app,
          'phone',
          phone,
          otp.PHONE_LIMIT,
          otp.PHONE_WINDOW_MS,
          nowMs,
        ),
      };
    },
    {
      auth: 'none',
      schema: { phone: { type: 'string', required: true, max: 32 } },
    },
  )(e);
});

// --- POST /api/otp/verify ---------------------------------------------------------------------

routerAdd('POST', '/api/otp/verify', (e) => {
  const { withRoute, AppError, CODES } = require(`${__hooks}/lib/route.js`);
  const { normalizeIranMobile, asciiDigits } = require(`${__hooks}/lib/phone.js`);
  const otp = require(`${__hooks}/lib/otp.js`);

  return withRoute(
    'otp.verify',
    (ctx) => {
      const phone = normalizeIranMobile(ctx.body.phone);
      if (!phone) throw new AppError(CODES.PHONE_INVALID, 'not an Iranian mobile number');

      // Real codes are 5 digits; the mock provider's is 123456 (6).
      const code = asciiDigits(String(ctx.body.code)).trim();
      if (!/^\d{5,6}$/.test(code)) throw new AppError(CODES.BAD_INPUT, 'code must be 5-6 digits');

      const row = otp.latestFor(ctx.app, phone);
      if (!row) throw new AppError(CODES.OTP_EXPIRED, 'no code was requested for this phone');

      if (otp.msOf(row, 'expiresAt') <= Date.now()) {
        throw new AppError(CODES.OTP_EXPIRED, 'the code has expired');
      }

      // Spend the attempt before comparing, atomically, so the limit holds under concurrency.
      if (!otp.spendAttempt(ctx.app, row.id)) {
        throw new AppError(CODES.OTP_LOCKED, 'too many wrong codes; request a new one');
      }

      if (!otp.codeMatches(row.getString('codeHash'), code)) {
        const attemptsLeft = Math.max(0, otp.MAX_ATTEMPTS - (row.getInt('attempts') + 1));
        throw new AppError(
          CODES.OTP_WRONG,
          'wrong code',
          400,
          { attemptsLeft: attemptsLeft },
          { attemptsLeft: attemptsLeft },
        );
      }

      otp.burn(ctx.app, row.id, Date.now());

      // Find or create. The unique index on `phone` settles a race between two first logins:
      // the loser's save fails and it finds the winner's record.
      let user = null;
      try {
        user = ctx.app.findFirstRecordByData('users', 'phone', phone);
      } catch (_err) {
        user = null;
      }
      if (!user) {
        const created = new Record(ctx.app.findCollectionByNameOrId('users'));
        created.set('phone', phone);
        // An auth record must have a password; password auth is disabled, so nobody can use it.
        created.setPassword($security.randomString(40));
        try {
          ctx.app.save(created);
          user = created;
        } catch (err) {
          try {
            user = ctx.app.findFirstRecordByData('users', 'phone', phone);
          } catch (_err) {
            throw err;
          }
        }
      }

      // Built here rather than with $apis.recordAuthResponse, which writes its own body and would
      // collide with withRoute's (how-why §5.7). Same {token, record} shape; the record marshals
      // its public fields only.
      return { token: user.newAuthToken(), record: user };
    },
    {
      auth: 'none',
      schema: {
        phone: { type: 'string', required: true, max: 32 },
        code: { type: 'string', required: true, max: 16 },
      },
    },
  )(e);
});
