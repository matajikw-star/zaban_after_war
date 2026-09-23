/**
 * The onboarding finish effect (`what.md` §7.8 onboarding row, ticket 02): writes the profile,
 * queues `onboarding_done`, asks for persistent storage, then navigates home. A plain function
 * over injected deps so it is testable without IndexedDB, the network, or React — `Onboarding.tsx`
 * is the only caller, and it owns the deps (the real store action, the real `outboxEnqueue`).
 *
 * Idempotent by construction: `createFinishOnboarding` closes over a `fired` flag, so a second
 * call — the machine re-entering `done` under React's dev-mode double effect, or two rapid taps
 * on the last step — is a no-op rather than a second profile write or a second beacon.
 */

import { now } from '../../engine/clock.ts';
import type { BeaconEvent } from '../../net/api.ts';
import type { ProfilePatch } from '../../stores/settings.ts';
import { APP_VERSION } from '../../version.ts';

export interface FinishOnboardingInput {
  readonly minutesPerDay: number;
  readonly examDate: number | null;
  readonly fieldCode: string | null;
}

export interface FinishOnboardingDeps {
  readonly setProfile: (patch: ProfilePatch) => Promise<void>;
  readonly queueBeacon: (installId: string, events: readonly BeaconEvent[]) => Promise<void>;
  readonly installId: string;
  /** Feature-detected and guarded by the caller: resolves `false` rather than rejecting when the
   *  browser refuses or does not support persistence. Never throws. */
  readonly persistStorage: () => Promise<boolean>;
  readonly navigate: (path: string) => void;
}

/** The real `persistStorage` dep. Feature-detects, catches, and never rejects or blocks. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('storage' in navigator)) return false;
  const storage = navigator.storage as StorageManager | undefined;
  if (storage === undefined || typeof storage.persist !== 'function') return false;
  try {
    return await storage.persist();
  } catch {
    return false;
  }
}

export type FinishOnboarding = (input: FinishOnboardingInput) => Promise<void>;

export function createFinishOnboarding(deps: FinishOnboardingDeps): FinishOnboarding {
  let fired = false;

  return async function finishOnboarding(input) {
    if (fired) return;
    fired = true;

    await deps.setProfile({
      minutesPerDay: input.minutesPerDay,
      examDate: input.examDate,
      fieldCode: input.fieldCode,
    });

    const event: BeaconEvent = { name: 'onboarding_done', at: now(), appVersion: APP_VERSION };
    await deps.queueBeacon(deps.installId, [event]);

    // Best-effort: never blocks reaching home, whatever the browser decides.
    await deps.persistStorage();

    deps.navigate('/');
  };
}
