/// <reference path="../../pb_data/types.d.ts" />

// Payment rules (what.md §8.3; ticket dev-payment/01). Everything that decides money or access
// lives here, so the routes in pay.pb.js / content.pb.js and the crons in cron.pb.js are thin.
//
// The invariants this file holds:
//   - While SMS_PROVIDER=mock every payment route and the paid download refuse first, before
//     auth or body (`guard`, PAYMENT_DISABLED_MOCK_SMS 503): under mock SMS anyone signs in as
//     anyone with 123456, so an account proves nothing.
//   - Prices come from `app_config` at request time; the client never sends an amount.
//   - Discount validation order is exactly: exists → active → not expired → usedCount < maxUses →
//     not already used by this user when perUserOnce → compute.
//   - A payment becomes `verified` once. The flip is a conditional UPDATE (`status != 'verified'`)
//     inside a transaction, and only the call that flips it creates the entitlement and counts the
//     code's use — so a replayed callback, a callback racing the reconcile cron, or Zarinpal's 101
//     can never grant twice or count a code twice. The unique (user, product) index on
//     `entitlements` is the database's own backstop.
//   - The amount is compared by Zarinpal: verify is sent the `payable` stored on our row, and a
//     mismatch (-50) fails the payment and logs an error.

const env = require(`${__hooks}/lib/env.js`);
const { AppError, CODES } = require(`${__hooks}/lib/errors.js`);
const { asciiDigits, toLocal } = require(`${__hooks}/lib/phone.js`);
const { readJsonField } = require(`${__hooks}/lib/route.js`);
const zarinpal = require(`${__hooks}/lib/zarinpal.js`);

/** A payment still `pending` this long after creation is marked `expired` by the cron. */
const PENDING_TTL_MS = 2 * 60 * 60 * 1000;

/** How far back the reconcile cron looks for payments it could still settle. */
const RECONCILE_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

/** The discount_codes.code field's own pattern (1758000000_init.js), plus its length cap. */
const CODE_PATTERN = /^[A-Z0-9_-]{1,32}$/;

/** Every codeStatus `quote` can return. `none` = no code was sent. */
const CODE_STATUSES = ['none', 'ok', 'invalid', 'expired', 'exhausted', 'used', 'already-entitled'];

/** Every failReason a payment can carry (payments.failReason, `?reason=` on the result URL). */
const FAIL_REASONS = ['cancelled', 'amount_mismatch', 'not_paid', 'gateway_error'];

function pbDate(ms) {
  return new Date(ms).toISOString().replace('T', ' ');
}

function msOfString(s) {
  if (!s) return 0;
  return new Date(String(s).replace(' ', 'T')).getTime();
}

// ---------------------------------------------------------------------------------------------
// the gate
// ---------------------------------------------------------------------------------------------

/** withRoute's `guard` for every /api/pay/* route and GET /api/content/paid. */
function guard() {
  if (env.isMockSms()) {
    throw new AppError(
      CODES.PAYMENT_DISABLED_MOCK_SMS,
      'payments and the paid download are disabled while SMS_PROVIDER=mock',
    );
  }
}

// ---------------------------------------------------------------------------------------------
// reads
// ---------------------------------------------------------------------------------------------

/** @returns {{listPrice: number, salePrice: number}} toman, from app_config right now */
function prices(app) {
  let record;
  try {
    record = app.findFirstRecordByFilter('app_config', "id != ''");
  } catch (_err) {
    throw new AppError(CODES.INTERNAL, 'app_config has no record');
  }
  return { listPrice: record.getInt('listPrice'), salePrice: record.getInt('salePrice') };
}

/** @returns {core.Record|null} the user's `full` entitlement */
function entitlementOf(app, userId) {
  try {
    return app.findFirstRecordByFilter('entitlements', 'user = {:user} && product = "full"', {
      user: userId,
    });
  } catch (_err) {
    return null;
  }
}

/** What the user typed → the stored form: ASCII digits, trimmed, uppercase. '' when absent. */
function normaliseCode(raw) {
  if (typeof raw !== 'string') return '';
  return asciiDigits(raw).trim().toUpperCase();
}

// ---------------------------------------------------------------------------------------------
// discount codes
// ---------------------------------------------------------------------------------------------

/**
 * §8.3's validation order, exactly. A code that is malformed, missing, inactive, or whose
 * type/value could not produce a price (a percent outside 1–100, a fixed amount below 1) is
 * `invalid` — the user is not told which. `maxUses` is a hard ceiling: 0 or blank means the code
 * is exhausted, never "unlimited". A blank `expiresAt` never expires.
 *
 * @returns {{status: string, record: core.Record|null}}
 */
