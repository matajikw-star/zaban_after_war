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
