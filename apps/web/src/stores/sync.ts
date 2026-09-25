/**
 * The two machine states, mirrored for the UI (`what.md` §7.1, §7.4, §7.5).
 *
 * The machines in `sync/` are pure; this store is where their current state is kept so the home
 * screen's backup dot and the settings screen's download line can subscribe to it. The machines
 * never import this store — the runner drives both, which keeps the transition tables testable
 * with no React and no Zustand.
 */

import { create } from 'zustand';
import { breadcrumb } from '../log/breadcrumbs.ts';
import { BACKUP_IDLE, type BackupState } from '../sync/backup.ts';
import { DOWNLOAD_NONE, type DownloadState } from '../sync/download.ts';

export interface SyncState {
  readonly backup: BackupState;
  readonly download: DownloadState;
  /** Epoch ms of the last completed backup, or null. Mirrors `kv.lastBackupAt`. */
  readonly lastBackupAt: number | null;
  readonly unsyncedCount: number;
  setBackup: (state: BackupState) => void;
  setDownload: (state: DownloadState) => void;
  setLastBackupAt: (at: number) => void;
  setUnsyncedCount: (count: number) => void;
}

export const useSyncStore = create<SyncState>()((set, get) => ({
  backup: BACKUP_IDLE,
  download: DOWNLOAD_NONE,
  lastBackupAt: null,
  unsyncedCount: 0,

  setBackup: (state) => {
    set({ backup: state });
    breadcrumb('log', 'sync.setBackup', { state: state.name });
  },

  setDownload: (state) => {
    const previous = get().download.name;
    set({ download: state });
    // Progress arrives once per network chunk; a crumb for each would push every other crumb
    // out of the 50 an error record keeps (§10.1). The machine crumbs its own transitions.
    if (previous !== state.name) breadcrumb('log', 'sync.setDownload', { state: state.name });
  },

  setLastBackupAt: (at) => {
    set({ lastBackupAt: at });
    breadcrumb('log', 'sync.setLastBackupAt', { at });
  },

  setUnsyncedCount: (count) => {
    set({ unsyncedCount: count });
    breadcrumb('log', 'sync.setUnsyncedCount', { count });
  },
}));