function evaluateCode(app, userId, code, nowMs) {
  if (!CODE_PATTERN.test(code)) return { status: 'invalid', record: null };

  let record;
  try {
    record = app.findFirstRecordByData('discount_codes', 'code', code);
  } catch (_err) {
    return { status: 'invalid', record: null };
  }

  const type = record.getString('type');
  const value = record.getInt('value');
  const wellFormed =
    (type === 'percent' && value >= 1 && value <= 100) || (type === 'fixed' && value >= 1);
  if (!wellFormed) return { status: 'invalid', record: null };

  if (!record.getBool('active')) return { status: 'invalid', record: null };

  const expiresAt = msOfString(record.getDateTime('expiresAt').string());
  if (expiresAt && expiresAt <= nowMs) return { status: 'expired', record: null };

  if (record.getInt('usedCount') >= record.getInt('maxUses')) {
    return { status: 'exhausted', record: null };
  }

  if (record.getBool('perUserOnce')) {
    const used = app.findRecordsByFilter(
      'payments',
      'user = {:user} && discountCode = {:code} && status = "verified"',
      '',
      1,
      0,
      { user: userId, code: code },
    );
    if (used.length > 0) return { status: 'used', record: null };
  }

  return { status: 'ok', record: record };
}

/** Toman off the sale price. Rounded down, so a percent code never takes more than it says. */
function discountFor(record, salePrice) {
  const value = record.getInt('value');
  if (record.getString('type') === 'percent') return Math.floor((salePrice * value) / 100);
  return Math.min(value, salePrice);
}

/**
 * The price this user would pay right now, with this code.
 *
 * @returns {{listPrice, salePrice, discountAmount, payable, codeStatus, code}}
 *   `code` is the normalised code when codeStatus is `ok`, else null.
 */
function quote(app, userId, rawCode, nowMs) {
  const p = prices(app);
  const plain = (codeStatus) => ({
    listPrice: p.listPrice,
    salePrice: p.salePrice,
    discountAmount: 0,
    payable: p.salePrice,
    codeStatus: codeStatus,
    code: null,
  });

  if (entitlementOf(app, userId)) return plain('already-entitled');

  const code = normaliseCode(rawCode);
  if (!code) return plain('none');

  const verdict = evaluateCode(app, userId, code, nowMs);
  if (verdict.status !== 'ok') return plain(verdict.status);

  const discountAmount = discountFor(verdict.record, p.salePrice);
  return {
    listPrice: p.listPrice,
    salePrice: p.salePrice,
    discountAmount: discountAmount,
    payable: p.salePrice - discountAmount,
    codeStatus: 'ok',
    code: code,
  };
}

// ---------------------------------------------------------------------------------------------
// writes
// ---------------------------------------------------------------------------------------------

/**
 * Create the user's `full` entitlement unless one exists. Call inside a transaction.
 *
 * @returns {{record: core.Record, created: boolean}}
 */
function grant(tx, userId, source, paymentId, note, nowMs) {
  const existing = entitlementOf(tx, userId);
  if (existing) return { record: existing, created: false };

  const row = new Record(tx.findCollectionByNameOrId('entitlements'));
  row.set('user', userId);
  row.set('product', 'full');
  row.set('source', source);
  if (paymentId) row.set('payment', paymentId);
  row.set('grantedAt', pbDate(nowMs));
  row.set('note', note || '');
  tx.save(row);
  return { record: row, created: true };
}

/**
 * Take one use of `code` only if one is left: atomic, `usedCount < maxUses` in the UPDATE itself.
 * The 100 % grant path uses this — nothing has been paid, so a code with no use left is refused.
 *
 * @returns {boolean} true when the use was claimed
 */
function claimUse(tx, code) {
  return (
    tx
      .db()
      .newQuery(
        'UPDATE discount_codes SET usedCount = usedCount + 1 ' +
          'WHERE code = {:code} AND usedCount < maxUses',
      )
      .bind({ code: code })
      .execute()
      .rowsAffected() === 1
  );
}

/**
 * One more use of `code`, unconditionally. Atomic; a use past maxUses (two payments in flight on
 * a code's last use) is logged as `pay.code_over_limit`, never refused. The paid path uses this
 * on purpose: by the time it runs the user has paid the discounted price, so the discount is
 * honoured and the owner sees the overrun in the log. Contrast claimUse, for 100 % grants.
 */
