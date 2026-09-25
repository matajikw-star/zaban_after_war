import { describe, expect, it } from 'vitest';
import { AppError } from '../errors.ts';
import type { EntitlementResponse, PayStatusResponse } from '../net/api.ts';
import {
  checkPayment,
  isPendingPayment,
  type PendingPayment,
  POLL_DELAYS_MS,
  type PollDeps,
  pollPayment,
  recoverPendingPayment,
} from './payment-status.ts';

const PENDING: PendingPayment = { paymentId: 'pay123', userId: 'user-a', startedAt: 1 };

function answer(over: Partial<PayStatusResponse>): PayStatusResponse {
  return {
    paymentId: 'pay123',
    status: 'pending',
    refId: null,
    failReason: null,
    entitled: false,
    ...over,
  };
}

type StatusFn = (paymentId: string) => Promise<PayStatusResponse>;

function harness(status: StatusFn, pending: PendingPayment | null = PENDING) {
  const rec = {
    pending,
    adopted: [] as EntitlementResponse[],
    refreshed: 0,
    entitled: 0,
    purchased: 0,
    reports: [] as Array<{ err: unknown; data: unknown }>,
    asked: [] as string[],
    slept: [] as number[],
    userId: 'user-a' as string | null,
    cancelAfterSleeps: Infinity,
  };
  const deps: PollDeps = {
    status: (id) => {
      rec.asked.push(id);
      return status(id);
    },
    adopt: async (server) => {
      rec.adopted.push(server);
    },
    refreshEntitlement: async () => {
      rec.refreshed += 1;
    },
    readPending: async () => rec.pending,
    clearPending: async (paymentId) => {
      if (rec.pending === null || rec.pending.paymentId !== paymentId) return false;
      rec.pending = null;
      return true;
    },
    userId: () => rec.userId,
    onEntitled: () => {
      rec.entitled += 1;
    },
    onPurchased: () => {
      rec.purchased += 1;
    },
    reportError: (err, data) => {
      rec.reports.push({ err, data });
    },
    sleep: async (ms) => {
      rec.slept.push(ms);
    },
    cancelled: () => rec.slept.length >= rec.cancelAfterSleeps,
  };
  return { rec, deps };
}

function codeOf(report: { err: unknown } | undefined): string | undefined {
  return report?.err instanceof AppError ? report.err.code : undefined;
}

describe('isPendingPayment', () => {
  it('accepts the record /checkout writes and nothing else', () => {
    expect(isPendingPayment(PENDING)).toBe(true);
    for (const junk of [null, undefined, {}, { ...PENDING, paymentId: '' }, { paymentId: 'x' }]) {
      expect(isPendingPayment(junk)).toBe(false);
    }
  });
});

