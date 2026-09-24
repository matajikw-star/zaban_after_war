// Payment against a real PocketBase and a local Zarinpal stub (what.md §8.2, §8.3; ticket
// dev-payment/01). Every test uses its own phone, so one test's entitlement or discount use never
// leaks into another. The stub's URL replaces ZARINPAL_API_BASE: no test reaches Zarinpal.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Server, startServer } from './harness.ts';
import { startZarinpalStub, type ZarinpalStub } from './zarinpal-stub.ts';

let server: Server;
let stub: ZarinpalStub;

beforeAll(async () => {
  stub = await startZarinpalStub();
  server = await startServer({ env: { ZARINPAL_API_BASE: stub.url } });
});

afterAll(async () => {
  await server?.stop();
  await stub?.stop();
});

const LIST = 450000;
const SALE = 290000;

let phoneCounter = 0;
function nextPhone() {
  phoneCounter++;
  return `+98912300${String(phoneCounter).padStart(4, '0')}`;
}

function pbDate(ms: number) {
  return new Date(ms).toISOString().replace('T', ' ');
}

interface CodeInput {
  code: string;
  type?: 'percent' | 'fixed';
  value?: number;
  maxUses?: number;
  usedCount?: number;
  perUserOnce?: boolean;
  expiresAt?: string;
  active?: boolean;
}

async function makeCode(input: CodeInput) {
  const created = await server.asSuperuser<any>('POST', '/api/collections/discount_codes/records', {
    body: {
      type: 'percent',
      value: 50,
      maxUses: 100,
      usedCount: 0,
      perUserOnce: false,
      active: true,
      ...input,
    },
  });
  expect(created.status, JSON.stringify(created.body)).toBe(200);
  return created.body;
}

async function codeRecord(code: string) {
  const filter = encodeURIComponent(`code='${code}'`);
  const found = await server.asSuperuser<any>(
    'GET',
    `/api/collections/discount_codes/records?filter=${filter}`,
  );
  return found.body.items[0];
}

async function payment(id: string) {
  return (await server.asSuperuser<any>('GET', `/api/collections/payments/records/${id}`)).body;
}

async function entitlements(userId: string) {
  const filter = encodeURIComponent(`user='${userId}'`);
  const found = await server.asSuperuser<any>(
    'GET',
    `/api/collections/entitlements/records?filter=${filter}`,
  );
  return found.body.items as any[];
}

function quote(token: string, code?: string) {
  return server.api<any>('POST', '/api/pay/quote', {
    token,
    body: code === undefined ? {} : { code },
  });
}

function request(token: string, code?: string) {
  return server.api<any>('POST', '/api/pay/request', {
    token,
    body: code === undefined ? {} : { code },
  });
}

/** The callback, as the browser meets it: a 302 we do not follow. */
async function callback(authority: string, status = 'OK') {
  const response = await fetch(
    `${server.url}/api/pay/callback?Authority=${encodeURIComponent(authority)}&Status=${status}`,
    { redirect: 'manual' },
  );
  const location = response.headers.get('location') ?? '';
  const parsed = location ? new URL(location) : null;
  return {
    status: response.status,
    location,
    path: parsed?.pathname ?? '',
    query: Object.fromEntries(parsed?.searchParams ?? []),
  };
}

async function runCron(id: string) {
  const run = await server.asSuperuser('POST', `/api/crons/${id}`);
  expect(run.status).toBe(204);
}

async function until(check: () => Promise<boolean>, what: string) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`timed out waiting for ${what}`);
}

/** A user who has started a Zarinpal payment; returns everything a test needs about it. */
async function startPayment(code?: string) {
  const user = await server.createUser(nextPhone());
  const requested = await request(user.token, code);
  expect(requested.status, JSON.stringify(requested.body)).toBe(200);
  const row = await payment(requested.body.paymentId);
  return { user, paymentId: requested.body.paymentId as string, authority: row.authority, row };
}

// --- quote ---------------------------------------------------------------------------------

