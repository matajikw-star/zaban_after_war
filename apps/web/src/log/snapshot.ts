/**
 * The state-of-the-device block attached to every error record (`what.md` §10.1).
 *
 * Its whole purpose is that an agent can answer "what was true when this broke" without asking
 * the owner to reproduce anything (`docs/runbooks/debug-from-log.md`). Nothing identifying goes
 * in: counts, versions, state names and the last twenty events, which carry word ids and grades.
 */

import type { ReviewEvent } from '@kl/core';
import { eventCount, lastEvents, packageVersions, unsyncedCount } from '../db/repo.ts';
import { presentationsToday, streak } from '../engine/index.ts';
import { controllingServiceWorkerUrl } from '../pwa/storage.ts';
import { useAuthStore } from '../stores/auth.ts';
import { useContentStore } from '../stores/content.ts';
import { useSettingsStore } from '../stores/settings.ts';
import { useSyncStore } from '../stores/sync.ts';

export interface StorageSnapshot {
  readonly persisted: boolean;
  readonly usage: number;
  readonly quota: number;
}

export interface ErrorSnapshot {
  readonly eventCount: number;
  readonly unsyncedCount: number;
  readonly lastBackupAt: number | null;
  readonly syncState: string;
  readonly entitlement: string;
  readonly activePackage: string | null;
  readonly packageVersions: Record<string, string>;
  readonly downloadState: string;
  readonly swVersion: string | null;
  readonly storage: StorageSnapshot;
  readonly goal: number;
  readonly streak: number;
  readonly presentationsToday: number;
  /** Last 20, newest first. */
  readonly lastEvents: readonly ReviewEvent[];
}

const NO_STORAGE: StorageSnapshot = { persisted: false, usage: 0, quota: 0 };

async function storageSnapshot(): Promise<StorageSnapshot> {
  const manager = globalThis.navigator?.storage;
  if (manager === undefined) return NO_STORAGE;
  try {
    const persisted = manager.persisted === undefined ? false : await manager.persisted();
    const estimate = manager.estimate === undefined ? {} : await manager.estimate();
    return { persisted, usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 };
  } catch {
    // A browser that refuses the estimate must not cost us the error report.
    return NO_STORAGE;
  }
}

/**
 * Best effort by design: every field has a defined fallback, because a snapshot that throws
 * would swallow the error it was meant to describe.
 */
export async function snapshot(): Promise<ErrorSnapshot> {
  const sync = useSyncStore.getState();
  const auth = useAuthStore.getState();
  const content = useContentStore.getState();
  const settings = useSettingsStore.getState();

  const [events, unsynced, versions, tail, storage] = await Promise.all([
    eventCount().catch(() => 0),
    unsyncedCount().catch(() => 0),
    packageVersions().catch(() => ({}) as Record<string, string>),
    lastEvents(20).catch(() => [] as ReviewEvent[]),
    storageSnapshot(),
  ]);

  let streakDays = 0;
  let today = 0;
  try {
    streakDays = streak().days;
    today = presentationsToday();
  } catch {
    // The fold cache is empty before bootstrap finishes; zero is the honest answer then.
  }

  return {
    eventCount: events,
    unsyncedCount: unsynced,
    lastBackupAt: sync.lastBackupAt,
    syncState: sync.backup.name,
    entitlement: auth.entitlement.status,
    activePackage: content.active,
    packageVersions: versions,
    downloadState: sync.download.name,
    swVersion: controllingServiceWorkerUrl(),
    storage,
    goal: settings.profile.dailyGoal,
    streak: streakDays,
    presentationsToday: today,
    lastEvents: tail,
  };
}
