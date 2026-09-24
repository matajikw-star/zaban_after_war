import { describe, expect, it } from 'vitest';
import { AppError } from '../errors.ts';
import type { EntitlementResponse, MeResponse } from '../net/api.ts';
import { type Entitlement, NO_ENTITLEMENT } from '../stores/auth.ts';
import { type EntitlementMerge, mergeEntitlement, refreshEntitlement } from './entitlement.ts';

const AT = 1_760_000_000_000;

const FULL: Entitlement = {
  status: 'full',
  source: 'zarinpal',
  grantedAt: '2026-09-24 10:00:00.000Z',
  checkedAt: AT - 1000,
};

const SERVER_FULL: EntitlementResponse = {
  status: 'full',
  source: 'discount',
  grantedAt: '2026-09-24 11:00:00.000Z',
};
const SERVER_NONE: EntitlementResponse = { status: 'none', source: null, grantedAt: null };

describe('mergeEntitlement (what.md §7.6)', () => {
  it('adopts a full entitlement from the server', () => {
    expect(mergeEntitlement(NO_ENTITLEMENT, SERVER_FULL, AT)).toEqual({
      next: {
        status: 'full',
        source: 'discount',
        grantedAt: '2026-09-24 11:00:00.000Z',
        checkedAt: AT,
      },
      mismatch: false,
    });
  });

  it('never revokes: a server none over a cached full keeps the cache and flags it', () => {
    const merge = mergeEntitlement(FULL, SERVER_NONE, AT);
    expect(merge.next).toBe(FULL);
    expect(merge.mismatch).toBe(true);
  });

  it('records a checked none over a cached none', () => {
    expect(mergeEntitlement(NO_ENTITLEMENT, SERVER_NONE, AT)).toEqual({
      next: { status: 'none', source: null, grantedAt: null, checkedAt: AT },
      mismatch: false,
    });
  });

  it('keeps the cached source when a purchase result only says entitled', () => {
    const merge = mergeEntitlement(FULL, { status: 'full', source: null, grantedAt: null }, AT);
    expect(merge.next).toEqual({ ...FULL, checkedAt: AT });
  });

  it('ignores a malformed answer entirely', () => {
    for (const junk of [null, undefined, {}, { status: 'paid' }, 'full']) {
      expect(mergeEntitlement(FULL, junk, AT)).toEqual({ next: FULL, mismatch: false });
      expect(mergeEntitlement(NO_ENTITLEMENT, junk, AT).next).toBe(NO_ENTITLEMENT);
    }
  });
});

function me(entitlement: EntitlementResponse): MeResponse {
  return { user: { id: 'u', phone: '+98912', profile: null }, entitlement, profileUpdatedAt: null };
}

function refreshHarness(cached: Entitlement, fetchMe: () => Promise<MeResponse>) {
  const rec = { entitled: 0, reports: [] as AppError[], cache: cached };
  const deps = {
    fetchMe,
    adopt: async (server: EntitlementResponse): Promise<EntitlementMerge> => {
      const merge = mergeEntitlement(rec.cache, server, AT);
      rec.cache = merge.next;
      return merge;
    },
    onEntitled: () => {
      rec.entitled += 1;
    },
    reportError: (err: AppError) => {
      rec.reports.push(err);
    },
  };
  return { rec, deps };
}

describe('refreshEntitlement', () => {
  it('caches a full entitlement and starts the download', async () => {
    const { rec, deps } = refreshHarness(NO_ENTITLEMENT, async () => me(SERVER_FULL));
    await expect(refreshEntitlement(deps)).resolves.toBe('full');
    expect(rec.cache.status).toBe('full');
    expect(rec.entitled).toBe(1);
  });

  it('a server none over a cached full: still full, one mismatch record, download still runs', async () => {
    const { rec, deps } = refreshHarness(FULL, async () => me(SERVER_NONE));
    await expect(refreshEntitlement(deps)).resolves.toBe('full');
    expect(rec.cache).toBe(FULL);
    expect(rec.reports.map((e) => e.code)).toEqual(['ENTITLEMENT_MISMATCH']);
    expect(rec.entitled).toBe(1);
  });

  it('offline or failing: changes nothing and never throws', async () => {
    const { rec, deps } = refreshHarness(FULL, () => Promise.reject(new AppError('NETWORK', 'x')));
    await expect(refreshEntitlement(deps)).resolves.toBe('failed');
    expect(rec.cache).toBe(FULL);
    expect(rec.entitled).toBe(0);
  });

  it('a 401, a 5xx, a 503 or a malformed body never downgrade a cached full', async () => {
    const failures = [
      new AppError('UNAUTHORIZED', 'token expired', { status: 401 }),
      new AppError('SERVER_INTERNAL', 'boom', { status: 500 }),
      new AppError('HTTP_502', 'bad gateway', { status: 502 }),
      new AppError('SERVER_PAYMENT_DISABLED_MOCK_SMS', 'gated', { status: 503 }),
      new TypeError('Failed to fetch'),
    ];
    for (const failure of failures) {
      const { rec, deps } = refreshHarness(FULL, () => Promise.reject(failure));
      await expect(refreshEntitlement(deps)).resolves.toBe('failed');
      expect(rec.cache).toBe(FULL);
    }
    const junk = refreshHarness(FULL, async () => ({ user: null }) as unknown as MeResponse);
    await expect(refreshEntitlement(junk.deps)).resolves.toBe('full');
    expect(junk.rec.cache).toBe(FULL);
  });

  it('a cache write that fails is reported, and the refresh still never throws', async () => {
    const { rec, deps } = refreshHarness(NO_ENTITLEMENT, async () => me(SERVER_FULL));
    const failing = {
      ...deps,
      adopt: () => Promise.reject(new Error('QuotaExceededError')),
    };
    await expect(refreshEntitlement(failing)).resolves.toBe('failed');
    expect(rec.reports.map((e) => e.code)).toEqual(['ENTITLEMENT_STORE_FAILED']);
    expect(rec.entitled).toBe(0);
  });

  it('none stays none and starts nothing', async () => {
    const { rec, deps } = refreshHarness(NO_ENTITLEMENT, async () => me(SERVER_NONE));
    await expect(refreshEntitlement(deps)).resolves.toBe('none');
    expect(rec.entitled).toBe(0);
    expect(rec.reports).toEqual([]);
  });
});
