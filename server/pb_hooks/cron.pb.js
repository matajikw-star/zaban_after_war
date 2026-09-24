/// <reference path="../pb_data/types.d.ts" />

// Scheduled jobs (what.md §8.2 "Crons"). Each job id is stable: the PocketBase admin UI and
// `POST /api/crons/<id>` (superuser) run a job by it.

// Hourly: drop OTP rows that expired more than an hour ago — by then they are outside every
// rate-limit window too (lib/otp.js PURGE_AFTER_EXPIRY_MS).
cronAdd('otp_purge', '0 * * * *', () => {
  const otp = require(`${__hooks}/lib/otp.js`);
  try {
    const deleted = otp.purge($app, Date.now());
    $app.logger().info('cron', 'job', 'otp_purge', 'deleted', deleted);
  } catch (err) {
    $app.logger().error('cron', 'job', 'otp_purge', 'err', String(err?.message || err));
  }
});

// Every 15 minutes: verify payments Zarinpal holds as paid but that never came back through the
// callback — the user closed the browser during the redirect (lib/pay.js reconcileUnverified).
// Makes no gateway call unless one of our own payments is still open. Not gated on mock SMS: it
// only settles money already taken, for the account that paid it.
cronAdd('reconcile_unverified', '*/15 * * * *', () => {
  const pay = require(`${__hooks}/lib/pay.js`);
  try {
    const result = pay.reconcileUnverified($app, Date.now());
    $app
      .logger()
      .info(
        'cron',
        'job',
        'reconcile_unverified',
        'checked',
        result.checked,
        'verified',
        result.verified,
        'skipped',
        result.skipped,
      );
  } catch (err) {
    $app.logger().error('cron', 'job', 'reconcile_unverified', 'err', String(err?.message || err));
  }
});

// Every 5 minutes: a payment still pending past its expiresAt (created + 2 h) becomes `expired`.
// A late callback for it still verifies — `expired` is not `failed`.
cronAdd('expire_pending', '*/5 * * * *', () => {
  const pay = require(`${__hooks}/lib/pay.js`);
  try {
    const expired = pay.expirePending($app, Date.now());
    $app.logger().info('cron', 'job', 'expire_pending', 'expired', expired);
  } catch (err) {
    $app.logger().error('cron', 'job', 'expire_pending', 'err', String(err?.message || err));
  }
});
