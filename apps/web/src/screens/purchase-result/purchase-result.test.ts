import { describe, expect, it } from 'vitest';
import type { RefreshOutcome } from '../../sync/entitlement.ts';
import type { PaymentOutcome } from '../../sync/payment-status.ts';
import { confirmOk, type ResultDeps, waitForPayment } from './flow.ts';
import {
  initialResultState,
  type ResultEvent,
  type ResultState,
  refFromQuery,
  transition,
} from './machine.ts';

const q = (query: string) => new URLSearchParams(query);

describe('initialResultState: the query decides only which question to ask', () => {
  it('ok → confirming, keeping the payment id and the ref for display', () => {
    const params = q('status=ok&ref=MOCK-0123456789&paymentId=p1');
    expect(initialResultState(params)).toEqual({ name: 'confirming', paymentId: 'p1' });
    expect(refFromQuery(params)).toBe('MOCK-0123456789');
  });

  it('failed → failed with the reason, «other» when it has none', () => {
    expect(initialResultState(q('status=failed&reason=cancelled&paymentId=p1'))).toEqual({
      name: 'failed',
      reason: 'cancelled',
    });
    expect(initialResultState(q('status=failed&reason=unknown_payment'))).toEqual({
      name: 'failed',
      reason: 'unknown_payment',
    });
    expect(initialResultState(q('status=failed'))).toEqual({ name: 'failed', reason: 'other' });
  });

  it('pending, or no status at all, asks about the payment; with no id there is nothing to ask', () => {
    expect(initialResultState(q('status=pending&paymentId=p1'))).toEqual({
      name: 'waiting',
      paymentId: 'p1',
    });
    expect(initialResultState(q('paymentId=p1'))).toEqual({ name: 'waiting', paymentId: 'p1' });
    expect(initialResultState(q('status=pending'))).toEqual({
      name: 'failed',
      reason: 'unknown_payment',
    });
    expect(initialResultState(q(''))).toEqual({ name: 'failed', reason: 'unknown_payment' });
  });
});

describe('result transitions', () => {
  const confirming: ResultState = { name: 'confirming', paymentId: 'p1' };
  const waiting: ResultState = { name: 'waiting', paymentId: 'p1' };

  it('confirming: /api/me says full → entitled; none → wait on the payment itself', () => {
    expect(transition(confirming, { type: 'ENTITLED', refId: 'R' })).toEqual({
      name: 'entitled',
      refId: 'R',
    });
    expect(transition(confirming, { type: 'NOT_YET' })).toEqual(waiting);
    expect(transition({ name: 'confirming', paymentId: null }, { type: 'NOT_YET' })).toEqual({
      name: 'failed',
      reason: 'unknown_payment',
    });
  });

  it('offline retries the question it could not ask', () => {
    const a = transition(confirming, { type: 'OFFLINE' });
    expect(a).toEqual({ name: 'offline', then: 'confirm', paymentId: 'p1' });
    expect(transition(a, { type: 'RETRY' })).toEqual(confirming);
    const b = transition(waiting, { type: 'OFFLINE' });
    expect(transition(b, { type: 'RETRY' })).toEqual(waiting);
  });

  it('waiting: every terminal answer, and a spent budget → stillPending → ask again', () => {
    const answers: Array<[ResultEvent, ResultState['name']]> = [
      [{ type: 'ENTITLED', refId: null }, 'entitled'],
      [{ type: 'FAILED', reason: 'not_paid' }, 'failed'],
      [{ type: 'UNAUTHORIZED' }, 'loginNeeded'],
      [{ type: 'INCONSISTENT' }, 'inconsistent'],
      [{ type: 'DISABLED' }, 'disabled'],
      [{ type: 'STILL_PENDING' }, 'stillPending'],
    ];
    for (const [event, name] of answers) expect(transition(waiting, event).name).toBe(name);
    const still = transition(waiting, { type: 'STILL_PENDING' });
    expect(transition(still, { type: 'RETRY' })).toEqual(waiting);
  });

  it('final states ignore everything', () => {
    const finals: ResultState[] = [
      { name: 'entitled', refId: null },
      { name: 'failed', reason: 'x' },
      { name: 'loginNeeded' },
      { name: 'inconsistent' },
      { name: 'disabled' },
    ];
    const events: ResultEvent[] = [
      { type: 'ENTITLED', refId: null },
      { type: 'NOT_YET' },
      { type: 'STILL_PENDING' },
      { type: 'FAILED', reason: 'y' },
      { type: 'OFFLINE' },
      { type: 'RETRY' },
    ];
    for (const s of finals) for (const e of events) expect(transition(s, e)).toBe(s);
  });
});

function deps(refresh: RefreshOutcome, poll: PaymentOutcome, userId: string | null = 'u') {
  const rec = { settled: [] as string[], purchased: 0, polled: [] as string[], refreshed: 0 };
  const d: ResultDeps = {
    userId: () => userId,
    refreshEntitlement: async () => {
      rec.refreshed += 1;
      return refresh;
    },
    poll: async (id) => {
      rec.polled.push(id);
      return poll;
    },
    settlePending: async (id) => {
      rec.settled.push(id);
    },
    onPurchased: () => {
      rec.purchased += 1;
    },
    reportError: () => undefined,
  };
  return { d, rec };
}

describe('confirmOk', () => {
  it('full: settles the pending record, queues purchase_done, entitled', async () => {
    const { d, rec } = deps('full', { kind: 'pending' });
    await expect(confirmOk(d, 'p1', 'R')).resolves.toEqual({ type: 'ENTITLED', refId: 'R' });
    expect(rec.settled).toEqual(['p1']);
    expect(rec.purchased).toBe(1);
  });

  it('none: not yet; failed: offline; nothing settled', async () => {
    const none = deps('none', { kind: 'pending' });
    await expect(confirmOk(none.d, 'p1', null)).resolves.toEqual({ type: 'NOT_YET' });
    const failed = deps('failed', { kind: 'pending' });
    await expect(confirmOk(failed.d, 'p1', null)).resolves.toEqual({ type: 'OFFLINE' });
    expect([...none.rec.settled, ...failed.rec.settled]).toEqual([]);
  });

  it('logged out: asks nothing', async () => {
    const { d, rec } = deps('full', { kind: 'pending' }, null);
    await expect(confirmOk(d, 'p1', null)).resolves.toEqual({ type: 'UNAUTHORIZED' });
    expect(rec.refreshed).toBe(0);
  });
});

describe('waitForPayment', () => {
  it.each([
    [
      { kind: 'entitled', refId: 'R' },
      { type: 'ENTITLED', refId: 'R' },
    ],
    [
      { kind: 'failed', reason: 'cancelled' },
      { type: 'FAILED', reason: 'cancelled' },
    ],
    [{ kind: 'unknown' }, { type: 'FAILED', reason: 'unknown_payment' }],
    [{ kind: 'disabled' }, { type: 'DISABLED' }],
    [{ kind: 'unauthorized' }, { type: 'UNAUTHORIZED' }],
    [{ kind: 'inconsistent' }, { type: 'INCONSISTENT' }],
    [{ kind: 'network' }, { type: 'OFFLINE' }],
    [{ kind: 'pending' }, { type: 'STILL_PENDING' }],
    [{ kind: 'error' }, { type: 'STILL_PENDING' }],
  ] as Array<[PaymentOutcome, ResultEvent]>)('%o → %o', async (outcome, event) => {
    const { d, rec } = deps('none', outcome);
    await expect(waitForPayment(d, 'p1')).resolves.toEqual(event);
    expect(rec.polled).toEqual(['p1']);
  });
});