function countUse(tx, app, code, paymentId) {
  if (!code) return;
  const result = tx
    .db()
    .newQuery('UPDATE discount_codes SET usedCount = usedCount + 1 WHERE code = {:code}')
    .bind({ code: code })
    .execute();
  if (result.rowsAffected() !== 1) {
    app.logger().warn('pay.code_missing', 'paymentId', paymentId, 'discountCode', code);
    return;
  }
  const record = tx.findFirstRecordByData('discount_codes', 'code', code);
  if (record.getInt('usedCount') > record.getInt('maxUses')) {
    app
      .logger()
      .warn(
        'pay.code_over_limit',
        'paymentId',
        paymentId,
        'discountCode',
        code,
        'usedCount',
        record.getInt('usedCount'),
      );
  }
}

function newPayment(app, userId, q, nowMs) {
  const row = new Record(app.findCollectionByNameOrId('payments'));
  row.set('user', userId);
  row.set('listPrice', q.listPrice);
  row.set('salePrice', q.salePrice);
  row.set('discountCode', q.code || '');
  row.set('discountAmount', q.discountAmount);
  row.set('payable', q.payable);
  row.set('status', 'pending');
  row.set('expiresAt', pbDate(nowMs + PENDING_TTL_MS));
  return row;
}

/**
 * POST /api/pay/request. Prices are re-quoted here, never taken from the client.
 *
 * @param {core.Record} user
 * @returns {{paymentId, gatewayUrl}} or {{paymentId, granted: true}} for a payable of 0
 */
function requestPayment(app, user, rawCode, nowMs) {
  const q = quote(app, user.id, rawCode, nowMs);

  if (q.codeStatus === 'already-entitled') {
    throw new AppError(CODES.ALREADY_ENTITLED, 'this account already holds the full package');
  }
  if (q.codeStatus !== 'ok' && q.codeStatus !== 'none') {
    throw new AppError(
      CODES.DISCOUNT_REJECTED,
      `discount code is ${q.codeStatus}`,
      400,
      { codeStatus: q.codeStatus },
      { codeStatus: q.codeStatus },
    );
  }

  // A 100 % code: nothing to charge, so the gateway is never called. Payment row, entitlement and
  // the code's use land together or not at all; the entitlement check is repeated inside the
  // transaction so two taps at once cannot both grant.
  if (q.payable === 0) {
    let paymentId = '';
    let alreadyEntitled = false;
    let exhausted = false;
    // Nothing is thrown inside the transaction callback: an AppError crossing the Go boundary
    // loses its code, so each refusal is carried out as a flag and thrown after.
    app.runInTransaction((tx) => {
      if (entitlementOf(tx, user.id)) {
        alreadyEntitled = true;
        return;
      }
      // The use is claimed first, conditionally: quote() read usedCount outside this transaction,
      // so several users can arrive here for a code's last use. Only one claim succeeds; the
      // others grant nothing and save nothing. (No money was taken, so refusing is free — unlike
      // the paid path, where countUse only logs an over-limit use.)
      if (!claimUse(tx, q.code)) {
        exhausted = true;
        return;
      }
      const row = newPayment(tx, user.id, q, nowMs);
      row.set('status', 'verified');
      row.set('verifiedAt', pbDate(nowMs));
      row.set('raw', { grant: 'discount', code: q.code });
      tx.save(row);
      paymentId = row.id;
      grant(tx, user.id, 'discount', row.id, `discount code ${q.code}`, nowMs);
    });
    if (alreadyEntitled) {
      throw new AppError(CODES.ALREADY_ENTITLED, 'this account already holds the full package');
    }
    if (exhausted) {
      throw new AppError(
        CODES.DISCOUNT_REJECTED,
        'discount code is exhausted',
        400,
        { codeStatus: 'exhausted' },
        { codeStatus: 'exhausted' },
      );
    }
    app
      .logger()
      .info('pay.granted', 'paymentId', paymentId, 'userId', user.id, 'discountCode', q.code);
    return { paymentId: paymentId, granted: true };
  }

  const row = newPayment(app, user.id, q, nowMs);
  app.save(row);

  let session;
  try {
    session = zarinpal.request(app, {
      amount: q.payable,
      paymentId: row.id,
      mobile: toLocalPhone(user.getString('phone')),
    });
  } catch (err) {
    row.set('status', 'failed');
    row.set('failReason', 'gateway_error');
    row.set('raw', { request: err?.data ? err.data : String(err?.message || err) });
    app.save(row);
    throw err;
  }

  row.set('authority', session.authority);
  row.set('raw', { request: session.raw });
  app.save(row);

  return { paymentId: row.id, gatewayUrl: session.gatewayUrl };
}