describe('POST /api/pay/quote', () => {
  it('without a code: prices from app_config and codeStatus none', async () => {
    const user = await server.createUser(nextPhone());
    const response = await quote(user.token);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      listPrice: LIST,
      salePrice: SALE,
      discountAmount: 0,
      payable: SALE,
      codeStatus: 'none',
      code: null,
    });
  });

  it('ok: a percent code, typed in lowercase with Persian digits, is normalised and applied', async () => {
    await makeCode({ code: 'HALF50', type: 'percent', value: 50 });
    const user = await server.createUser(nextPhone());
    const response = await quote(user.token, ' half۵۰ ');
    expect(response.body).toEqual({
      listPrice: LIST,
      salePrice: SALE,
      discountAmount: 145000,
      payable: 145000,
      codeStatus: 'ok',
      code: 'HALF50',
    });
  });

  it('ok: a fixed code takes toman off the sale price, and never more than it', async () => {
    await makeCode({ code: 'FIX100K', type: 'fixed', value: 100000 });
    await makeCode({ code: 'FIXHUGE', type: 'fixed', value: 10_000_000 });
    const user = await server.createUser(nextPhone());
    expect((await quote(user.token, 'FIX100K')).body).toMatchObject({
      discountAmount: 100000,
      payable: 190000,
      codeStatus: 'ok',
    });
    expect((await quote(user.token, 'FIXHUGE')).body).toMatchObject({
      discountAmount: SALE,
      payable: 0,
      codeStatus: 'ok',
    });
  });

  it('a percent discount is rounded down, so the payable is never under the promise', async () => {
    await makeCode({ code: 'THIRD33', type: 'percent', value: 33 });
    const user = await server.createUser(nextPhone());
    // 290000 * 33 / 100 = 95700 exactly; use a sale price that does not divide.
    const config = await server.asSuperuser<any>('GET', '/api/collections/app_config/records');
    const id = config.body.items[0].id;
    await server.asSuperuser('PATCH', `/api/collections/app_config/records/${id}`, {
      body: { salePrice: 290001 },
    });
    try {
      const response = await quote(user.token, 'THIRD33');
      expect(response.body.discountAmount).toBe(95700); // floor(95700.33)
      expect(response.body.payable).toBe(194301);
    } finally {
      await server.asSuperuser('PATCH', `/api/collections/app_config/records/${id}`, {
        body: { salePrice: SALE },
      });
    }
  });

  it('invalid: unknown, malformed, inactive, or a value that cannot make a price', async () => {
    await makeCode({ code: 'SLEEPING', active: false });
    // value is a required field, so 0 cannot be stored; a negative one can.
    await makeCode({ code: 'NEGPCT', type: 'percent', value: -5 });
    await makeCode({ code: 'OVER100', type: 'percent', value: 101 });
    const user = await server.createUser(nextPhone());
    for (const code of ['NOSUCHCODE', 'bad code!', 'SLEEPING', 'NEGPCT', 'OVER100']) {
      const response = await quote(user.token, code);
      expect(response.status, code).toBe(200);
      expect(response.body.codeStatus, code).toBe('invalid');
      expect(response.body.payable, code).toBe(SALE);
      expect(response.body.discountAmount, code).toBe(0);
      expect(response.body.code, code).toBeNull();
    }
  });

  it('expired: past expiresAt; a blank expiresAt never expires', async () => {
    await makeCode({ code: 'OLDCODE', expiresAt: pbDate(Date.now() - 60_000) });
    await makeCode({ code: 'FUTURE', expiresAt: pbDate(Date.now() + 86_400_000) });
    await makeCode({ code: 'FOREVER' });
    const user = await server.createUser(nextPhone());
    expect((await quote(user.token, 'OLDCODE')).body.codeStatus).toBe('expired');
    expect((await quote(user.token, 'FUTURE')).body.codeStatus).toBe('ok');
    expect((await quote(user.token, 'FOREVER')).body.codeStatus).toBe('ok');
  });

  it('exhausted: usedCount has reached maxUses; maxUses 0 is exhausted, not unlimited', async () => {
    await makeCode({ code: 'ALLGONE', maxUses: 3, usedCount: 3 });
    await makeCode({ code: 'NOMAX', maxUses: 0, usedCount: 0 });
    await makeCode({ code: 'ONELEFT', maxUses: 3, usedCount: 2 });
    const user = await server.createUser(nextPhone());
    expect((await quote(user.token, 'ALLGONE')).body.codeStatus).toBe('exhausted');
    expect((await quote(user.token, 'NOMAX')).body.codeStatus).toBe('exhausted');
    expect((await quote(user.token, 'ONELEFT')).body.codeStatus).toBe('ok');
  });

  it('used: a perUserOnce code this user already paid with; another user may still use it', async () => {
    await makeCode({ code: 'ONCEONLY', perUserOnce: true });
    const user = await server.createUser(nextPhone());
    // A verified payment with the code but no entitlement: what a refund leaves (§8.3).
    const made = await server.asSuperuser<any>('POST', '/api/collections/payments/records', {
      body: { user: user.id, discountCode: 'ONCEONLY', payable: 145000, status: 'verified' },
    });
    expect(made.status).toBe(200);
    expect((await quote(user.token, 'ONCEONLY')).body.codeStatus).toBe('used');

    const other = await server.createUser(nextPhone());
    expect((await quote(other.token, 'ONCEONLY')).body.codeStatus).toBe('ok');
  });

  it('checks in the order of §8.3: exists → active → not expired → uses left → per user', async () => {
    const past = pbDate(Date.now() - 60_000);
    // inactive AND expired → invalid (active is checked first)
    await makeCode({ code: 'ORDER1', active: false, expiresAt: past });
    // expired AND exhausted → expired
    await makeCode({ code: 'ORDER2', expiresAt: past, maxUses: 1, usedCount: 1 });
    // exhausted AND used → exhausted
    await makeCode({ code: 'ORDER3', maxUses: 1, usedCount: 1, perUserOnce: true });
    const user = await server.createUser(nextPhone());
    await server.asSuperuser('POST', '/api/collections/payments/records', {
      body: { user: user.id, discountCode: 'ORDER3', payable: 1, status: 'verified' },
    });
    expect((await quote(user.token, 'ORDER1')).body.codeStatus).toBe('invalid');
    expect((await quote(user.token, 'ORDER2')).body.codeStatus).toBe('expired');
    expect((await quote(user.token, 'ORDER3')).body.codeStatus).toBe('exhausted');
  });

  it('already-entitled wins over any code', async () => {
    const phone = nextPhone();
    const user = await server.createUser(phone);
    expect((await server.asSuperuser('POST', '/api/admin/grant', { body: { phone } })).status).toBe(
      200,
    );
    const response = await quote(user.token, 'HALF50');
    expect(response.body).toMatchObject({ codeStatus: 'already-entitled', payable: SALE });
  });

  it('reads prices from app_config at request time', async () => {
    const config = await server.asSuperuser<any>('GET', '/api/collections/app_config/records');
    const id = config.body.items[0].id;
    await server.asSuperuser('PATCH', `/api/collections/app_config/records/${id}`, {
      body: { listPrice: 500000, salePrice: 250000 },
    });
    try {
      const user = await server.createUser(nextPhone());
      expect((await quote(user.token)).body).toMatchObject({
        listPrice: 500000,
        salePrice: 250000,
        payable: 250000,
      });
    } finally {
      await server.asSuperuser('PATCH', `/api/collections/app_config/records/${id}`, {
        body: { listPrice: LIST, salePrice: SALE },
      });
    }
  });

  it('needs a user token', async () => {
    const response = await server.api<any>('POST', '/api/pay/quote', { body: {} });
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });
});

