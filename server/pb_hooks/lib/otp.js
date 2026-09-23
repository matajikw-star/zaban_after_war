/// <reference path="../../pb_data/types.d.ts" />

// The OTP rules (what.md §8.2, §15) and the small pieces the two routes and the purge cron share.
// Every number here is the spec's; changing one is a change to what.md.

const { AppError, CODES } = require(`${__hooks}/lib/errors.js`);

const EXPIRY_MS = 3 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const PHONE_LIMIT = 3;
const PHONE_WINDOW_MS = 10 * 60 * 1000;

const IP_LIMIT = 10;
const IP_WINDOW_MS = 60 * 60 * 1000;

/**
 * A row may be deleted once it has expired AND fallen out of every rate-limit window — deleting it
 * at expiry would hand a phone a fresh quota after three minutes. The longest window is the IP
 * one, so the purge keeps an hour of history past expiry.
 */
const PURGE_AFTER_EXPIRY_MS = IP_WINDOW_MS;

/**
 * PocketBase stores dates as text in its own format, `2026-09-23 21:38:00.000Z`, and a filter
 * compares them as text. A JS ISO string (`…T21:38…`) silently matches nothing (how-why §5.7), so
 * every date that goes into a filter or a query passes through here.
 */
function pbDate(ms) {
  return new Date(ms).toISOString().replace('T', ' ');
}

/** The inverse, for a DateTime field read back from a record. */
function msOf(record, field) {
  const s = record.getDateTime(field).string();
  if (!s) return 0;
  return new Date(s.replace(' ', 'T')).getTime();
}

/** `salt$hmac` — the code is never stored in the clear (§15). */
function hashCode(code) {
  const salt = $security.randomString(16);
  return `${salt}$${$security.hs256(code, salt)}`;
}

/** Constant-time: `$security.equal` is PocketBase's wrapper over crypto/subtle. */
function codeMatches(stored, code) {
  const i = stored.indexOf('$');
  if (i <= 0) return false;
  const salt = stored.slice(0, i);
  const hash = stored.slice(i + 1);
  return $security.equal(hash, $security.hs256(code, salt));
}

/**
 * Seconds until `field = value` may have another code: 0 while fewer than `limit` rows were
 * created within the window, else the time until the oldest of them ages out — that is the one
 * whose leaving frees a slot.
 */
function secondsUntilFree(app, field, value, limit, windowMs, nowMs) {
  const rows = app.findRecordsByFilter(
    'otp_codes',
    `${field} = {:value} && created > {:since}`,
    'created',
    0,
    0,
    { value: value, since: pbDate(nowMs - windowMs) },
  );
  if (rows.length < limit) return 0;
  const oldest = msOf(rows[rows.length - limit], 'created');
  return Math.max(1, Math.ceil((oldest + windowMs - nowMs) / 1000));
}

/** Throws RATE_LIMITED with `retryAfter` (seconds) when the limit is already reached. */
function enforceLimit(app, field, value, limit, windowMs, nowMs) {
  const retryAfter = secondsUntilFree(app, field, value, limit, windowMs, nowMs);
  if (retryAfter === 0) return;
  throw new AppError(
    CODES.RATE_LIMITED,
    `too many codes for this ${field}`,
    429,
    { field: field },
    { retryAfter: retryAfter },
  );
}

/** The most recent code row for a phone, or null. Only the latest code is ever accepted. */
function latestFor(app, phone) {
  const rows = app.findRecordsByFilter('otp_codes', 'phone = {:phone}', '-created', 1, 0, {
    phone: phone,
  });
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Spends one attempt atomically: the UPDATE only succeeds while attempts < MAX_ATTEMPTS, so two
 * concurrent guesses cannot both slip under the limit. Returns false when the code is locked.
 */
function spendAttempt(app, id) {
  const result = app
    .db()
    .newQuery('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = {:id} AND attempts < {:max}')
    .bind({ id: id, max: MAX_ATTEMPTS })
    .execute();
  return result.rowsAffected() === 1;
}

/**
 * A used code is burnt, not deleted: deleting it would give the phone its rate-limit slot back.
 * Expiring it now makes a replay answer OTP_EXPIRED; the purge still waits an hour past this.
 */
function burn(app, id, nowMs) {
  app
    .db()
    .newQuery('UPDATE otp_codes SET attempts = {:max}, expiresAt = {:now} WHERE id = {:id}')
    .bind({ id: id, max: MAX_ATTEMPTS, now: pbDate(nowMs) })
    .execute();
}

/** @returns {number} rows deleted */
function purge(app, nowMs) {
  const result = app
    .db()
    .newQuery('DELETE FROM otp_codes WHERE expiresAt < {:cutoff}')
    .bind({ cutoff: pbDate(nowMs - PURGE_AFTER_EXPIRY_MS) })
    .execute();
  return result.rowsAffected();
}

module.exports = {
  EXPIRY_MS,
  MAX_ATTEMPTS,
  PHONE_LIMIT,
  PHONE_WINDOW_MS,
  IP_LIMIT,
  IP_WINDOW_MS,
  PURGE_AFTER_EXPIRY_MS,
  pbDate,
  msOf,
  hashCode,
  codeMatches,
  secondsUntilFree,
  enforceLimit,
  latestFor,
  spendAttempt,
  burn,
  purge,
};
