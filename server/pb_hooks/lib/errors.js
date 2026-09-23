/// <reference path="../../pb_data/types.d.ts" />

// AppError — the one error type our routes throw (what.md §17.4: "errors carry codes").
//
// A CommonJS module, because the PocketBase JSVM (goja) supports nothing else, and written with
// a constructor function rather than `class` so it behaves the same in every goja build.

/** The stable set of codes a client may switch on. Adding one is a change to what.md. */
const CODES = {
  BAD_INPUT: 'BAD_INPUT',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',
  // OTP (what.md §8.2, §15). The client switches on each of these.
  PHONE_INVALID: 'PHONE_INVALID',
  OTP_WRONG: 'OTP_WRONG',
  OTP_EXPIRED: 'OTP_EXPIRED',
  OTP_LOCKED: 'OTP_LOCKED',
  SMS_FAILED: 'SMS_FAILED',
  SMS_PROVIDER_UNKNOWN: 'SMS_PROVIDER_UNKNOWN',
};

/** The HTTP status each code answers with unless the thrower says otherwise. */
const STATUS_BY_CODE = {
  BAD_INPUT: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  PHONE_INVALID: 400,
  OTP_WRONG: 400,
  OTP_EXPIRED: 400,
  OTP_LOCKED: 400,
  SMS_FAILED: 502,
  SMS_PROVIDER_UNKNOWN: 500,
};

/**
 * @param {string} code    one of CODES
 * @param {string} message human-readable, English, safe to log
 * @param {number} [status] HTTP status; defaults to the code's own
 * @param {any}    [data]   extra context for the log line, never sent to the client
 * @param {object} [pub]    extra top-level fields the client DOES see, next to `error`
 *                          (`retryAfter` on a 429, `attemptsLeft` on OTP_WRONG). Flat numbers only.
 */
function AppError(code, message, status, data, pub) {
  const base = Error.call(this, message || code);
  this.name = 'AppError';
  this.message = message || code;
  this.code = code || CODES.INTERNAL;
  this.status = status || STATUS_BY_CODE[this.code] || 500;
  this.data = data;
  this.pub = pub || null;
  // Modules are re-required per isolated handler context, so `instanceof` across a module
  // boundary is not something to rely on. This flag is.
  this.isAppError = true;
  this.stack = base.stack;
}

AppError.prototype = Object.create(Error.prototype);
AppError.prototype.constructor = AppError;

function isAppError(err) {
  return !!err && err.isAppError === true;
}

module.exports = { AppError, CODES, STATUS_BY_CODE, isAppError };
