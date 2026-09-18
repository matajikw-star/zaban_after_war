/**
 * Theme and the study profile the user set in onboarding (`what.md` §7.1, §7.8).
 *
 * The profile is the input to every engine call that needs a goal or an exam date, so it is
 * loaded before the first render and persisted to `kv` on every change. `updatedAt` is what the
 * login merge compares when the server also holds a profile (§7.4).
 */

import { goalFromMinutes, ONBOARDING_MINUTES } from '@kl/core';
import { create } from 'zustand';
import { kvGet, kvSet } from '../db/repo.ts';
import { now } from '../engine/clock.ts';
import { breadcrumb } from '../log/breadcrumbs.ts';

export type ThemeChoice = 'system' | 'light' | 'dark';

export interface Profile {
  /** One of `ONBOARDING_MINUTES`; the goal is derived, never typed in. */
  readonly minutesPerDay: number;
  /** `goalFromMinutes(minutesPerDay)` — presentations per Tehran day. */
  readonly dailyGoal: number;
  /** Epoch ms of the exam, or null when the user skipped it. Only feeds `paceEstimate`. */
  readonly examDate: number | null;
  /** From `content/field-codes.json`; null when skipped. */
  readonly fieldCode: string | null;
  readonly updatedAt: number;
}

const DEFAULT_MINUTES = ONBOARDING_MINUTES[1] ?? 20;

export const DEFAULT_PROFILE: Profile = {
  minutesPerDay: DEFAULT_MINUTES,
  dailyGoal: goalFromMinutes(DEFAULT_MINUTES),
  examDate: null,
  fieldCode: null,
  updatedAt: 0,
};

/** The fields onboarding and settings can change; the goal is always recomputed from minutes. */
export interface ProfilePatch {
  readonly minutesPerDay?: number;
  readonly examDate?: number | null;
  readonly fieldCode?: string | null;
}

export interface SettingsState {
  readonly theme: ThemeChoice;
  readonly profile: Profile;
  readonly loaded: boolean;
  load: () => Promise<void>;
  setTheme: (theme: ThemeChoice) => Promise<void>;
  setProfile: (patch: ProfilePatch) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  theme: 'system',
  profile: DEFAULT_PROFILE,
  loaded: false,

  load: async () => {
    const [theme, profile] = await Promise.all([
      kvGet<ThemeChoice>('theme'),
      kvGet<Profile>('profile'),
    ]);
    set({ theme: theme ?? 'system', profile: profile ?? DEFAULT_PROFILE, loaded: true });
    breadcrumb('log', 'settings.load', {
      theme: theme ?? 'system',
      hasProfile: profile !== undefined,
    });
  },

  setTheme: async (theme) => {
    set({ theme });
    await kvSet('theme', theme);
    breadcrumb('log', 'settings.setTheme', { theme });
  },

  setProfile: async (patch) => {
    const previous = get().profile;
    const minutesPerDay = patch.minutesPerDay ?? previous.minutesPerDay;
    const next: Profile = {
      minutesPerDay,
      dailyGoal: goalFromMinutes(minutesPerDay),
      examDate: patch.examDate === undefined ? previous.examDate : patch.examDate,
      fieldCode: patch.fieldCode === undefined ? previous.fieldCode : patch.fieldCode,
      updatedAt: now(),
    };
    set({ profile: next });
    await kvSet('profile', next);
    breadcrumb('log', 'settings.setProfile', {
      minutesPerDay: next.minutesPerDay,
      dailyGoal: next.dailyGoal,
      hasExamDate: next.examDate !== null,
    });
  },
}));

/** For non-React callers (the engine adapters, the error snapshot). */
export function currentProfile(): Profile {
  return useSettingsStore.getState().profile;
}