// --- request -------------------------------------------------------------------------------

describe('POST /api/pay/request', () => {
  it('creates a pending payment and asks Zarinpal for the payable, in toman (IRT)', async () => {
    const before = stub.callsTo('/pg/v4/payment/request.json').length;
    const { paymentId, authority, row } = await startPayment('HALF50');

    expect(row).toMatchObject({
      status: 'pending',
      listPrice: LIST,
      salePrice: SALE,
      discountCode: 'HALF50',
      discountAmount: 145000,
      payable: 145000,
    });
    expect(authority).toMatch(/^A\d{35}$/);
    const expiresIn = new Date(row.expiresAt.replace(' ', 'T')).getTime() - Date.now();
    expect(expiresIn).toBeGreaterThan(2 * 3600_000 - 60_000);
    expect(expiresIn).toBeLessThanOrEqual(2 * 3600_000);

    const calls = stub.callsTo('/pg/v4/payment/request.json');
    expect(calls.length).toBe(before + 1);
    const sent = calls.at(-1)?.body;
    expect(sent).toMatchObject({
      merchant_id: 'test-merchant',
      amount: 145000,
      currency: 'IRT',
      callback_url: `${server.url}/api/pay/callback`,
      metadata: { order_id: paymentId },
    });
    expect(sent.metadata.mobile).toMatch(/^09\d{9}$/);
  });

  it('answers the StartPay URL for the authority', async () => {
    const user = await server.createUser(nextPhone());
    const response = await request(user.token);
    expect(response.status).toBe(200);
    const row = await payment(response.body.paymentId);
    expect(response.body).toEqual({
      paymentId: row.id,
      gatewayUrl: `${stub.url}/pg/StartPay/${row.authority}`,
    });
    expect(row.payable).toBe(SALE);
  });

  it('a rejected code is DISCOUNT_REJECTED with its codeStatus, and nothing is created', async () => {
    const user = await server.createUser(nextPhone());
    const before = stub.calls.length;
    const response = await request(user.token, 'OLDCODE');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('DISCOUNT_REJECTED');
    expect(response.body.codeStatus).toBe('expired');
    expect(stub.calls.length).toBe(before);

    const filter = encodeURIComponent(`user='${user.id}'`);
    const rows = await server.asSuperuser<any>(
      'GET',
      `/api/collections/payments/records?filter=${filter}`,
    );
    expect(rows.body.items).toHaveLength(0);
  });

  it('a 100 % code grants without calling the gateway', async () => {
    await makeCode({ code: 'FREE100', type: 'percent', value: 100, maxUses: 5 });
    const user = await server.createUser(nextPhone());
    const before = stub.calls.length;

    const response = await request(user.token, 'free100');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ paymentId: expect.any(String), granted: true });
    expect(stub.calls.length).toBe(before);

    const row = await payment(response.body.paymentId);
    expect(row).toMatchObject({ status: 'verified', payable: 0, discountCode: 'FREE100' });
    const granted = await entitlements(user.id);
    expect(granted).toHaveLength(1);
    expect(granted[0]).toMatchObject({ product: 'full', source: 'discount', payment: row.id });
    expect((await codeRecord('FREE100')).usedCount).toBe(1);

    const me = await server.api<any>('GET', '/api/me', { token: user.token });
    expect(me.body.entitlement).toMatchObject({ status: 'full', source: 'discount' });

    // A second tap: already entitled, nothing charged, the code not counted again.
    const again = await request(user.token, 'FREE100');
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_ENTITLED');
    expect((await codeRecord('FREE100')).usedCount).toBe(1);
  });

  it("a 100 % code's last use goes to exactly one of several users racing for it", async () => {
    await makeCode({ code: 'LASTFREE', type: 'percent', value: 100, maxUses: 1 });
    const racers = await Promise.all(
      Array.from({ length: 8 }, () => server.createUser(nextPhone())),
    );
    const before = stub.calls.length;

    const results = await Promise.all(racers.map((u) => request(u.token, 'LASTFREE')));

    const granted = results.filter((r) => r.status === 200);
    const refused = results.filter((r) => r.status !== 200);
    expect(granted, JSON.stringify(results.map((r) => r.body))).toHaveLength(1);
    expect(granted[0]?.body.granted).toBe(true);
    for (const r of refused) {
      expect(r.status).toBe(400);
      expect(r.body.error.code).toBe('DISCOUNT_REJECTED');
      expect(r.body.codeStatus).toBe('exhausted');
    }
    expect((await codeRecord('LASTFREE')).usedCount).toBe(1);

    let entitled = 0;
    for (const u of racers) entitled += (await entitlements(u.id)).length;
    expect(entitled).toBe(1);

    // The losers have no payment row either: nothing is saved for a refused grant.
    const filter = encodeURIComponent("discountCode='LASTFREE'");
    const rows = await server.asSuperuser<any>(
      'GET',
      `/api/collections/payments/records?filter=${filter}`,
    );
    expect(rows.body.items).toHaveLength(1);
    expect(stub.calls.length).toBe(before);
  });

  it('already-entitled is refused and never reaches the gateway', async () => {
    const phone = nextPhone();
    const user = await server.createUser(phone);
    await server.asSuperuser('POST', '/api/admin/grant', { body: { phone } });
    const before = stub.calls.length;
    const response = await request(user.token);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ALREADY_ENTITLED');
    expect(stub.calls.length).toBe(before);
  });

  it('a gateway refusal is GATEWAY_FAILED and the payment is failed with gateway_error', async () => {
    const user = await server.createUser(nextPhone());
    stub.failNextRequest = -9;
    const response = await request(user.token);
    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe('GATEWAY_FAILED');

    const filter = encodeURIComponent(`user='${user.id}'`);
    const rows = await server.asSuperuser<any>(
      'GET',
      `/api/collections/payments/records?filter=${filter}`,
    );
    expect(rows.body.items).toHaveLength(1);
    expect(rows.body.items[0]).toMatchObject({ status: 'failed', failReason: 'gateway_error' });
  });

  it('ignores any amount or price the client sends', async () => {
    const user = await server.createUser(nextPhone());
    const response = await server.api<any>('POST', '/api/pay/request', {
      token: user.token,
      body: { payable: 1000, amount: 1000, salePrice: 1000 },
    });
    expect(response.status).toBe(200);
    expect((await payment(response.body.paymentId)).payable).toBe(SALE);
  });
});

