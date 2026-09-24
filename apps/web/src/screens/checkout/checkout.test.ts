import { describe, expect, it } from 'vitest';
import { AppError } from '../../errors.ts';
import type { PayQuoteResponse, PayRequestResponse } from '../../net/api.ts';
import {
  type CheckoutDeps,
  failureFromError,
  fetchQuote,
  isGatewayUrl,
  startPayment,
} from './flow.ts';
import {
  appliedCode,
  CHECKOUT_START,
  type CheckoutEvent,
  type CheckoutState,
  transition,
} from './machine.ts';

const PLAIN: PayQuoteResponse = {
  listPrice: 490_000,
  salePrice: 290_000,
  discountAmount: 0,
  payable: 290_000,
  codeStatus: 'none',
  code: null,
};
const HALF: PayQuoteResponse = {
  ...PLAIN,
  discountAmount: 145_000,
  payable: 145_000,
  codeStatus: 'ok',
  code: 'HALF50',
};

function run(state: CheckoutState, ...events: CheckoutEvent[]): CheckoutState {
  return events.reduce(transition, state);
}

const fail = (failure: Parameters<typeof failureFromError>[0]): CheckoutEvent => ({
  type: 'FAILED',
  failure: failureFromError(failure),
});

describe('checkout machine: the happy paths', () => {
  it('quote → apply a 50 % code → pay → redirect to the gateway', () => {
    const ready = run(CHECKOUT_START, { type: 'QUOTED', quote: PLAIN });
    expect(ready).toEqual({ name: 'ready', quote: PLAIN, codeStatus: 'none' });

    const applying = transition(ready, { type: 'APPLY', code: '  half50 ' });
    expect(applying).toEqual({ name: 'applying', quote: PLAIN, code: 'half50' });

    const discounted = transition(applying, { type: 'QUOTED', quote: HALF });
    expect(discounted).toEqual({ name: 'ready', quote: HALF, codeStatus: 'ok' });
    expect(appliedCode(HALF)).toBe('HALF50');

    const requesting = transition(discounted, { type: 'PAY' });
    expect(requesting).toEqual({ name: 'requesting', quote: HALF });
    expect(
      transition(requesting, { type: 'REDIRECT', gatewayUrl: 'https://pay.example/StartPay/A1' }),
    ).toEqual({ name: 'redirecting', gatewayUrl: 'https://pay.example/StartPay/A1' });
  });

  it('a 100 % code is granted without the gateway', () => {
    const state = run(
      CHECKOUT_START,
      { type: 'QUOTED', quote: { ...HALF, payable: 0, discountAmount: 290_000, code: 'FREE' } },
      { type: 'PAY' },
      { type: 'GRANTED', paymentId: 'p1' },
    );
    expect(state).toEqual({ name: 'granted', paymentId: 'p1' });
  });

  it('an empty code removes the applied one (asks again with no code)', () => {
    const state = run(
      CHECKOUT_START,
      { type: 'QUOTED', quote: HALF },
      { type: 'APPLY', code: ' ' },
    );
    expect(state).toEqual({ name: 'applying', quote: HALF, code: null });
  });
});

describe('checkout machine: every codeStatus is shown', () => {
  it.each(['invalid', 'expired', 'exhausted', 'used'] as const)(
    '%s: ready with plain prices and the status under the field; nothing is applied',
    (codeStatus) => {
      const quote: PayQuoteResponse = { ...PLAIN, codeStatus, code: null };
      const state = run(
        CHECKOUT_START,
        { type: 'QUOTED', quote: PLAIN },
        { type: 'APPLY', code: 'X' },
        { type: 'QUOTED', quote },
      );
      expect(state).toEqual({ name: 'ready', quote, codeStatus });
      expect(appliedCode(quote)).toBeNull();
    },
  );

  it('already-entitled, from any quote, is `owned`: nothing to sell', () => {
    const quote: PayQuoteResponse = { ...PLAIN, codeStatus: 'already-entitled' };
    expect(transition(CHECKOUT_START, { type: 'QUOTED', quote })).toEqual({ name: 'owned' });
  });
});