/** `09…` for Zarinpal's metadata.mobile, or '' when the account has no Iranian phone. */
function toLocalPhone(e164) {
  if (typeof e164 !== 'string' || e164.indexOf('+98') !== 0) return '';
  return toLocal(e164);
}

/** Mark failed unless already verified. `from` limits which states may become failed. */
function markFailed(app, paymentId, reason, fromStates) {
  const where = fromStates
    ? `status IN (${fromStates.map((s) => `'${s}'`).join(', ')})`
    : "status != 'verified'";
  return (
    app
      .db()
      .newQuery(
        `UPDATE payments SET status = 'failed', failReason = {:reason} WHERE id = {:id} AND ${where}`,
      )
      .bind({ id: paymentId, reason: reason })
      .execute()
      .rowsAffected() === 1
  );
}

/**
 * Apply a gateway verify answer to a payment. Shared by the callback and the reconcile cron.
 *
 * @param {core.Record} payment
 * @param {object} v  zarinpal.verify() result
 * @param {string} via 'callback' | 'reconcile' — for the log
 * @returns {{outcome: 'paid'|'mismatch'|'not_paid'|'error', refId: string}}
 */
function settle(app, payment, v, via, nowMs) {
  const paymentId = payment.id;
  const userId = payment.getString('user');

  if (v.outcome === 'paid') {
    let flipped = false;
    let granted = null;
    app.runInTransaction((tx) => {
      const result = tx
        .db()
        .newQuery(
          "UPDATE payments SET status = 'verified', refId = {:refId}, cardPan = {:cardPan}, " +
            "verifiedAt = {:now}, failReason = '' WHERE id = {:id} AND status != 'verified'",
        )
        .bind({
          id: paymentId,
          refId: v.refId || payment.getString('refId'),
          cardPan: v.cardPan || payment.getString('cardPan'),
          now: pbDate(nowMs),
        })
        .execute();
      flipped = result.rowsAffected() === 1;
      if (!flipped) return;

      const fresh = tx.findRecordById('payments', paymentId);
      const raw = readJsonField(fresh, 'raw') || {};
      raw.verify = v.raw;
      fresh.set('raw', raw);
      tx.save(fresh);

      granted = grant(tx, userId, 'zarinpal', paymentId, '', nowMs);
      countUse(tx, app, fresh.getString('discountCode'), paymentId);
    });

    const refId = app.findRecordById('payments', paymentId).getString('refId');
    if (flipped) {
      app
        .logger()
        .info(
          'pay.verified',
          'paymentId',
          paymentId,
          'userId',
          userId,
          'via',
          via,
          'code',
          v.code,
          'entitlementCreated',
          !!granted?.created,
        );
      if (granted && !granted.created) {
        // Paid while already entitled (two payments in flight): money taken, nothing to grant.
        // The owner refunds by hand from the Zarinpal panel (§8.3).
        app
          .logger()
          .error('pay.double_payment', 'paymentId', paymentId, 'userId', userId, 'via', via);
      }
    }
    return { outcome: 'paid', refId: refId };
  }

  if (v.outcome === 'mismatch') {
    markFailed(app, paymentId, 'amount_mismatch', null);
    app
      .logger()
      .error(
        'pay.amount_mismatch',
        'paymentId',
        paymentId,
        'userId',
        userId,
        'payable',
        payment.getInt('payable'),
        'code',
        v.code,
        'via',
        via,
      );
    return { outcome: 'mismatch', refId: '' };
  }

  if (v.outcome === 'not_paid') {
    markFailed(app, paymentId, 'not_paid', null);
    app.logger().warn('pay.not_paid', 'paymentId', paymentId, 'code', v.code, 'via', via);
    return { outcome: 'not_paid', refId: '' };
  }

  // Unreachable gateway or an answer that says nothing about the payment: leave it for the next
  // callback or the reconcile cron.
  app.logger().warn('pay.verify_undecided', 'paymentId', paymentId, 'code', v.code, 'via', via);
  return { outcome: 'error', refId: '' };
}

/** `${PUBLIC_APP_ORIGIN}/purchase/result?…` — where the callback sends the browser. */
function resultUrl(params) {
  const parts = [];
  for (const key of Object.keys(params)) {
    if (params[key] === undefined || params[key] === null || params[key] === '') continue;
    parts.push(`${key}=${encodeURIComponent(String(params[key]))}`);
  }
  return `${env.get('PUBLIC_APP_ORIGIN').replace(/\/+$/, '')}/purchase/result?${parts.join('&')}`;
}