// --- callback ------------------------------------------------------------------------------

describe('GET /api/pay/callback', () => {
  it('verifies for the stored payable, grants, counts the code, and redirects to ok', async () => {
    await makeCode({ code: 'CB50', type: 'percent', value: 50 });
    const { user, paymentId, authority } = await startPayment('CB50');
    stub.pay(authority);

    const result = await callback(authority);
    expect(result.status).toBe(302);
    expect(result.location.startsWith(`${server.url}/purchase/result?`)).toBe(true);
    expect(result.query).toEqual({ status: 'ok', ref: expect.any(String), paymentId });

    const verifyCall = stub.callsTo('/pg/v4/payment/verify.json').at(-1)?.body;
    expect(verifyCall).toEqual({
      merchant_id: 'test-merchant',
      amount: 145000,
      currency: 'IRT',
      authority,
    });

    const row = await payment(paymentId);
    expect(row).toMatchObject({ status: 'verified', refId: result.query.ref, failReason: '' });
    expect(row.cardPan).toBe('502229******5995');
    expect(row.verifiedAt).not.toBe('');

    const granted = await entitlements(user.id);
    expect(granted).toHaveLength(1);
    expect(granted[0]).toMatchObject({ source: 'zarinpal', payment: paymentId });
    expect((await codeRecord('CB50')).usedCount).toBe(1);
  });

  it('a replay is idempotent: same answer, one entitlement, one use, no second verify', async () => {
    await makeCode({ code: 'REPLAY', type: 'percent', value: 20 });
    const { user, paymentId, authority } = await startPayment('REPLAY');
    stub.pay(authority);

    const first = await callback(authority);
    expect(first.query.status).toBe('ok');
    const verifies = stub.callsTo('/pg/v4/payment/verify.json').length;

    const second = await callback(authority);
    const third = await callback(authority);
    expect(second.location).toBe(first.location);
    expect(third.location).toBe(first.location);
    expect(stub.callsTo('/pg/v4/payment/verify.json').length).toBe(verifies);

    expect(await entitlements(user.id)).toHaveLength(1);
    expect((await codeRecord('REPLAY')).usedCount).toBe(1);
    expect((await payment(paymentId)).status).toBe('verified');
  });

  it('concurrent callbacks for one authority grant once and count the code once', async () => {
    await makeCode({ code: 'RACE', type: 'percent', value: 10 });
    const { user, authority } = await startPayment('RACE');
    stub.pay(authority);

    // Zarinpal answers slowly, so all four are past the "already verified?" read and waiting on
    // verify at once: only the conditional flip can keep the grant and the use to one.
    stub.verifyDelayMs = 400;
    let results: Awaited<ReturnType<typeof callback>>[];
    try {
      results = await Promise.all([1, 2, 3, 4].map(() => callback(authority)));
    } finally {
      stub.verifyDelayMs = 0;
    }
    expect(
      stub.callsTo('/pg/v4/payment/verify.json').filter((c) => c.body.authority === authority),
    ).toHaveLength(4);
    for (const r of results) expect(r.query.status).toBe('ok');
    expect(new Set(results.map((r) => r.query.ref)).size).toBe(1);

    expect(await entitlements(user.id)).toHaveLength(1);
    expect((await codeRecord('RACE')).usedCount).toBe(1);
  });

  it('cancelled (Status=NOK): failed, no verify call, no entitlement, no use counted', async () => {
    await makeCode({ code: 'CANCEL', type: 'percent', value: 10 });
    const { user, paymentId, authority } = await startPayment('CANCEL');
    const verifies = stub.callsTo('/pg/v4/payment/verify.json').length;

    const result = await callback(authority, 'NOK');
    expect(result.status).toBe(302);
    expect(result.query).toEqual({ status: 'failed', reason: 'cancelled', paymentId });
    expect(stub.callsTo('/pg/v4/payment/verify.json').length).toBe(verifies);
    expect(await payment(paymentId)).toMatchObject({ status: 'failed', failReason: 'cancelled' });
    expect(await entitlements(user.id)).toHaveLength(0);
    expect((await codeRecord('CANCEL')).usedCount).toBe(0);
  });

  it('Status=OK but Zarinpal says not paid (-51): failed not_paid', async () => {
    const { user, paymentId, authority } = await startPayment();
    const result = await callback(authority, 'OK');
    expect(result.query).toEqual({ status: 'failed', reason: 'not_paid', paymentId });
    expect(await payment(paymentId)).toMatchObject({ status: 'failed', failReason: 'not_paid' });
    expect(await entitlements(user.id)).toHaveLength(0);
  });

  it('a wrong amount (-50) fails the payment, grants nothing, and logs an error', async () => {
    await makeCode({ code: 'WRONGAMT', type: 'percent', value: 50 });
    const { user, paymentId, authority } = await startPayment('WRONGAMT');
    // The user paid something other than the 145000 we asked for.
    stub.pay(authority, 1000);

    const result = await callback(authority);
    expect(result.query).toEqual({ status: 'failed', reason: 'amount_mismatch', paymentId });
    expect(stub.callsTo('/pg/v4/payment/verify.json').at(-1)?.body.amount).toBe(145000);
    expect(await payment(paymentId)).toMatchObject({
      status: 'failed',
      failReason: 'amount_mismatch',
    });
    expect(await entitlements(user.id)).toHaveLength(0);
    expect((await codeRecord('WRONGAMT')).usedCount).toBe(0);

    await until(async () => {
      const filter = encodeURIComponent(
        `message='pay.amount_mismatch' && data.paymentId='${paymentId}'`,
      );
      const found = await server.asSuperuser<any>('GET', `/api/logs?filter=${filter}`);
      return (
        found.status === 200 && found.body.items.length === 1 && found.body.items[0].level === 8
      );
    }, 'the amount_mismatch error log');
  });

  it('an unknown authority redirects to failed unknown_payment', async () => {
    const result = await callback('A00000000000000000000000000000099999');
    expect(result.status).toBe(302);
    expect(result.query).toEqual({ status: 'failed', reason: 'unknown_payment' });
  });

  it('a gateway that cannot answer leaves the payment pending and redirects to pending', async () => {
    const { paymentId, authority } = await startPayment();
    stub.pay(authority);
    stub.verifyDown = true;
    try {
      const result = await callback(authority);
      expect(result.query).toEqual({ status: 'pending', paymentId });
      expect((await payment(paymentId)).status).toBe('pending');
    } finally {
      stub.verifyDown = false;
    }
    // The next callback (or the cron) settles it.
    expect((await callback(authority)).query.status).toBe('ok');
  });
});