describe('checkout machine: failures', () => {
  const gate = new AppError('SERVER_PAYMENT_DISABLED_MOCK_SMS', 'gated', { status: 503 });

  it('staging: the gate is `disabled` from the first quote, the apply and the request alike', () => {
    expect(transition(CHECKOUT_START, fail(gate))).toEqual({ name: 'disabled' });
    const ready = transition(CHECKOUT_START, { type: 'QUOTED', quote: PLAIN });
    expect(run(ready, { type: 'APPLY', code: 'X' }, fail(gate))).toEqual({ name: 'disabled' });
    expect(run(ready, { type: 'PAY' }, fail(gate))).toEqual({ name: 'disabled' });
  });

  it('409 ALREADY_ENTITLED is `owned`; 401 is `loginNeeded`', () => {
    const ready = transition(CHECKOUT_START, { type: 'QUOTED', quote: PLAIN });
    expect(
      run(
        ready,
        { type: 'PAY' },
        fail(new AppError('SERVER_ALREADY_ENTITLED', 'x', { status: 409 })),
      ),
    ).toEqual({ name: 'owned' });
    expect(transition(CHECKOUT_START, fail(new AppError('UNAUTHORIZED', 'x')))).toEqual({
      name: 'loginNeeded',
    });
  });

  it('DISCOUNT_REJECTED on pay re-asks the quote with the same code', () => {
    const state = run(
      CHECKOUT_START,
      { type: 'QUOTED', quote: HALF },
      { type: 'PAY' },
      fail(new AppError('SERVER_DISCOUNT_REJECTED', 'x', { status: 400, codeStatus: 'exhausted' })),
    );
    expect(state).toEqual({ name: 'applying', quote: HALF, code: 'HALF50' });
  });

  it('a network failure retries exactly the request that failed', () => {
    const offline = fail(new AppError('NETWORK', 'offline'));
    const first = transition(CHECKOUT_START, offline);
    expect(first).toMatchObject({ name: 'error', problem: { kind: 'network' }, quote: null });
    expect(transition(first, { type: 'RETRY' })).toEqual(CHECKOUT_START);

    const ready = transition(CHECKOUT_START, { type: 'QUOTED', quote: HALF });
    const payFailed = run(ready, { type: 'PAY' }, offline);
    expect(transition(payFailed, { type: 'RETRY' })).toEqual({ name: 'requesting', quote: HALF });

    const applyFailed = run(ready, { type: 'APPLY', code: 'NEW' }, offline);
    expect(transition(applyFailed, { type: 'RETRY' })).toEqual({
      name: 'applying',
      quote: HALF,
      code: 'NEW',
    });
  });

  it('429 carries its wait; a gateway failure and anything unnamed are retryable errors', () => {
    const ready = transition(CHECKOUT_START, { type: 'QUOTED', quote: PLAIN });
    expect(
      run(ready, { type: 'PAY' }, fail(new AppError('RATE_LIMITED', 'x', { retryAfter: 120 }))),
    ).toMatchObject({ name: 'error', problem: { kind: 'rateLimited', retryAfter: 120 } });
    expect(
      run(
        ready,
        { type: 'PAY' },
        fail(new AppError('SERVER_GATEWAY_FAILED', 'x', { status: 502 })),
      ),
    ).toMatchObject({ name: 'error', problem: { kind: 'gateway' } });
    expect(run(ready, { type: 'PAY' }, fail(new TypeError('x')))).toMatchObject({
      name: 'error',
      problem: { kind: 'failed' },
    });
  });

  it('final states ignore everything; stray events change nothing', () => {
    const finals: CheckoutState[] = [
      { name: 'redirecting', gatewayUrl: 'https://x' },
      { name: 'granted', paymentId: 'p' },
      { name: 'disabled' },
      { name: 'owned' },
      { name: 'loginNeeded' },
    ];
    const events: CheckoutEvent[] = [
      { type: 'QUOTED', quote: PLAIN },
      { type: 'APPLY', code: 'X' },
      { type: 'PAY' },
      { type: 'REDIRECT', gatewayUrl: 'https://y' },
      { type: 'GRANTED', paymentId: 'q' },
      fail(new AppError('NETWORK', 'x')),
      { type: 'RETRY' },
    ];
    for (const state of finals)
      for (const event of events) expect(transition(state, event)).toBe(state);
    // Paying twice is impossible: PAY is only heard in `ready`.
    const requesting: CheckoutState = { name: 'requesting', quote: PLAIN };
    expect(transition(requesting, { type: 'PAY' })).toBe(requesting);
    expect(transition(CHECKOUT_START, { type: 'PAY' })).toBe(CHECKOUT_START);
  });
});

// ---------------------------------------------------------------------------- flow

function flowDeps(over: Partial<CheckoutDeps> = {}) {
  const rec = {
    quoted: [] as Array<string | null>,
    requested: [] as Array<string | null>,
    pending: [] as Array<{ paymentId: string; userId: string }>,
    started: 0,
    reports: [] as string[],
    order: [] as string[],
  };
  const deps: CheckoutDeps = {
    quote: async (code) => {
      rec.quoted.push(code);
      return PLAIN;
    },
    request: async (code) => {
      rec.requested.push(code);
      return { paymentId: 'p1', gatewayUrl: 'https://sandbox.zarinpal.com/pg/StartPay/A1' };
    },
    userId: () => 'user-a',
    writePending: async (paymentId, userId) => {
      rec.order.push('writePending');
      rec.pending.push({ paymentId, userId });
    },
    onStarted: () => {
      rec.started += 1;
    },
    reportError: (_err, phase) => rec.reports.push(phase),
    ...over,
  };
  return { rec, deps };
}

