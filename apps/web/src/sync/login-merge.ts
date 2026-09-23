/**
 * The login merge (`what.md` §7.4, ADR-0002): the one place a fresh login hands over to backup.
 *
 * 1. Every local event goes back to `synced = 0`. The server insert-ignores by id, so re-sending
 *    what it already holds is free, and anything this device studied anonymously — or under the
 *    account it was logged into before — joins this account. Nothing local is ever deleted.
 * 2. The profile: whichever side has the newer `updatedAt` wins. A fresh device adopts the
 *    server's, so a restored user lands on home rather than onboarding.
 * 3. A backup run with the `login` trigger — push, then pull everything. On a fresh device that
 *    pull *is* the restore: the fold is rebuilt from the events it brings back.
 *
 * Step 3 is fired, not awaited: the login is complete once the token is stored, and a slow or
 * failing network must never hold the user on the login screen. Step 2 is one request, and its
 * failure is a breadcrumb, never a failed login.
 *
 * Called exactly once per successful login, from `screens/login/flow.ts`, after the token is in
 * `kv`. A throw here is reported by the caller and never undoes the login.
 */

import { markAllUnsynced } from '../db/repo.ts';
import { toAppError } from '../errors.ts';
import { breadcrumb } from '../log/breadcrumbs.ts';
import { me, patchProfile } from '../net/api.ts';
import { type Profile, useSettingsStore } from '../stores/settings.ts';
import type { BackupTrigger } from './backup.ts';
import { requestBackup } from './backup-live.ts';

export interface LoginMergeDeps {
  readonly markAllUnsynced: () => Promise<number>;
  readonly fetchServerProfile: () => Promise<unknown>;
  readonly pushProfile: (profile: Profile) => Promise<unknown>;
  readonly localProfile: () => { readonly profile: Profile; readonly hasProfile: boolean };
  readonly adoptProfile: (profile: Profile) => Promise<void>;
  readonly requestBackup: (trigger: BackupTrigger) => Promise<void>;
}

/** Only a profile with every field of the right type is adopted; anything else is ignored. */
export function asProfile(value: unknown): Profile | null {
  const v = value as Partial<Profile> | null | undefined;
  if (v === null || typeof v !== 'object') return null;
  if (typeof v.minutesPerDay !== 'number' || typeof v.dailyGoal !== 'number') return null;
  if (typeof v.updatedAt !== 'number') return null;
  if (v.examDate !== null && typeof v.examDate !== 'number') return null;
  if (v.fieldCode !== null && typeof v.fieldCode !== 'string') return null;
  return {
    minutesPerDay: v.minutesPerDay,
    dailyGoal: v.dailyGoal,
    examDate: v.examDate,
    fieldCode: v.fieldCode,
    updatedAt: v.updatedAt,
  };
}

export type ProfileOutcome = 'adopted' | 'pushed' | 'unchanged' | 'failed';

export async function mergeProfile(deps: LoginMergeDeps): Promise<ProfileOutcome> {
  try {
    const server = asProfile(await deps.fetchServerProfile());
    const local = deps.localProfile();

    if (server !== null && (!local.hasProfile || server.updatedAt > local.profile.updatedAt)) {
      await deps.adoptProfile(server);
      return 'adopted';
    }
    if (local.hasProfile && (server === null || local.profile.updatedAt > server.updatedAt)) {
      await deps.pushProfile(local.profile);
      return 'pushed';
    }
    return 'unchanged';
  } catch (err) {
    breadcrumb('sync', 'loginMerge.profileFailed', { code: toAppError(err, 'PROFILE').code });
    return 'failed';
  }
}

export async function loginMerge(deps: LoginMergeDeps, userId: string): Promise<void> {
  const requeued = await deps.markAllUnsynced();
  const profile = await mergeProfile(deps);
  breadcrumb('sync', 'loginMerge', { hasUser: userId !== '', requeued, profile });
  void deps.requestBackup('login');
}

const liveDeps: LoginMergeDeps = {
  markAllUnsynced,
  fetchServerProfile: async () => (await me()).user.profile,
  pushProfile: (profile) => patchProfile(profile),
  localProfile: () => {
    const state = useSettingsStore.getState();
    return { profile: state.profile, hasProfile: state.hasProfile };
  },
  adoptProfile: (profile) => useSettingsStore.getState().replaceProfile(profile),
  requestBackup,
};

export function runLoginMerge(userId: string): Promise<void> {
  return loginMerge(liveDeps, userId);
}