// --- status --------------------------------------------------------------------------------

describe('GET /api/pay/status/:id', () => {
  it('answers each state for the owner', async () => {
    // pending
    const pending = await startPayment();
    const p = await server.api<any>('GET', `/api/pay/status/${pending.paymentId}`, {
      token: pending.user.token,
    });
    expect(p.status).toBe(200);
    expect(p.body).toEqual({
      paymentId: pending.paymentId,
      status: 'pending',
      refId: null,
      failReason: null,
      entitled: false,
    });

    // failed
    const failed = await startPayment();
    await callback(failed.authority, 'NOK');
    expect(
      (
        await server.api<any>('GET', `/api/pay/status/${failed.paymentId}`, {
          token: failed.user.token,
        })
      ).body,
    ).toMatchObject({ status: 'failed', failReason: 'cancelled', entitled: false });

    // expired
    const expired = await startPayment();
    await server.asSuperuser('PATCH', `/api/collections/payments/records/${expired.paymentId}`, {
      body: { status: 'expired' },
    });
    expect(
      (
        await server.api<any>('GET', `/api/pay/status/${expired.paymentId}`, {
          token: expired.user.token,
        })
      ).body,
    ).toMatchObject({ status: 'expired', refId: null });

    // verified
    const verified = await startPayment();
    stub.pay(verified.authority);
    const cb = await callback(verified.authority);
    expect(
      (
        await server.api<any>('GET', `/api/pay/status/${verified.paymentId}`, {
          token: verified.user.token,
        })
      ).body,
    ).toEqual({
      paymentId: verified.paymentId,
      status: 'verified',
      refId: cb.query.ref,
      failReason: null,
      entitled: true,
    });
  });

  it("another user's payment, or no such id, is NOT_FOUND", async () => {
    const mine = await startPayment();
    const other = await server.createUser(nextPhone());
    for (const id of [mine.paymentId, 'aaaaaaaaaaaaaaa', 'not-an-id']) {
      const response = await server.api<any>('GET', `/api/pay/status/${id}`, {
        token: other.token,
      });
      expect(response.status, id).toBe(404);
      expect(response.body.error.code, id).toBe('NOT_FOUND');
    }
  });
});

