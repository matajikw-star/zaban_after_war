/// <reference path="../../pb_data/types.d.ts" />

// Configuration, read from the environment only (constitution §5; what.md §18).
// `/opt/kl/.env` is loaded by systemd through EnvironmentFile; nothing here ever reads a file.
//
// The rule: a missing value is a warning at startup, never a crash. A server that refuses to boot
// because the S3 key is absent is a server that cannot serve the study loop either, and the study
// loop is the part that must not break.

/** Names that have a safe default. The default is what .env.example documents. */
const DEFAULTS = {
  SMS_PROVIDER: 'kavenegar',
  SMS_OTP_TEMPLATE: 'kl-otp',
  ZARINPAL_SANDBOX: '0',
  ZARINPAL_CALLBACK_URL: 'https://app.konkurleitner.com/api/pay/callback',
  PUBLIC_APP_ORIGIN: 'https://app.konkurleitner.com',
  CONTENT_DIR: '/opt/kl/content',
  SOURCEMAP_DIR: '/opt/kl/sourcemaps',
  BACKUP_S3_BUCKET: 'kl-backups',
};

/** Secrets with no possible default. Missing → one warning line each at startup. */
const REQUIRED = [
  'SMS_API_KEY',
  'ZARINPAL_MERCHANT_ID',
  'BACKUP_S3_ENDPOINT',
  'BACKUP_S3_KEY',
  'BACKUP_S3_SECRET',
];

/** Names whose value is constrained. */
const ENUMS = {
  SMS_PROVIDER: ['kavenegar', 'console', 'mock'],
  ZARINPAL_SANDBOX: ['0', '1'],
};

/** @returns {string} the environment value, the documented default, or ''. */
function get(name) {
  const raw = $os.getenv(name);
  if (raw !== '' && raw !== undefined && raw !== null) return raw;
  return DEFAULTS[name] !== undefined ? DEFAULTS[name] : '';
}

/** @returns {boolean} */
function bool(name) {
  const v = get(name);
  return v === '1' || v === 'true';
}

/**
 * True when SMS_PROVIDER is `console`: the OTP code is printed to the log instead of sent.
 * Used by the e2e and API suites, and never by the VPS.
 */
function isConsoleSms() {
  return get('SMS_PROVIDER') === 'console';
}

/**
 * Check the environment once at boot and say — in the log, where an agent debugging from logs
 * will find it — exactly what is missing or wrong. Returns the list of problems so a test can
 * assert on it.
 *
 * @param {core.App} app
 * @returns {string[]}
 */
function check(app) {
  const problems = [];

  for (const name of REQUIRED) {
    if ($os.getenv(name) === '') problems.push(`missing ${name}`);
  }

  for (const name of Object.keys(ENUMS)) {
    const value = get(name);
    if (ENUMS[name].indexOf(value) === -1) {
      problems.push(`invalid ${name}=${value}`);
    }
  }

  // The console SMS provider must never be what a real phone is authenticated against.
  if (isConsoleSms() && get('PUBLIC_APP_ORIGIN').indexOf('konkurleitner.com') !== -1) {
    problems.push('SMS_PROVIDER=console on a production origin');
  }

  // `mock` on the real origin is allowed — it is what staging runs until the SMS account is
  // verified — but it means every phone logs in with 123456, so it is said at every boot.
  if (
    get('SMS_PROVIDER') === 'mock' &&
    get('PUBLIC_APP_ORIGIN').indexOf('konkurleitner.com') !== -1
  ) {
    problems.push('SMS_PROVIDER=mock on a production origin: every phone logs in with 123456');
  }

  if (problems.length === 0) {
    app
      .logger()
      .info('env.ok', 'provider', get('SMS_PROVIDER'), 'origin', get('PUBLIC_APP_ORIGIN'));
  } else {
    for (const problem of problems) {
      app.logger().warn('env.problem', 'problem', problem);
    }
  }

  return problems;
}

module.exports = { get, bool, isConsoleSms, check, DEFAULTS, REQUIRED, ENUMS };
