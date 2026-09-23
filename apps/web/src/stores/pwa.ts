/**
 * Service worker and install state, mirrored for the UI (`what.md` §7.1, §7.7, §7.8).
 *
 * `pwa/update.ts` and `pwa/install.ts` are where the actual decisions get made (the update state
 * machine, the `beforeinstallprompt` capture, the UA-based context detection); this store is
 * just where the current answer is kept so Home's chip and the install sheet can subscribe to
 * it, the same split as `stores/sync.ts` over `sync/backup.ts` and `sync/download.ts`.
 */

import { create } from 'zustand';
import { breadcrumb } from '../log/breadcrumbs.ts';

/** Mirrors `pwa/install.ts`'s `InstallContext`. */
export type InstallPromptState = 'unavailable' | 'native' | 'in-app-browser' | 'ios' | 'installed';

export interface PwaState {
  /** True once the update machine (`pwa/update.ts`) is in `available`. */
  readonly updateReady: boolean;
  readonly installPrompt: InstallPromptState;
  setUpdateReady: (ready: boolean) => void;
  setInstallPrompt: (state: InstallPromptState) => void;
}

export const usePwaStore = create<PwaState>()((set) => ({
  updateReady: false,
  installPrompt: 'unavailable',

  setUpdateReady: (ready) => {
    set({ updateReady: ready });
    breadcrumb('sw', 'pwa.setUpdateReady', { ready });
  },

  setInstallPrompt: (state) => {
    set({ installPrompt: state });
    breadcrumb('sw', 'pwa.setInstallPrompt', { state });
  },
}));