// --- admin grant ---------------------------------------------------------------------------

describe('POST /api/admin/grant', () => {
  it('refuses a user token and an anonymous call', async () => {
    const user = await server.createUser(nextPhone());
    const asUser = await server.api<any>('POST', '/api/admin/grant', {
      token: user.token,
      body: { phone: '09123009999' },
    });
    expect(asUser.status).toBe(403);
    expect(asUser.body.error.code).toBe('FORBIDDEN');

    const anonymous = await server.api<any>('POST', '/api/admin/grant', {
      body: { phone: '09123009999' },
    });
    expect(anonymous.status).toBe(401);
    expect(await entitlements(user.id)).toHaveLength(0);
  });

  it('creates the user when missing, grants manual, and is idempotent', async () => {
    const first = await server.asSuperuser<any>('POST', '/api/admin/grant', {
      body: { phone: '0912 300 8888', note: 'gift' },
    });
    expect(first.status).toBe(200);
    expect(first.body).toEqual({
      userId: expect.any(String),
      entitlementId: expect.any(String),
      created: true,
    });

    const user = await server.asSuperuser<any>(
      'GET',
      `/api/collections/users/records/${first.body.userId}`,
    );
    expect(user.body.phone).toBe('+989123008888');
    const granted = await entitlements(first.body.userId);
    expect(granted).toHaveLength(1);
    expect(granted[0]).toMatchObject({ source: 'manual', product: 'full', note: 'gift' });

    const again = await server.asSuperuser<any>('POST', '/api/admin/grant', {
      body: { phone: '+989123008888' },
    });
    expect(again.body).toEqual({
      userId: first.body.userId,
      entitlementId: first.body.entitlementId,
      created: false,
    });
    expect(await entitlements(first.body.userId)).toHaveLength(1);
  });

  it('an invalid phone is PHONE_INVALID', async () => {
    const response = await server.asSuperuser<any>('POST', '/api/admin/grant', {
      body: { phone: '12345' },
    });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('PHONE_INVALID');
  });
});