describe('checkPayment', () => {
  it('entitled: caches full, refreshes /api/me, starts the download, clears the record, queues purchase_done', async () => {
    const { rec, deps } = harness(async () =>
      answer({ status: 'verified', refId: 'MOCK-1', entitled: true }),
    );
    await expect(checkPayment(deps, 'pay123')).resolves.toEqual({
      kind: 'entitled',
      refId: 'MOCK-1',
    });
    expect(rec.adopted).toEqual([{ status: 'full', source: null, grantedAt: null }]);
    expect(rec.refreshed).toBe(1);
    expect(rec.entitled).toBe(1);
    expect(rec.pending).toBeNull();
    expect(rec.purchased).toBe(1);
  });

  it('entitled once the record is already gone (a reload, a second ask): download, no purchase_done', async () => {
    const { rec, deps } = harness(async () => answer({ status: 'verified', entitled: true }));
    await checkPayment(deps, 'pay123');
    await checkPayment(deps, 'pay123');
    expect(rec.entitled).toBe(2);
    expect(rec.purchased).toBe(1);

    const none = harness(async () => answer({ status: 'verified', entitled: true }), null);
    await expect(checkPayment(none.deps, 'pay123')).resolves.toMatchObject({ kind: 'entitled' });
    expect(none.rec.entitled).toBe(1);
    expect(none.rec.purchased).toBe(0);
  });

  it('entitled for another payment than the record names: the record stays, no purchase_done', async () => {
    const { rec, deps } = harness(async () => answer({ status: 'verified', entitled: true }));
    await checkPayment(deps, 'another');
    expect(rec.pending).toEqual(PENDING);
    expect(rec.entitled).toBe(1);
    expect(rec.purchased).toBe(0);
  });

  it('entitled even when caching fails: reported, the download still starts', async () => {
    const { rec, deps } = harness(async () => answer({ status: 'verified', entitled: true }));
    const failing = { ...deps, adopt: () => Promise.reject(new Error('QuotaExceededError')) };
    await expect(checkPayment(failing, 'pay123')).resolves.toMatchObject({ kind: 'entitled' });
    expect(rec.entitled).toBe(1);
    expect(rec.reports).toHaveLength(1);
  });

  it('pending keeps the record', async () => {
    const { rec, deps } = harness(async () => answer({ status: 'pending' }));
    await expect(checkPayment(deps, 'pay123')).resolves.toEqual({ kind: 'pending' });
    expect(rec.pending).toEqual(PENDING);
    expect(rec.adopted).toEqual([]);
  });

  it('failed and expired clear the record and carry the reason', async () => {
    for (const [over, reason] of [
      [{ status: 'failed', failReason: 'cancelled' }, 'cancelled'],
      [{ status: 'failed', failReason: null }, 'failed'],
      [{ status: 'expired' }, 'expired'],
    ] as const) {
      const { rec, deps } = harness(async () => answer(over));
      await expect(checkPayment(deps, 'pay123')).resolves.toEqual({ kind: 'failed', reason });
      expect(rec.pending).toBeNull();
      expect(rec.entitled).toBe(0);
    }
  });

  it('verified without an entitlement is terminal, cleared and reported — never shown as failed', async () => {
    const { rec, deps } = harness(async () => answer({ status: 'verified', entitled: false }));
    await expect(checkPayment(deps, 'pay123')).resolves.toEqual({ kind: 'inconsistent' });
    expect(rec.pending).toBeNull();
    expect(rec.reports.map(codeOf)).toEqual(['PAY_VERIFIED_NOT_ENTITLED']);
  });

  it('maps each failure, and clears the record only on 404', async () => {
    const cases: Array<[unknown, string, boolean, number]> = [
      [new AppError('NETWORK', 'offline'), 'network', true, 0],
      [
        new AppError('SERVER_PAYMENT_DISABLED_MOCK_SMS', 'gated', { status: 503 }),
        'disabled',
        true,
        0,
      ],
      [new AppError('UNAUTHORIZED', 'expired', { status: 401 }), 'unauthorized', true, 0],
      [new AppError('SERVER_NOT_FOUND', 'no', { status: 404 }), 'unknown', false, 0],
      [new AppError('SERVER_INTERNAL', 'boom', { status: 500 }), 'error', true, 1],
      [new TypeError('weird'), 'error', true, 1],
    ];
    for (const [err, kind, kept, reports] of cases) {
      const { rec, deps } = harness(() => Promise.reject(err));
      await expect(checkPayment(deps, 'pay123')).resolves.toEqual({ kind });
      expect(rec.pending !== null).toBe(kept);
      expect(rec.reports).toHaveLength(reports);
    }
  });

  it("never clears another payment's record", async () => {
    const { rec, deps } = harness(async () => answer({ status: 'failed', failReason: 'not_paid' }));
    await checkPayment(deps, 'another');
    expect(rec.pending).toEqual(PENDING);
  });

  it('a record that cannot be cleared is reported, and the answer still stands', async () => {
    const { rec, deps } = harness(async () =>
      answer({ status: 'failed', failReason: 'cancelled' }),
    );
    const failing = { ...deps, clearPending: () => Promise.reject(new Error('IDB closed')) };
    await expect(checkPayment(failing, 'pay123')).resolves.toMatchObject({ kind: 'failed' });
    expect(rec.reports).toHaveLength(1);
  });

  it('entitled but the record cannot be cleared: download starts, purchase_done waits for the clear', async () => {
    const { rec, deps } = harness(async () => answer({ status: 'verified', entitled: true }));
    const failing = { ...deps, clearPending: () => Promise.reject(new Error('IDB closed')) };
    await expect(checkPayment(failing, 'pay123')).resolves.toMatchObject({ kind: 'entitled' });
    expect(rec.entitled).toBe(1);
    expect(rec.purchased).toBe(0);
    expect(rec.reports).toHaveLength(1);
  });

  it('no terminal answer other than entitled queues purchase_done', async () => {
    for (const over of [
      { status: 'pending' },
      { status: 'failed', failReason: 'cancelled' },
      { status: 'expired' },
      { status: 'verified', entitled: false },
    ] as const) {
      const { rec, deps } = harness(async () => answer(over));
      await checkPayment(deps, 'pay123');
      expect(rec.purchased).toBe(0);
      expect(rec.entitled).toBe(0);
    }
  });
});