/**
 * GET /api/pay/callback?Authority=&Status= → the result URL to redirect to.
 *
 *   status=ok&ref=<refId>&paymentId=<id>       verified (now, or by an earlier call)
 *   status=failed&reason=<reason>&paymentId=   cancelled, amount_mismatch, not_paid, unknown_payment
 *   status=pending&paymentId=<id>              the gateway could not be asked; the client polls
 *                                              /api/pay/status/:id, the reconcile cron settles it
 */
function handleCallback(app, authority, gatewayStatus, nowMs) {
  let payment = null;
  if (authority) {
    try {
      payment = app.findFirstRecordByData('payments', 'authority', authority);
    } catch (_err) {
      payment = null;
    }
  }
  if (!payment) {
    app.logger().warn('pay.callback_unknown', 'authorityKnown', false);
    return resultUrl({ status: 'failed', reason: 'unknown_payment' });
  }

  const paymentId = payment.id;
  const status = payment.getString('status');

  // Replay of a settled payment: answer from our own state, never call the gateway again.
  if (status === 'verified') {
    return resultUrl({ status: 'ok', ref: payment.getString('refId'), paymentId: paymentId });
  }

  if (gatewayStatus !== 'OK') {
    markFailed(app, paymentId, 'cancelled', ['pending', 'expired']);
    const reason = app.findRecordById('payments', paymentId).getString('failReason') || 'cancelled';
    return resultUrl({ status: 'failed', reason: reason, paymentId: paymentId });
  }

  const v = zarinpal.verify(app, { authority: authority, amount: payment.getInt('payable') });
  const settled = settle(app, payment, v, 'callback', nowMs);

  if (settled.outcome === 'paid') {
    return resultUrl({ status: 'ok', ref: settled.refId, paymentId: paymentId });
  }
  if (settled.outcome === 'mismatch') {
    return resultUrl({ status: 'failed', reason: 'amount_mismatch', paymentId: paymentId });
  }
  if (settled.outcome === 'not_paid') {
    return resultUrl({ status: 'failed', reason: 'not_paid', paymentId: paymentId });
  }
  return resultUrl({ status: 'pending', paymentId: paymentId });
}

// ---------------------------------------------------------------------------------------------
// crons
// ---------------------------------------------------------------------------------------------

/** Pending payments past their expiresAt become `expired`. @returns {number} rows changed */
function expirePending(app, nowMs) {
  return app
    .db()
    .newQuery(
      "UPDATE payments SET status = 'expired' WHERE status = 'pending' " +
        "AND expiresAt != '' AND expiresAt < {:now}",
    )
    .bind({ now: pbDate(nowMs) })
    .execute()
    .rowsAffected();
}

/**
 * The safety net for a user who paid and closed the browser before the redirect back: ask
 * Zarinpal which authorities are paid but unverified, and verify each one that is ours and not
 * yet verified, for the payable stored on our row. The gateway is only asked when there is a
 * recent unverified payment of ours to find, so a server with no payments makes no calls.
 *
 * @returns {{checked: number, verified: number, skipped: string}}
 */
function reconcileUnverified(app, nowMs) {
  const candidates = app.findRecordsByFilter(
    'payments',
    "authority != '' && status != 'verified' && created > {:since}",
    '',
    1,
    0,
    { since: pbDate(nowMs - RECONCILE_LOOKBACK_MS) },
  );
  if (candidates.length === 0) return { checked: 0, verified: 0, skipped: 'nothing-open' };

  const authorities = zarinpal.unverified(app);
  let checked = 0;
  let verified = 0;

  for (const authority of authorities) {
    let payment;
    try {
      payment = app.findFirstRecordByData('payments', 'authority', authority);
    } catch (_err) {
      continue; // not ours: another integration on the same merchant, or a deleted row
    }
    if (payment.getString('status') === 'verified') continue;

    checked++;
    const v = zarinpal.verify(app, { authority: authority, amount: payment.getInt('payable') });
    if (settle(app, payment, v, 'reconcile', nowMs).outcome === 'paid') verified++;
  }

  return { checked: checked, verified: verified, skipped: '' };
}

module.exports = {
  guard,
  prices,
  entitlementOf,
  normaliseCode,
  evaluateCode,
  quote,
  grant,
  requestPayment,
  handleCallback,
  settle,
  expirePending,
  reconcileUnverified,
  resultUrl,
  pbDate,
  PENDING_TTL_MS,
  CODE_STATUSES,
  FAIL_REASONS,
};