// --- crons ---------------------------------------------------------------------------------

describe('crons', () => {
  it('expire_pending marks pending payments past expiresAt expired, and only those', async () => {
    const old = await startPayment();
    const fresh = await startPayment();
    await server.asSuperuser('PATCH', `/api/collections/payments/records/${old.paymentId}`, {
      body: { expiresAt: pbDate(Date.now() - 60_000) },
    });

    await runCron('expire_pending');
    await until(async () => (await payment(old.paymentId)).status === 'expired', 'expiry');
    expect((await payment(fresh.paymentId)).status).toBe('pending');

    // A late callback for an expired payment the user did pay still verifies.
    stub.pay(old.authority);
    expect((await callback(old.authority)).query.status).toBe('ok');
    expect(await entitlements(old.user.id)).toHaveLength(1);
  });

  it('reconcile_unverified verifies a paid payment whose callback never came', async () => {
    await makeCode({ code: 'LOSTCB', type: 'percent', value: 50 });
    const { user, paymentId, authority } = await startPayment('LOSTCB');
    stub.pay(authority); // paid, then the browser closed: no callback

    const unverifiedCalls = stub.callsTo('/pg/v4/payment/unVerified.json').length;
    await runCron('reconcile_unverified');
    await until(async () => (await payment(paymentId)).status === 'verified', 'reconcile');

    expect(stub.callsTo('/pg/v4/payment/unVerified.json').length).toBe(unverifiedCalls + 1);
    expect(stub.callsTo('/pg/v4/payment/verify.json').at(-1)?.body).toMatchObject({
      authority,
      amount: 145000,
      currency: 'IRT',
    });
    await until(async () => (await entitlements(user.id)).length === 1, 'the entitlement');
    expect((await codeRecord('LOSTCB')).usedCount).toBe(1);

    // The callback arriving after all is a replay.
    const late = await callback(authority);
    expect(late.query.status).toBe('ok');
    expect(await entitlements(user.id)).toHaveLength(1);
    expect((await codeRecord('LOSTCB')).usedCount).toBe(1);
  });

  it('reconcile_unverified leaves a paid-but-wrong-amount payment failed', async () => {
    const { user, paymentId, authority } = await startPayment();
    stub.pay(authority, 5000);

    await runCron('reconcile_unverified');
    await until(async () => (await payment(paymentId)).status === 'failed', 'reconcile');
    expect((await payment(paymentId)).failReason).toBe('amount_mismatch');
    expect(await entitlements(user.id)).toHaveLength(0);
  });
});

