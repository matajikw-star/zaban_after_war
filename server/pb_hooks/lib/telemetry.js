/// <reference path="../../pb_data/types.d.ts" />

// Shared rules for the three telemetry routes — flags, beacon, client-errors (what.md §8.2,
// §8.4, §10.1, §15; ticket dev-server/04). None of them ever blocks the study loop: a caller
// that is over its cap gets RATE_LIMITED and drops the item; nothing here can throw INTERNAL for
// a well-formed request.
//
// Caps are rolling 24h windows keyed on installId, the same shape as otp.js's phone/IP limits —
// not calendar days, so there is no midnight cliff a burst of installs could pile up on.

const { AppError, CODES } = require(`${__hooks}/lib/errors.js`);

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** what.md §8.2. */
const FLAGS_DAILY_CAP = 50;
/** what.md §8.2. */
const CLIENT_ERRORS_DAILY_CAP = 30;
/**
 * what.md §8.2 states no number for beacons (only "unknown names rejected"). Decision (ticket
 * dev-server/04, see the ticket's Comments): 200 rows/install/day is generous for the 13 fixed
 * names of §8.4 even on a very active day, and still bounds abuse. A single call is capped
 * separately so one oversized batch cannot consume the whole day's quota in one request.
 */
const BEACON_DAILY_CAP = 200;
const BEACON_MAX_EVENTS_PER_CALL = 20;

/** `GET /api/admin/sourcemap/{sha}/{file}`: strict allow-lists, checked before any path is built. */
const SHA_RE = /^[0-9a-f]{7,40}$/;
const FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.map$/;

/** The fixed list of what.md §8.4. Adding one is a change to what.md and to this list together. */
const BEACON_NAMES = [
  'first_open',
  'onboarding_done',
  'first_review',
  'reviews_10',
  'reviews_100',
  'paywall_shown',
  'login_done',
  'purchase_started',
  'purchase_done',
  'download_done',
  'install_prompt_shown',
  'install_prompt_accepted',
  'season_shown',
];

/**
 * PocketBase stores dates as text in its own format and a filter compares them as text — a JS
 * ISO string (`…T21:38…`) silently matches nothing (how-why §5.7). Kept local rather than
 * imported from otp.js: each *.pb.js file is re-required in its own isolated context, and these
 * two functions are five lines with no behaviour of their own to drift from otp.js's.
 */
function pbDate(ms) {
  return new Date(ms).toISOString().replace('T', ' ');
}

function msOf(record, field) {
  const s = record.getDateTime(field).string();
  if (!s) return 0;
  return new Date(s.replace(' ', 'T')).getTime();
}

/** How many rows this install has written to `collection` in the last `windowMs`. */
function countSince(app, collection, installId, windowMs, nowMs) {
  return app.findRecordsByFilter(
    collection,
    'installId = {:installId} && created > {:since}',
    '',
    0,
    0,
    { installId: installId, since: pbDate(nowMs - windowMs) },
  ).length;
}

/** Seconds until installId may write to `collection` again, 0 if it is under `limit` already. */
function secondsUntilFree(app, collection, installId, limit, windowMs, nowMs) {
  const rows = app.findRecordsByFilter(
    collection,
    'installId = {:installId} && created > {:since}',
    'created',
    0,
    0,
    { installId: installId, since: pbDate(nowMs - windowMs) },
  );
  if (rows.length < limit) return 0;
  const oldest = msOf(rows[rows.length - limit], 'created');
  return Math.max(1, Math.ceil((oldest + windowMs - nowMs) / 1000));
}

/** Throws RATE_LIMITED with `retryAfter` once installId already holds `limit` rows today. */
function enforceDailyCap(app, collection, installId, limit, nowMs) {
  const retryAfter = secondsUntilFree(app, collection, installId, limit, DAY_MS, nowMs);
  if (retryAfter === 0) return;
  throw new AppError(
    CODES.RATE_LIMITED,
    `too many ${collection} for this install today`,
    429,
    { installId: installId },
    { retryAfter: retryAfter },
  );
}

/**
 * One beacon event. Throws BAD_INPUT naming its index — the whole call is rejected rather than
 * skipping the bad one, same reasoning as sync.js's cleanEvent: our own client minted it.
 */
function cleanBeaconEvent(raw, index) {
  const bad = (why) => new AppError(CODES.BAD_INPUT, `events[${index}]: ${why}`);

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw bad('not an object');
  if (typeof raw.name !== 'string' || BEACON_NAMES.indexOf(raw.name) === -1) {
    throw bad('unknown beacon name');
  }
  if (typeof raw.at !== 'number' || !Number.isSafeInteger(raw.at) || raw.at < 0) {
    throw bad('at must be a non-negative integer (epoch ms)');
  }
  if (
    raw.appVersion !== undefined &&
    (typeof raw.appVersion !== 'string' || raw.appVersion.length > 32)
  ) {
    throw bad('appVersion must be a string of at most 32 characters');
  }

  return { name: raw.name, at: raw.at, appVersion: raw.appVersion || '' };
}

/**
 * The most recent `client_errors` row for this install and fingerprint within the last hour, or
 * null. §8.2: "same fingerprint within an hour increments count instead of inserting."
 */
function findRecentDuplicate(app, installId, fingerprint, nowMs) {
  const rows = app.findRecordsByFilter(
    'client_errors',
    'installId = {:installId} && fingerprint = {:fingerprint} && created > {:since}',
    '-created',
    1,
    0,
    { installId: installId, fingerprint: fingerprint, since: pbDate(nowMs - HOUR_MS) },
  );
  return rows.length > 0 ? rows[0] : null;
}

module.exports = {
  DAY_MS,
  HOUR_MS,
  FLAGS_DAILY_CAP,
  CLIENT_ERRORS_DAILY_CAP,
  BEACON_DAILY_CAP,
  BEACON_MAX_EVENTS_PER_CALL,
  BEACON_NAMES,
  SHA_RE,
  FILE_RE,
  pbDate,
  msOf,
  countSince,
  secondsUntilFree,
  enforceDailyCap,
  cleanBeaconEvent,
  findRecentDuplicate,
};
