/// <reference path="../../pb_data/types.d.ts" />

// The SMS provider interface (what.md §8.2, ticket dev-server/02). One function per provider, all
// with the same signature, chosen by SMS_PROVIDER at request time:
//
//   kavenegar — Kavenegar's Verify Lookup with SMS_API_KEY and SMS_OTP_TEMPLATE. Production.
//   console   — sends nothing, prints the code to stdout and the log. Tests and local dev only.
//   mock      — sends nothing, and the code is always 123456. What the staging deploy runs while
//               the owner's Kavenegar account can only text the owner (identity verification).
//
// An unknown name is an error at request time (SMS_PROVIDER_UNKNOWN), never a silent fallback to
// another provider: a typo in /opt/kl/.env must not quietly turn production into `mock`.
//
// Every send logs one `sms.send` line with the provider, its status and reference — never the API
// key, never the full phone, and the code only under `console`.

const { AppError, CODES } = require(`${__hooks}/lib/errors.js`);
const env = require(`${__hooks}/lib/env.js`);
const { toLocal } = require(`${__hooks}/lib/phone.js`);
const { maskPhone } = require(`${__hooks}/lib/route.js`);

const PROVIDERS = ['kavenegar', 'console', 'mock'];

/** The mock provider's fixed code. Six digits, so it can never collide with a real 5-digit one. */
const MOCK_CODE = '123456';

/** Real codes (what.md §8.2). */
const CODE_LENGTH = 5;

const KAVENEGAR_TIMEOUT_SECONDS = 10;

/** @returns {string} the configured provider name; throws SMS_PROVIDER_UNKNOWN otherwise. */
function providerName() {
  const name = env.get('SMS_PROVIDER');
  if (PROVIDERS.indexOf(name) === -1) {
    throw new AppError(CODES.SMS_PROVIDER_UNKNOWN, `SMS_PROVIDER=${name} is not a known provider`);
  }
  return name;
}

/** The code to hand the user. `$security.randomStringWithAlphabet` draws from crypto/rand. */
function newCode(provider) {
  if (provider === 'mock') return MOCK_CODE;
  return $security.randomStringWithAlphabet(CODE_LENGTH, '0123456789');
}

/** Removes every form of the API key (raw and URL-encoded) from a string bound for the log. */
function redactKey(text, apiKey) {
  if (!apiKey) return text;
  return text.split(encodeURIComponent(apiKey)).join('***').split(apiKey).join('***');
}

function sendKavenegar(app, phone, code) {
  const apiKey = env.get('SMS_API_KEY');
  const template = env.get('SMS_OTP_TEMPLATE');
  if (!apiKey) {
    throw new AppError(CODES.SMS_FAILED, 'SMS_API_KEY is not set');
  }

  // https://kavenegar.com/rest.html#sms-Lookup — the key is part of the path, which is why the
  // URL is never logged.
  const url = `${env.get('SMS_API_BASE')}/v1/${encodeURIComponent(apiKey)}/verify/lookup.json`;
  const body =
    `receptor=${encodeURIComponent(toLocal(phone))}` +
    `&token=${encodeURIComponent(code)}` +
    `&template=${encodeURIComponent(template)}`;

  let res;
  try {
    res = $http.send({
      url: url,
      method: 'POST',
      body: body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: KAVENEGAR_TIMEOUT_SECONDS,
    });
  } catch (err) {
    app.logger().error('sms.send', 'provider', 'kavenegar', 'phone', maskPhone(phone), 'status', 0);
    // Go's transport errors quote the full URL (`Post "https://…/<key>/verify/…": …`), so the key
    // is cut out before the message reaches the log.
    throw new AppError(CODES.SMS_FAILED, 'kavenegar unreachable', 502, {
      cause: redactKey(String(err?.message || err), apiKey),
    });
  }

  // Kavenegar answers { return: { status, message }, entries: [{ messageid, ... }] }. Its own
  // `return.status` is the verdict; 200 is the only success.
  const json = res.json || {};
  const providerStatus = json.return ? json.return.status : res.statusCode;
  const entry = json.entries?.[0] ? json.entries[0] : null;
  const ref = entry ? String(entry.messageid) : '';

  if (res.statusCode !== 200 || providerStatus !== 200) {
    app
      .logger()
      .error(
        'sms.send',
        'provider',
        'kavenegar',
        'phone',
        maskPhone(phone),
        'status',
        providerStatus,
        'httpStatus',
        res.statusCode,
      );
    throw new AppError(CODES.SMS_FAILED, `kavenegar answered ${providerStatus}`, 502);
  }

  app
    .logger()
    .info(
      'sms.send',
      'provider',
      'kavenegar',
      'phone',
      maskPhone(phone),
      'status',
      200,
      'ref',
      ref,
    );
  return { ref: ref };
}

function sendConsole(app, phone, code) {
  // stdout for a human or a test harness reading the process output; the log for the admin UI.
  console.log(`sms.console phone=${maskPhone(phone)} code=${code}`);
  app.logger().info('sms.send', 'provider', 'console', 'phone', maskPhone(phone), 'code', code);
  return { ref: 'console' };
}

function sendMock(app, phone) {
  app
    .logger()
    .warn('sms.send', 'provider', 'mock', 'sms.provider', 'mock', 'phone', maskPhone(phone));
  return { ref: 'mock' };
}

/**
 * @param {core.App} app
 * @param {string} provider one of PROVIDERS (from providerName())
 * @param {string} phone    E.164
 * @param {string} code
 * @returns {{ref: string}}
 */
function send(app, provider, phone, code) {
  if (provider === 'kavenegar') return sendKavenegar(app, phone, code);
  if (provider === 'console') return sendConsole(app, phone, code);
  if (provider === 'mock') return sendMock(app, phone);
  throw new AppError(
    CODES.SMS_PROVIDER_UNKNOWN,
    `SMS_PROVIDER=${provider} is not a known provider`,
  );
}

module.exports = { providerName, newCode, send, redactKey, PROVIDERS, MOCK_CODE, CODE_LENGTH };
