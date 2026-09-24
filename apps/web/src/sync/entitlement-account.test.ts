/**
 * The shared-phone scenario end to end over the real stores and a fake IndexedDB (ticket
 * dev-payment/01, lead review): A buys and signs out, B signs in, A comes back. The entitlement
 * cache is scoped to the account it was granted to (what.md §7.6), and the loaded package follows
 * the account without a reload.
 */

import type { ContentPackage } from '@kl/content';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/dexie.ts';
import { kvGet, kvSet, putPackage } from '../db/repo.ts';
import type { EntitlementResponse } from '../net/api.ts';
import { type Entitlement, NO_ENTITLEMENT, useAuthStore } from '../stores/auth.ts';
import { useContentStore } from '../stores/content.ts';
import { readEntitlements } from './entitlement.ts';
import { followEntitlementNow } from './entitlement-live.ts';

function pkg(packageId: 'free' | 'paid', words: number): ContentPackage {
  return {
    packageId,
    version: `${packageId}-1`,
    builtAt: '2026-09-25T00:00:00.000Z',
    schemaVersion: 1,
    hash: `hash-${packageId}`,
    items: Array.from({ length: words }, (_, i) => ({
      id: `w${i}`,
      lemma: `w${i}`,
      rank: i + 1,
      weight: 1,
      level: 'B1',
      senses: [],
      confusables: [],
      homograph: { suspected: false, note: null },
      hint: null,
      exam: { timesTested: 0, timesAsAnswer: 0, years: [], lastYear: null, stems: [] },
    })),
  } as unknown as ContentPackage;
}

const A_FULL: Entitlement = {
  status: 'full',
  source: 'zarinpal',
  grantedAt: '2026-09-25 10:00:00.000Z',
  checkedAt: 1,
};
const SERVER_NONE: EntitlementResponse = { status: 'none', source: null, grantedAt: null };
const A = { userId: 'user-a', phone: '+989120000001', token: 'ta' };
const B = { userId: 'user-b', phone: '+989120000002', token: 'tb' };

const AUTH_INITIAL = useAuthStore.getState();
const CONTENT_INITIAL = useContentStore.getState();
let stopFollowing: () => void = () => undefined;
const fetchSpy = vi.fn(() => Promise.reject(new TypeError('no network in this test')));

beforeEach(async () => {
  await db.open();
  await Promise.all([db.packages.clear(), db.kv.clear()]);
  await putPackage(pkg('free', 3), 10);
  await putPackage(pkg('paid', 9), 30);
  useAuthStore.setState({ ...AUTH_INITIAL });
  useContentStore.setState({ ...CONTENT_INITIAL, byId: new Map(), items: [] });
  fetchSpy.mockClear();
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(async () => {
  stopFollowing();
  vi.unstubAllGlobals();
  await Promise.all([db.packages.clear(), db.kv.clear()]);
});

/** Bootstrap as `main.tsx` does it: auth, then the package the entitlement allows. */
async function boot(): Promise<void> {
  await useAuthStore.getState().load('install-1');
  await useContentStore.getState().load(useAuthStore.getState().entitlement.status === 'full');
  stopFollowing = followEntitlementNow();
}

const active = () => useContentStore.getState().active;

describe('the entitlement belongs to the account that bought it', () => {
  it('A full → sign out → none; B signs in → none; A back → full, offline, no network', async () => {
    await kvSet('entitlement', { byUser: { [A.userId]: A_FULL } });
    await kvSet('auth', A);
    await boot();
    expect(useAuthStore.getState().entitlement.status).toBe('full');
    expect(active()).toBe('paid');

    await useAuthStore.getState().signOut();
    expect(useAuthStore.getState().entitlement).toBe(NO_ENTITLEMENT);
    await vi.waitFor(() => expect(active()).toBe('free'));

    await useAuthStore.getState().signIn(B);
    expect(useAuthStore.getState().entitlement.status).toBe('none');
    // B's own /api/me says none: kept beside A's full, no mismatch.
    const merge = await useAuthStore.getState().adoptServerEntitlement(SERVER_NONE, B.userId);
    expect(merge.mismatch).toBe(false);
    expect(active()).toBe('free');
    const stored = readEntitlements(await kvGet('entitlement'));
    expect(stored[A.userId]).toEqual(A_FULL);
    expect(stored[B.userId]?.status).toBe('none');

    await useAuthStore.getState().signOut();
    await useAuthStore.getState().signIn(A);
    expect(useAuthStore.getState().entitlement).toEqual(A_FULL);
    await vi.waitFor(() => expect(active()).toBe('paid'));
    // The stored package came back from IndexedDB; nothing was fetched.
    expect(useContentStore.getState().items).toHaveLength(9);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("a late /api/me answer for A lands in A's record, not in the account signed in now", async () => {
    await kvSet('auth', B);
    await boot();
    await useAuthStore
      .getState()
      .adoptServerEntitlement({ status: 'full', source: 'discount', grantedAt: null }, A.userId);
    expect(useAuthStore.getState().entitlement.status).toBe('none');
    expect(active()).toBe('free');
    expect(readEntitlements(await kvGet('entitlement'))[A.userId]?.status).toBe('full');
  });

  it('within one account: a server none over a cached full keeps full and flags a mismatch', async () => {
    await kvSet('entitlement', { byUser: { [A.userId]: A_FULL } });
    await kvSet('auth', A);
    await boot();
    const merge = await useAuthStore.getState().adoptServerEntitlement(SERVER_NONE, A.userId);
    expect(merge.mismatch).toBe(true);
    expect(useAuthStore.getState().entitlement).toEqual(A_FULL);
    expect(active()).toBe('paid');
  });

  it('an answer with no account (signed out) is dropped', async () => {
    await boot();
    const merge = await useAuthStore
      .getState()
      .adoptServerEntitlement({ status: 'full', source: 'x', grantedAt: null }, null);
    expect(merge.mismatch).toBe(false);
    expect(useAuthStore.getState().entitlement).toBe(NO_ENTITLEMENT);
    expect(await kvGet('entitlement')).toBeUndefined();
  });

  it('a legacy record with no userId (staging builds) belongs to nobody', async () => {
    await kvSet('entitlement', A_FULL);
    await kvSet('auth', A);
    await boot();
    expect(useAuthStore.getState().entitlement.status).toBe('none');
    expect(active()).toBe('free');
  });
});
