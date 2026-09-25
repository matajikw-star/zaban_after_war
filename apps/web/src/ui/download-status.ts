/**
 * What the paid download's state (`sync/download.ts`, §7.5) says to a person — one line, the same
 * in the settings row and on the purchase result, so the two can never disagree.
 */

import { strings } from '../strings.ts';
import type { DownloadState } from '../sync/download.ts';
import { faPercent } from './format.ts';

/** Reasons that are the connection, not the content: they heal with the network. */
const OFFLINE_REASONS: ReadonlySet<string> = new Set([
  'NETWORK',
  'DOWNLOAD_INTERRUPTED',
  'DOWNLOAD_TRUNCATED',
  'DOWNLOAD_STALLED',
]);

/**
 * `entitled`: the account signed in now holds `full` (§7.6). When it does not — signed out, or
 * account B on a phone where A bought — no download runs for it and the free package is loaded,
 * so the row says no download is needed, whatever the machine says: a stored `packages.paid`
 * puts the machine in `installed` for whoever is signed in (§7.5).
 *
 * `paidOnDevice`: the content store has the paid package loaded for this account. A failure then
 * is only a failed update check — on a filtered network `navigator.onLine` stays true, so the
 * runner tries and fails often — and every word the user studies is already here. Saying
 * «در انتظار اینترنت» there would read as "your purchase is missing". The failure is still on
 * the ladder and still reported (§7.5); only the words change.
 */
export function downloadStatusText(
  state: DownloadState,
  entitled: boolean,
  paidOnDevice = false,
): string {
  if (!entitled) return strings.download.none;
  if (state.name === 'error' && paidOnDevice) return strings.download.installed;
  switch (state.name) {
    case 'none':
      return strings.download.waiting;
    case 'checking':
      return strings.download.checking;
    case 'downloading':
      return strings.download.progress(faPercent(state.percent));
    case 'verifying':
      return strings.download.verifying;
    case 'installed':
      return strings.download.installed;
    case 'error':
      if (OFFLINE_REASONS.has(state.reason)) return strings.download.errorOffline;
      if (state.reason === 'RATE_LIMITED') return strings.download.errorRateLimited;
      if (state.reason === 'STORAGE_FULL') return strings.download.errorStorage;
      if (state.reason === 'SERVER_PAYMENT_DISABLED_MOCK_SMS')
        return strings.download.errorDisabled;
      return strings.download.errorOther;
  }
}

/**
 * A retry button makes sense: an entitled account's failure, and not something a tap cannot hurry
 * (a 429, the gate).
 */
export function downloadCanRetry(
  state: DownloadState,
  entitled: boolean,
  paidOnDevice = false,
): boolean {
  return (
    entitled &&
    state.name === 'error' &&
    !paidOnDevice &&
    state.reason !== 'RATE_LIMITED' &&
    state.reason !== 'SERVER_PAYMENT_DISABLED_MOCK_SMS'
  );
}

/** 0..100 while downloading for the entitled account, else null: the progress bar shows only then. */
export function downloadPercent(state: DownloadState, entitled: boolean): number | null {
  return entitled && state.name === 'downloading' ? state.percent : null;
}
