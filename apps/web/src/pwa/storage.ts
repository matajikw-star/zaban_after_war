/**
 * Persistent storage and the storage estimate (`what.md` §7.7, §10.1).
 *
 * Both are guarded: the Storage API is missing entirely in some browsers and can throw in
 * others (a private window, a blocked-cookies setting), and neither case should cost the caller
 * — onboarding's persist request, the settings screen, or an error snapshot — more than a
 * conservative default.
 */

export async function requestPersist(): Promise<boolean> {
  const manager = globalThis.navigator?.storage;
  if (manager?.persist === undefined) return false;
  try {
    return await manager.persist();
  } catch {
    return false;
  }
}

export interface StorageEstimateResult {
  readonly usage: number;
  readonly quota: number;
}

const NO_ESTIMATE: StorageEstimateResult = { usage: 0, quota: 0 };

export async function storageEstimate(): Promise<StorageEstimateResult> {
  const manager = globalThis.navigator?.storage;
  if (manager?.estimate === undefined) return NO_ESTIMATE;
  try {
    const estimate = await manager.estimate();
    return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 };
  } catch {
    return NO_ESTIMATE;
  }
}

/**
 * The controlling service worker's script URL, or `null` when none controls this page (no SW
 * registered yet, or the very first load before it takes control). Truthful, unlike the old
 * `snapshot.ts` read of `kv.swUpdateAvailable`, which only ever meant "an update is waiting",
 * never "this version is installed" (§10.1).
 */
export function controllingServiceWorkerUrl(): string | null {
  return globalThis.navigator?.serviceWorker?.controller?.scriptURL ?? null;
}
