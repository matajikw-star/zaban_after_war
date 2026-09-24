/**
 * The backup runner bound to the real device (`what.md` §7.4): IndexedDB, `net/api.ts`, the
 * clock, the stores, and the six triggers — app start, `online`, end of a study session (the
 * summary screen, or the app going to the background), every 5 minutes, right after login, and
 * the manual button in settings.
 *
 * `sync/backup.ts` holds the machine and the run; this file holds nothing but wiring, so every
 * behaviour worth a test is tested there with fakes.
 */

import type { OutboxKind } from '../db/dexie.ts';
import {
  insertPulled,
  kvGet,
  kvSet,
  markSynced,
  outboxAll,
  outboxDelete,
  outboxRecordFailure,
  unsyncedCount,
  unsyncedEvents,
} from '../db/repo.ts';
import { now } from '../engine/clock.ts';
import { mergeIntoFold, subscribeToFold } from '../engine/fold-cache.ts';
import { breadcrumb } from '../log/breadcrumbs.ts';
import { reportError } from '../log/errors.ts';
import type { BeaconBody, FlagBody } from '../net/api.ts';
import { postBeacon, postClientErrors, postFlags, syncPull, syncPush } from '../net/api.ts';
import { useAuthStore } from '../stores/auth.ts';
import { useSyncStore } from '../stores/sync.ts';
import {
  type BackupDeps,
  type BackupRunner,
  type BackupTrigger,
  createBackupRunner,
  type SyncCursor,
} from './backup.ts';

/**
 * Which outbox kinds have a server route. All three shipped in ticket dev-server/04:
 * `/api/flags`, `/api/beacon` and `/api/client-errors`. Flipping one back to `false` would leave
 * its items queued — sending them would 404, and a non-429 4xx drops an item, which would throw
 * away every report and flag collected so far — so this only ever goes false→true, never back.
 */
export const OUTBOX_ROUTES_LIVE: Readonly<Record<OutboxKind, boolean>> = {
  flag: true,
  beacon: true,
  error: true,
};

function sendOutbox(kind: OutboxKind, payload: unknown): Promise<unknown> {
  switch (kind) {
    case 'flag':
      return postFlags(payload as FlagBody);
    case 'beacon':
      return postBeacon(payload as BeaconBody);
    case 'error':
      return postClientErrors(payload);
  }
}

function isCursor(value: unknown): value is SyncCursor {
  const v = value as SyncCursor | undefined;
  return typeof v?.userId === 'string' && typeof v.cursor === 'string';
}

const liveDeps: BackupDeps = {
  now,
  isOnline: () => globalThis.navigator?.onLine ?? true,
  userId: () => useAuthStore.getState().userId,

  unsyncedEvents,
  markSynced,
  unsyncedCount,
  insertPulled,
  onNewEvents: (fresh) => {
    mergeIntoFold(fresh);
  },
  readCursor: async () => {
    const stored = await kvGet<unknown>('syncCursor');
    return isCursor(stored) ? stored : null;
  },
  writeCursor: (cursor) => kvSet('syncCursor', cursor),
  writeLastBackupAt: (at) => kvSet('lastBackupAt', at),

  outboxAll,
  outboxDelete,
  outboxRecordFailure,
  outboxRouteLive: (kind) => OUTBOX_ROUTES_LIVE[kind],
  sendOutbox,

  push: syncPush,
  pull: syncPull,

  publishState: (state) => useSyncStore.getState().setBackup(state),
  publishUnsyncedCount: (count) => useSyncStore.getState().setUnsyncedCount(count),
  publishLastBackupAt: (at) => useSyncStore.getState().setLastBackupAt(at),
  reportError: (err, data) => {
    void reportError('sync', err, data);
  },

  setTimer: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimer: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

let runner: BackupRunner | null = null;

/**
 * Ask for a backup. Never throws and never blocks: callers fire and forget. Before
 * `startBackup()` it does nothing, which only happens before bootstrap has finished.
 */
export function requestBackup(trigger: BackupTrigger): Promise<void> {
  if (runner === null) {
    breadcrumb('sync', 'backup.trigger', { trigger, outcome: 'not started' });
    return Promise.resolve();
  }
  return runner.request(trigger).catch((err: unknown) => {
    void reportError('sync', err, { phase: 'backup.request', trigger });
  });
}

async function refreshUnsyncedCount(): Promise<void> {
  try {
    useSyncStore.getState().setUnsyncedCount(await unsyncedCount());
  } catch (err) {
    breadcrumb('sync', 'backup.unsyncedCount.failed', { error: String(err) });
  }
}

/** Called once from `main.tsx`, after the review log is folded. */
export async function startBackup(): Promise<void> {
  if (runner !== null) return;
  runner = createBackupRunner(liveDeps);

  const lastBackupAt = await kvGet<number>('lastBackupAt');
  if (typeof lastBackupAt === 'number') useSyncStore.getState().setLastBackupAt(lastBackupAt);
  await refreshUnsyncedCount();

  // Every recorded review changes the count the home screen's backup dot reads.
  subscribeToFold(() => {
    void refreshUnsyncedCount();
  });

  globalThis.addEventListener('online', () => {
    void requestBackup('online');
  });
  // On a phone the usual end of a session is the app going to the background, not «پایان».
  globalThis.document?.addEventListener('visibilitychange', () => {
    if (globalThis.document.visibilityState === 'hidden') void requestBackup('session-end');
  });

  runner.startInterval();
  void requestBackup('start');
}
