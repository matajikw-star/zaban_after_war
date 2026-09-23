import type { ContentPackage } from '@kl/content';
import type { ReviewEvent } from '@kl/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from './dexie.ts';
import {
  allEvents,
  appendEvent,
  eventCount,
  getPackage,
  insertPulled,
  kvDelete,
  kvGet,
  kvSet,
  lastEvents,
  markSynced,
  outboxAll,
  outboxDelete,
  outboxEnqueue,
  outboxRecordFailure,
  packageVersions,
  putPackage,
  unsyncedCount,
  unsyncedEvents,
} from './repo.ts';

function event(id: string, itemId: string, at: number): ReviewEvent {
  return { id, itemId, at, kind: 'review', grade: 1, device: 'device-1' };
}

beforeEach(async () => {
  await db.open();
  await Promise.all([db.events.clear(), db.outbox.clear(), db.packages.clear(), db.kv.clear()]);
});

afterEach(async () => {
  await Promise.all([db.events.clear(), db.outbox.clear(), db.packages.clear(), db.kv.clear()]);
});

describe('events', () => {
  it('round-trips an appended event, unsynced', async () => {
    await appendEvent(event('a', 'abandon', 1000));

    expect(await eventCount()).toBe(1);
    expect(await allEvents()).toEqual([event('a', 'abandon', 1000)]);
    expect(await unsyncedCount()).toBe(1);
    expect((await unsyncedEvents()).map((e) => e.id)).toEqual(['a']);
  });

  it('orders reads by `at` and the unsynced queue oldest first', async () => {
    await appendEvent(event('c', 'acquire', 3000));
    await appendEvent(event('a', 'abandon', 1000));
    await appendEvent(event('b', 'abundant', 2000));

    expect((await allEvents()).map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect((await unsyncedEvents()).map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect((await lastEvents(2)).map((e) => e.id)).toEqual(['c', 'b']);
  });

  it('markSynced clears exactly the ids it is given', async () => {
    await appendEvent(event('a', 'abandon', 1000));
    await appendEvent(event('b', 'abundant', 2000));

    await markSynced(['a']);

    expect(await unsyncedCount()).toBe(1);
    expect((await unsyncedEvents()).map((e) => e.id)).toEqual(['b']);
    // Nothing was deleted: the log is append-only (ADR-0002).
    expect(await eventCount()).toBe(2);
  });

  it('markSynced with an empty list is a no-op', async () => {
    await appendEvent(event('a', 'abandon', 1000));
    await markSynced([]);
    expect(await unsyncedCount()).toBe(1);
  });

  it('insertPulled adds unknown ids as synced and never touches a known one', async () => {
    await appendEvent(event('local', 'abandon', 1000));

    const inserted = await insertPulled([
      event('local', 'abandon', 1000),
      event('remote', 'bear', 2000),
    ]);

    expect(inserted).toBe(1);
    expect(await eventCount()).toBe(2);
    // The local event is still waiting for its own push to succeed.
    expect((await unsyncedEvents()).map((e) => e.id)).toEqual(['local']);
  });

  it('insertPulled with nothing to insert reports zero', async () => {
    expect(await insertPulled([])).toBe(0);
  });
});

describe('outbox', () => {
  it('enqueues, lists oldest first and deletes by seq', async () => {
    const first = await outboxEnqueue('beacon', { name: 'first_open' });
    await outboxEnqueue('error', { message: 'boom' });

    const rows = await outboxAll();
    expect(rows).toHaveLength(2);
    expect(rows[0]?.kind).toBe('beacon');
    expect(rows[0]?.attempts).toBe(0);
    expect(rows[0]?.lastError).toBeNull();

    await outboxDelete(first);
    expect((await outboxAll()).map((r) => r.kind)).toEqual(['error']);
  });

  it('records a failure without losing the payload', async () => {
    const seq = await outboxEnqueue('flag', { itemId: 'bear' });
    await outboxRecordFailure(seq, 'NETWORK');

    const [row] = await outboxAll();
    expect(row?.attempts).toBe(1);
    expect(row?.lastError).toBe('NETWORK');
    expect(row?.payload).toEqual({ itemId: 'bear' });
  });

  it('recording a failure for a row that is gone does nothing', async () => {
    await expect(outboxRecordFailure(999, 'NETWORK')).resolves.toBeUndefined();
  });
});

describe('packages', () => {
  const pkg: ContentPackage = {
    packageId: 'free',
    version: '2026-09-30.1',
    builtAt: '2026-09-30T00:00:00.000Z',
    schemaVersion: 1,
    hash: 'abc',
    items: [],
  };

  it('round-trips a package and reports its version', async () => {
    expect(await getPackage('free')).toBeNull();

    await putPackage(pkg, 1234);

    expect(await getPackage('free')).toEqual(pkg);
    expect(await packageVersions()).toEqual({ free: '2026-09-30.1' });
  });
});

describe('kv', () => {
  it('round-trips a value and deletes it', async () => {
    expect(await kvGet<string>('installId')).toBeUndefined();

    await kvSet('installId', 'install-1');
    expect(await kvGet<string>('installId')).toBe('install-1');

    await kvSet('installId', 'install-2');
    expect(await kvGet<string>('installId')).toBe('install-2');

    await kvDelete('installId');
    expect(await kvGet<string>('installId')).toBeUndefined();
  });

  it('stores a structured value as itself', async () => {
    await kvSet('entitlement', { status: 'full', source: 'purchase', grantedAt: 1, checkedAt: 2 });
    expect(await kvGet<{ status: string }>('entitlement')).toEqual({
      status: 'full',
      source: 'purchase',
      grantedAt: 1,
      checkedAt: 2,
    });
  });
});