describe('recoverPendingPayment (launch)', () => {
  it('nothing pending: asks nothing', async () => {
    const { rec, deps } = harness(async () => answer({}), null);
    await expect(recoverPendingPayment(deps)).resolves.toBe('none');
    expect(rec.asked).toEqual([]);
  });

  it('asks before assuming failure, and settles an entitled payment', async () => {
    const { rec, deps } = harness(async () => answer({ status: 'verified', entitled: true }));
    await expect(recoverPendingPayment(deps)).resolves.toBe('entitled');
    expect(rec.asked).toEqual(['pay123']);
    expect(rec.pending).toBeNull();
    expect(rec.entitled).toBe(1);
    expect(rec.purchased).toBe(1);
  });

  it('offline: the record stays for the next launch', async () => {
    const { rec, deps } = harness(() => Promise.reject(new AppError('NETWORK', 'offline')));
    await expect(recoverPendingPayment(deps)).resolves.toBe('network');
    expect(rec.pending).toEqual(PENDING);
    expect(rec.reports).toEqual([]);
  });

  it('still pending on the server: the record stays', async () => {
    const { rec, deps } = harness(async () => answer({ status: 'pending' }));
    await expect(recoverPendingPayment(deps)).resolves.toBe('pending');
    expect(rec.pending).toEqual(PENDING);
  });

  it("another account's record (or a logged-out device) is kept and not asked about", async () => {
    for (const userId of ['user-b', null]) {
      const { rec, deps } = harness(async () => answer({}));
      rec.userId = userId;
      await expect(recoverPendingPayment(deps)).resolves.toBe('other-account');
      expect(rec.asked).toEqual([]);
      expect(rec.pending).toEqual(PENDING);
    }
  });

  it('a record that cannot be read is reported, never thrown', async () => {
    const { rec, deps } = harness(async () => answer({}));
    const failing = { ...deps, readPending: () => Promise.reject(new Error('IDB closed')) };
    await expect(recoverPendingPayment(failing)).resolves.toBe('error');
    expect(rec.reports).toHaveLength(1);
  });
});

describe('pollPayment (bounded backoff)', () => {
  it('stops at the first terminal answer', async () => {
    const answers = [answer({}), answer({}), answer({ status: 'verified', entitled: true })];
    const { rec, deps } = harness(async () => answers.shift() ?? answer({}));
    await expect(pollPayment(deps, 'pay123')).resolves.toMatchObject({ kind: 'entitled' });
    expect(rec.asked).toHaveLength(3);
    expect(rec.slept).toEqual([2_000, 3_000]);
    expect(rec.purchased).toBe(1);
  });

  it('reaching entitled after the record was already cleared queues no purchase_done', async () => {
    const answers = [answer({}), answer({ status: 'verified', entitled: true })];
    const { rec, deps } = harness(async () => answers.shift() ?? answer({}));
    const racing = {
      ...deps,
      // The launch recovery (or the ok landing) settled it while this poll slept.
      sleep: async (ms: number) => {
        rec.slept.push(ms);
        rec.pending = null;
      },
    };
    await expect(pollPayment(racing, 'pay123')).resolves.toMatchObject({ kind: 'entitled' });
    expect(rec.entitled).toBe(1);
    expect(rec.purchased).toBe(0);
  });

  it('gives up after the last delay with the last answer, never more asks than delays + 1', async () => {
    const { rec, deps } = harness(async () => answer({ status: 'pending' }));
    await expect(pollPayment(deps, 'pay123')).resolves.toEqual({ kind: 'pending' });
    expect(rec.asked).toHaveLength(POLL_DELAYS_MS.length + 1);
    expect(rec.slept).toEqual([...POLL_DELAYS_MS]);
    expect(rec.slept.reduce((a, b) => a + b, 0)).toBeLessThan(3 * 60_000);
    expect(Math.max(...rec.slept)).toBe(30_000);
  });

  it('keeps asking through network errors; stops at once on the staging gate', async () => {
    const flaky = [new AppError('NETWORK', 'x'), new AppError('NETWORK', 'x')];
    const a = harness(async () => {
      const err = flaky.shift();
      if (err !== undefined) throw err;
      return answer({ status: 'failed', failReason: 'not_paid' });
    });
    await expect(pollPayment(a.deps, 'pay123')).resolves.toEqual({
      kind: 'failed',
      reason: 'not_paid',
    });
    expect(a.rec.asked).toHaveLength(3);

    const b = harness(() =>
      Promise.reject(new AppError('SERVER_PAYMENT_DISABLED_MOCK_SMS', 'gated', { status: 503 })),
    );
    await expect(pollPayment(b.deps, 'pay123')).resolves.toEqual({ kind: 'disabled' });
    expect(b.rec.asked).toHaveLength(1);
  });

  it('stops asking once the screen has gone', async () => {
    const { rec, deps } = harness(async () => answer({ status: 'pending' }));
    rec.cancelAfterSleeps = 2;
    await pollPayment(deps, 'pay123');
    expect(rec.asked).toHaveLength(2);
  });
});