// --- the mock gateway ------------------------------------------------------------------------

describe('ZARINPAL_PROVIDER=mock', () => {
  let mock: Server;

  beforeAll(async () => {
    mock = await startServer({ env: { ZARINPAL_PROVIDER: 'mock' } });
  });

  afterAll(async () => {
    await mock?.stop();
  });

  it('redirects straight to our callback, which verifies and grants', async () => {
    const user = await mock.createUser('+989123007777');
    const requested = await mock.api<any>('POST', '/api/pay/request', {
      token: user.token,
      body: {},
    });
    expect(requested.status).toBe(200);
    const gatewayUrl: string = requested.body.gatewayUrl;
    expect(gatewayUrl.startsWith(`${mock.url}/api/pay/callback?Authority=MOCK`)).toBe(true);
    expect(gatewayUrl.endsWith('&Status=OK')).toBe(true);

    const response = await fetch(gatewayUrl, { redirect: 'manual' });
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('location') ?? '');
    expect(location.pathname).toBe('/purchase/result');
    expect(location.searchParams.get('status')).toBe('ok');
    expect(location.searchParams.get('ref')).toMatch(/^MOCK-\d{10}$/);

    const me = await mock.api<any>('GET', '/api/me', { token: user.token });
    expect(me.body.entitlement).toMatchObject({ status: 'full', source: 'zarinpal' });
  });
});