describe('checkout flow', () => {
  it('fetchQuote passes the code through and never throws', async () => {
    const { rec, deps } = flowDeps();
    await expect(fetchQuote(deps, 'HALF50')).resolves.toEqual({ type: 'QUOTED', quote: PLAIN });
    expect(rec.quoted).toEqual(['HALF50']);

    const broken = flowDeps({ quote: () => Promise.reject(new TypeError('x')) });
    await expect(fetchQuote(broken.deps, null)).resolves.toMatchObject({ type: 'FAILED' });
    expect(broken.rec.reports).toEqual(['checkout.quote']);
  });

  it('writes pendingPayment before it hands back the gateway URL', async () => {
    const { rec, deps } = flowDeps();
    const event = await startPayment(deps, 'HALF50');
    expect(event).toEqual({
      type: 'REDIRECT',
      gatewayUrl: 'https://sandbox.zarinpal.com/pg/StartPay/A1',
    });
    expect(rec.requested).toEqual(['HALF50']);
    expect(rec.pending).toEqual([{ paymentId: 'p1', userId: 'user-a' }]);
    expect(rec.started).toBe(1);
  });

  it('a 100 % grant writes no pending record and goes straight to the result', async () => {
    const { rec, deps } = flowDeps({
      request: async () => ({ paymentId: 'p9', granted: true }) as PayRequestResponse,
    });
    await expect(startPayment(deps, 'FREE')).resolves.toEqual({ type: 'GRANTED', paymentId: 'p9' });
    expect(rec.pending).toEqual([]);
  });

  it('a pending record that cannot be written is reported, and the payment still goes ahead', async () => {
    const { rec, deps } = flowDeps({ writePending: () => Promise.reject(new Error('IDB')) });
    await expect(startPayment(deps, null)).resolves.toMatchObject({ type: 'REDIRECT' });
    expect(rec.reports).toEqual(['checkout.writePending']);
  });

  it('refuses a gateway URL that is not http(s)', async () => {
    for (const gatewayUrl of [
      undefined,
      '',
      'javascript:alert(1)',
      '/relative',
      'data:text/html,x',
    ]) {
      const { rec, deps } = flowDeps({
        request: async () => ({
          paymentId: 'p1',
          ...(gatewayUrl === undefined ? {} : { gatewayUrl }),
        }),
      });
      await expect(startPayment(deps, null)).resolves.toEqual({
        type: 'FAILED',
        failure: { kind: 'failed' },
      });
      expect(rec.pending).toEqual([]);
      expect(rec.reports).toEqual(['checkout.request']);
    }
    expect(isGatewayUrl('http://127.0.0.1:8091/api/pay/callback?Status=OK')).toBe(true);
  });

  it('logged out: asks nothing and says loginNeeded', async () => {
    const { rec, deps } = flowDeps({ userId: () => null });
    await expect(startPayment(deps, null)).resolves.toEqual({
      type: 'FAILED',
      failure: { kind: 'unauthorized' },
    });
    expect(rec.requested).toEqual([]);
  });

  it('staging: the gate is a named outcome, never a report', async () => {
    const gate = new AppError('SERVER_PAYMENT_DISABLED_MOCK_SMS', 'gated', { status: 503 });
    const { rec, deps } = flowDeps({
      quote: () => Promise.reject(gate),
      request: () => Promise.reject(gate),
    });
    await expect(fetchQuote(deps, null)).resolves.toEqual({
      type: 'FAILED',
      failure: { kind: 'disabled' },
    });
    await expect(startPayment(deps, null)).resolves.toEqual({
      type: 'FAILED',
      failure: { kind: 'disabled' },
    });
    expect(rec.reports).toEqual([]);
  });

  it('failureFromError reads codeStatus off DISCOUNT_REJECTED, defaulting to invalid', () => {
    expect(
      failureFromError(new AppError('SERVER_DISCOUNT_REJECTED', 'x', { codeStatus: 'used' })),
    ).toEqual({ kind: 'discountRejected', codeStatus: 'used' });
    expect(
      failureFromError(new AppError('SERVER_DISCOUNT_REJECTED', 'x', { codeStatus: 'nonsense' })),
    ).toEqual({ kind: 'discountRejected', codeStatus: 'invalid' });
    expect(failureFromError(new AppError('RATE_LIMITED', 'x'))).toEqual({
      kind: 'rateLimited',
      retryAfter: 60,
    });
  });
});
