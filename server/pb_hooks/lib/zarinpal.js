/// <reference path="../../pb_data/types.d.ts" />

// The payment gateway (what.md §8.2, §8.3; ticket dev-payment/01). Two providers behind one set of
// functions, chosen by ZARINPAL_PROVIDER at call time:
//
//   zarinpal — Zarinpal REST v4 at env.zarinpalBase(): the sandbox or the live host by
//              ZARINPAL_SANDBOX, or ZARINPAL_API_BASE when set (tests point it at a local stub —
//              never the real Zarinpal from a test). Amounts are toman, sent with
//              `currency: "IRT"` on both request and verify, so no merchant-panel setting matters.
//   mock     — no network. `request` hands back a gateway URL that is our own callback with
//              Status=OK, and `verify` always succeeds. CI and e2e only; lib/env.js reports it as
//              a problem on a production origin.
//
// Zarinpal v4, as this module uses it (field names from Zarinpal's public v4 docs — see how-why
// §5.14 for which of them were not verifiable against a live account when this was written):
//
//   POST /pg/v4/payment/request.json   {merchant_id, amount, currency, description, callback_url,
//                                       metadata: {mobile, order_id}}
//        → {data: {code: 100, authority, fee_type, fee}, errors: []}
//   GET  /pg/StartPay/<authority>      the page the user pays on
//   POST /pg/v4/payment/verify.json    {merchant_id, amount, currency, authority}
//        → {data: {code: 100 | 101, ref_id, card_pan, card_hash, fee}, errors: []}
//        on failure → {data: [], errors: {code: -50 | -51 | …, message}}
//   POST /pg/v4/payment/unVerified.json {merchant_id}
//        → {data: {code: 100, authorities: [{authority, amount, callback_url, date}]}}
//
// The amount check is Zarinpal's: verify is called with the payable stored on our payment row, and
// Zarinpal answers -50 when that differs from what the user actually paid. Nothing here ever takes
// an amount from a request, a callback query string, or the unverified list.
//
// The merchant id is never logged.

const env = require(`${__hooks}/lib/env.js`);
const { AppError, CODES } = require(`${__hooks}/lib/errors.js`);

const PROVIDERS = ['zarinpal', 'mock'];

const CURRENCY = 'IRT';

/** What the user sees on Zarinpal's page. The gateway page is Persian; so is this. */
const DESCRIPTION = 'خرید نسخهٔ کامل واژه‌های کنکور';

const TIMEOUT_SECONDS = 15;

const PATHS = {
  request: '/pg/v4/payment/request.json',
  verify: '/pg/v4/payment/verify.json',
  unverified: '/pg/v4/payment/unVerified.json',
  startPay: '/pg/StartPay/',
};

/**
 * Verify answers, by Zarinpal code. 100 = verified now, 101 = verified before (a replay). -50 is
 * the amount mismatch. -51 (not paid / session not active), -53 (not this merchant's session) and
 * -54 (invalid authority) all mean this authority will never become money. Every other code — a
 * validation error, a terminal problem, a rate limit — says nothing about the user's payment, so
 * the payment is left as it was for the next callback or the reconcile cron.
 */
const NOT_PAID_CODES = [-51, -53, -54];
const AMOUNT_MISMATCH_CODE = -50;

/** @returns {'zarinpal'|'mock'} */
function providerName() {
  const name = env.get('ZARINPAL_PROVIDER');
  if (PROVIDERS.indexOf(name) === -1) {
    throw new AppError(
      CODES.GATEWAY_FAILED,
      `ZARINPAL_PROVIDER=${name} is not a known provider`,
      500,
    );
  }
  return name;
}

/** `{data, errors}` → the Zarinpal code, from whichever half carries it. */
function codeOf(json) {
  if (typeof json?.data?.code === 'number') return json.data.code;
  if (typeof json?.errors?.code === 'number') return json.errors.code;
  return null;
}

/**
 * One POST to Zarinpal. Never throws for an HTTP or Zarinpal error — those are answers — only
 * returns `{ok: false, transport: true}` when nothing came back at all.
 */
function post(app, name, path, body) {
  let res;
  try {
    res = $http.send({
      url: `${env.zarinpalBase()}${path}`,
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      timeout: TIMEOUT_SECONDS,
    });
  } catch (err) {
    app.logger().error('zarinpal', 'call', name, 'status', 0, 'err', String(err?.message || err));
    return { transport: true, httpStatus: 0, json: null, code: null };
  }

  const json = res.json || null;
  const code = codeOf(json);
  const level = code === 100 || code === 101 ? 'info' : 'warn';
  app.logger()[level]('zarinpal', 'call', name, 'httpStatus', res.statusCode, 'code', code);
  return { transport: false, httpStatus: res.statusCode, json: json, code: code };
}

/** A random authority for the mock gateway: recognisable, and never a real Zarinpal one. */
function mockAuthority() {
  return `MOCK${$security.randomStringWithAlphabet(32, '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ')}`;
}

