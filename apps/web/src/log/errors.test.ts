import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/dexie.ts';
import { outboxByKind } from '../db/repo.ts';
import { setClockForTests } from '../engine/clock.ts';
import { useAuthStore } from '../stores/auth.ts';
import { breadcrumb, clearBreadcrumbs } from './breadcrumbs.ts';
import { type ClientErrorRecord, reportError, resetErrorDedupeForTests } from './errors.ts';

const T0 = 1_760_000_000_000;

/** Every field §10.1 lists, in the order it lists them. */
const REQUIRED_FIELDS = [
  'kind',
  'fingerprint',
  'message',
  'stack',
  'appVersion',
  'buildSha',
  'route',
  'installId',
  'userId',
  'at',
  'online',
  'device',
  'breadcrumbs',
  'snapshot',
  'userNote',
  'count',
] as const;

const REQUIRED_DEVICE_FIELDS = ['ua', 'platform', 'screen', 'memory', 'standalone', 'twa'] as const;

/**
 * One throw site, so repeated calls produce the same top stack frame. That is the point of the
 * fingerprint: the same bug hit twice, not two errors that happen to share a message.
 */
function sameBug(): Error {
  return new Error('same');
}

const REQUIRED_SNAPSHOT_FIELDS = [
  'eventCount',
  'unsyncedCount',
  'lastBackupAt',
  'syncState',
  'entitlement',
  'activePackage',
  'packageVersions',
  'downloadState',
  'swVersion',
  'storage',
  'goal',
  'streak',
  'presentationsToday',
  'lastEvents',
] as const;

beforeEach(async () => {
  await db.open();
  await Promise.all([db.events.clear(), db.outbox.clear(), db.packages.clear(), db.kv.clear()]);
  resetErrorDedupeForTests();
  clearBreadcrumbs();
  setClockForTests(() => T0);
  useAuthStore.setState({ installId: 'install-1', userId: null });
});

afterEach(async () => {
  setClockForTests(null);
  clearBreadcrumbs();
  resetErrorDedupeForTests();
  await db.outbox.clear();
});

describe('reportError', () => {
  it('builds a record with every field of what.md §10.1', async () => {
    breadcrumb('nav', '/review');

    const record = await reportError('react', new Error('render blew up'));

    expect(record).not.toBeNull();
    const built = record as ClientErrorRecord;
    for (const field of REQUIRED_FIELDS) expect(Object.hasOwn(built, field)).toBe(true);
    for (const field of REQUIRED_DEVICE_FIELDS)
      expect(Object.hasOwn(built.device, field)).toBe(true);
    for (const field of REQUIRED_SNAPSHOT_FIELDS)
      expect(Object.hasOwn(built.snapshot, field)).toBe(true);

    expect(built.kind).toBe('react');
    expect(built.message).toBe('render blew up');
    expect(built.at).toBe(T0);
    expect(built.installId).toBe('install-1');
    expect(built.userId).toBeNull();
    expect(built.userNote).toBeNull();
    expect(built.count).toBe(1);
    expect(built.fingerprint.length).toBeGreaterThan(0);
    // The crumb recorded before the error is part of the record it describes.
    expect(built.breadcrumbs.some((crumb) => crumb.msg === '/review')).toBe(true);
  });

  it('queues the record in the outbox so an offline error survives', async () => {
    await reportError('sync', new Error('push failed'));

    const queued = await outboxByKind('error');
    expect(queued).toHaveLength(1);
    expect((queued[0] as { payload: ClientErrorRecord }).payload.kind).toBe('sync');
  });

  it('dedupes a repeated fingerprint within the session', async () => {
    const first = await reportError('error', sameBug());
    const second = await reportError('error', sameBug());

    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(first?.fingerprint.length).toBeGreaterThan(0);
    expect(await outboxByKind('error')).toHaveLength(1);
  });

  it('treats a different kind of the same message as a different fingerprint', async () => {
    await reportError('error', sameBug());
    const other = await reportError('sw', sameBug());

    expect(other).not.toBeNull();
    expect(await outboxByKind('error')).toHaveLength(2);
  });

  it('treats the same message thrown from a different place as a different bug', async () => {
    const here = await reportError('error', new Error('same'));
    const there = await reportError('error', sameBug());

    expect(here?.fingerprint).not.toBe(there?.fingerprint);
    expect(there).not.toBeNull();
  });

  it('carries a user note only for a user report', async () => {
    const record = await reportError('user_report', new Error('the card is wrong'), undefined, {
      userNote: 'کارت اشتباه است',
    });

    expect(record?.userNote).toBe('کارت اشتباه است');
  });

  it('handles a thrown non-Error without a stack', async () => {
    const record = await reportError('error', 'plain string failure');

    expect(record?.message).toBe('plain string failure');
    expect(record?.stack).toBeNull();
  });
});
