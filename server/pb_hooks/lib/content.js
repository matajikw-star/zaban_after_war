/// <reference path="../../pb_data/types.d.ts" />

// The content packages on disk (what.md §6.2, §8.2; ticket dev-payment/01). `pnpm content:build`
// writes `server/content/{paid,manifest}.json`; the deploy ships them to CONTENT_DIR
// (/opt/kl/content). The free package is not here: it is part of the web build.

const env = require(`${__hooks}/lib/env.js`);
const { AppError, CODES } = require(`${__hooks}/lib/errors.js`);

/** what.md §8.2, §15: the paid file, 20 fetches per user per rolling day. */
const DAILY_DOWNLOADS = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

const PAID_FILE = 'paid.json';
const MANIFEST_FILE = 'manifest.json';

function dir() {
  return env.get('CONTENT_DIR').replace(/\/+$/, '');
}

function pbDate(ms) {
  return new Date(ms).toISOString().replace('T', ' ');
}

/**
 * `{free: {version, hash, bytes}, paid: {version, hash, bytes}}` as the build wrote it.
 * @throws INTERNAL when the file is missing or unreadable — a deploy fault, not a client one
 */
function manifest() {
  let text;
  try {
    text = toString($os.readFile(`${dir()}/${MANIFEST_FILE}`));
  } catch (_err) {
    throw new AppError(CODES.INTERNAL, `no ${MANIFEST_FILE} in CONTENT_DIR`);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (_err) {
    throw new AppError(CODES.INTERNAL, `${MANIFEST_FILE} is not valid JSON`);
  }
  const pick = (entry) =>
    entry && typeof entry === 'object'
      ? { version: String(entry.version), hash: String(entry.hash), bytes: Number(entry.bytes) }
      : null;
  const out = { free: pick(parsed.free), paid: pick(parsed.paid) };
  if (!out.free || !out.paid) throw new AppError(CODES.INTERNAL, `${MANIFEST_FILE} is incomplete`);
  return out;
}

/** @throws INTERNAL when paid.json is not on disk */
function requirePaidFile() {
  try {
    $os.stat(`${dir()}/${PAID_FILE}`);
  } catch (_err) {
    throw new AppError(CODES.INTERNAL, `no ${PAID_FILE} in CONTENT_DIR`);
  }
}

/** Throws RATE_LIMITED + retryAfter once the user has fetched the paid file 20 times today. */
function enforceDailyCap(app, userId, nowMs) {
  const rows = app.findRecordsByFilter(
    'content_downloads',
    'user = {:user} && created > {:since}',
    'created',
    0,
    0,
    { user: userId, since: pbDate(nowMs - DAY_MS) },
  );
  if (rows.length < DAILY_DOWNLOADS) return;

  const oldest = rows[rows.length - DAILY_DOWNLOADS].getDateTime('created').string();
  const oldestMs = new Date(oldest.replace(' ', 'T')).getTime();
  const retryAfter = Math.max(1, Math.ceil((oldestMs + DAY_MS - nowMs) / 1000));
  throw new AppError(
    CODES.RATE_LIMITED,
    'too many downloads of the paid package today',
    429,
    { userId: userId },
    { retryAfter: retryAfter },
  );
}

/** One row per fetch served — the cap's count and the owner's evidence (ADR-0004). */
function recordDownload(app, userId, version, range) {
  const row = new Record(app.findCollectionByNameOrId('content_downloads'));
  row.set('user', userId);
  row.set('packageId', 'paid');
  row.set('version', version || '');
  row.set('range', String(range || '').slice(0, 64));
  app.save(row);
}

module.exports = {
  dir,
  manifest,
  requirePaidFile,
  enforceDailyCap,
  recordDownload,
  DAILY_DOWNLOADS,
  PAID_FILE,
};