/**
 * Ask the gateway for a payment session.
 *
 * @param {core.App} app
 * @param {{amount: number, paymentId: string, mobile: string}} input  amount in toman
 * @returns {{authority: string, gatewayUrl: string, raw: object}}
 * @throws GATEWAY_FAILED (502) when no authority came back
 */
function request(app, input) {
  const callbackUrl = env.get('ZARINPAL_CALLBACK_URL');

  if (providerName() === 'mock') {
    const authority = mockAuthority();
    app.logger().warn('zarinpal', 'call', 'request', 'provider', 'mock', 'amount', input.amount);
    return {
      authority: authority,
      gatewayUrl: `${callbackUrl}?Authority=${encodeURIComponent(authority)}&Status=OK`,
      raw: { provider: 'mock', authority: authority },
    };
  }

  const merchantId = env.get('ZARINPAL_MERCHANT_ID');
  if (!merchantId) throw new AppError(CODES.GATEWAY_FAILED, 'ZARINPAL_MERCHANT_ID is not set', 500);

  const metadata = { order_id: input.paymentId };
  if (input.mobile) metadata.mobile = input.mobile;

  const answer = post(app, 'request', PATHS.request, {
    merchant_id: merchantId,
    amount: input.amount,
    currency: CURRENCY,
    description: DESCRIPTION,
    callback_url: callbackUrl,
    metadata: metadata,
  });

  const data = answer.json?.data || null;
  if (answer.code !== 100 || !data || typeof data.authority !== 'string' || !data.authority) {
    throw new AppError(
      CODES.GATEWAY_FAILED,
      answer.transport ? 'zarinpal unreachable' : `zarinpal request answered ${answer.code}`,
      502,
      { httpStatus: answer.httpStatus, code: answer.code },
    );
  }

  return {
    authority: data.authority,
    gatewayUrl: `${env.zarinpalBase()}${PATHS.startPay}${encodeURIComponent(data.authority)}`,
    raw: answer.json,
  };
}

/**
 * Verify one authority for the amount we stored.
 *
 * @returns {{outcome: 'paid'|'mismatch'|'not_paid'|'error', code: number|null, refId: string,
 *            cardPan: string, raw: object|null}}
 *   `paid` covers both 100 and 101 (already verified): the caller's own state decides whether a
 *   101 is a replay or the first time this server has heard of it.
 */
function verify(app, input) {
  if (providerName() === 'mock') {
    app.logger().warn('zarinpal', 'call', 'verify', 'provider', 'mock', 'amount', input.amount);
    return {
      outcome: 'paid',
      code: 100,
      refId: `MOCK-${$security.randomStringWithAlphabet(10, '0123456789')}`,
      cardPan: '000000******0000',
      raw: { provider: 'mock' },
    };
  }

  const merchantId = env.get('ZARINPAL_MERCHANT_ID');
  if (!merchantId) {
    app.logger().error('zarinpal', 'call', 'verify', 'err', 'ZARINPAL_MERCHANT_ID is not set');
    return { outcome: 'error', code: null, refId: '', cardPan: '', raw: null };
  }

  const answer = post(app, 'verify', PATHS.verify, {
    merchant_id: merchantId,
    amount: input.amount,
    currency: CURRENCY,
    authority: input.authority,
  });

  const data = answer.json?.data || {};
  let outcome = 'error';
  if (answer.code === 100 || answer.code === 101) outcome = 'paid';
  else if (answer.code === AMOUNT_MISMATCH_CODE) outcome = 'mismatch';
  else if (NOT_PAID_CODES.indexOf(answer.code) !== -1) outcome = 'not_paid';

  return {
    outcome: outcome,
    code: answer.code,
    refId: data.ref_id !== undefined && data.ref_id !== null ? String(data.ref_id) : '',
    cardPan: typeof data.card_pan === 'string' ? data.card_pan : '',
    raw: answer.json,
  };
}

/**
 * Authorities Zarinpal holds as paid but never verified — a user who closed the browser during
 * the redirect back. The mock gateway has none.
 *
 * @returns {string[]} authorities
 * @throws GATEWAY_FAILED when the list could not be read
 */
function unverified(app) {
  if (providerName() === 'mock') return [];

  const merchantId = env.get('ZARINPAL_MERCHANT_ID');
  if (!merchantId) throw new AppError(CODES.GATEWAY_FAILED, 'ZARINPAL_MERCHANT_ID is not set', 500);

  const answer = post(app, 'unverified', PATHS.unverified, { merchant_id: merchantId });
  const data = answer.json?.data || null;
  if (answer.code !== 100 || !data) {
    throw new AppError(
      CODES.GATEWAY_FAILED,
      answer.transport ? 'zarinpal unreachable' : `zarinpal unVerified answered ${answer.code}`,
      502,
    );
  }

  const list = Array.isArray(data.authorities) ? data.authorities : [];
  const out = [];
  for (const item of list) {
    if (item && typeof item.authority === 'string' && item.authority) out.push(item.authority);
  }
  return out;
}

module.exports = {
  providerName,
  request,
  verify,
  unverified,
  PROVIDERS,
  CURRENCY,
  PATHS,
  NOT_PAID_CODES,
  AMOUNT_MISMATCH_CODE,
};
