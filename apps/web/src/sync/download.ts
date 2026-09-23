/**
 * The paid-content download state machine (`what.md` §7.5).
 *
 * `none → checking → downloading(progress) → verifying → installed`, with `error` on the same
 * backoff ladder as backup. Pure and total, for the same reason as `backup.ts`: the settings
 * screen and the paywall result both render this state, and the error snapshot records its name.
 *
 * PHASE 5 wires `run()` to `net/api.ts` (`Range` resumption, sha256 verification, atomic swap).
 */

import { breadcrumb } from '../log/breadcrumbs.ts';
import { backupBackoffMs } from './backup.ts';

export type DownloadStateName =
  | 'none'
  | 'checking'
  | 'downloading'
  | 'verifying'
  | 'installed'
  | 'error';

export type DownloadState =
  | { readonly name: 'none' }
  | { readonly name: 'checking' }
  | {
      readonly name: 'downloading';
      readonly version: string;
      readonly received: number;
      readonly total: number;
      /** 0..100, rounded — what «دانلود واژه‌ها ۶۳٪» prints. */
      readonly percent: number;
    }
  | { readonly name: 'verifying'; readonly version: string }
  | { readonly name: 'installed'; readonly version: string }
  | {
      readonly name: 'error';
      readonly reason: string;
      readonly attempt: number;
      readonly retryAt: number;
    };

export type DownloadEvent =
  | { readonly type: 'CHECK' }
  /** The manifest matches what is already installed. */
  | { readonly type: 'UP_TO_DATE'; readonly version: string }
  | { readonly type: 'NEEDED'; readonly version: string; readonly bytes: number }
  | { readonly type: 'PROGRESS'; readonly received: number }
  | { readonly type: 'COMPLETE' }
  | { readonly type: 'VERIFIED' }
  | { readonly type: 'FAILED'; readonly reason: string; readonly at: number }
  | { readonly type: 'RETRY' };

export const DOWNLOAD_NONE: DownloadState = { name: 'none' };

function percentOf(received: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((received / total) * 100)));
}

export function transition(state: DownloadState, event: DownloadEvent): DownloadState {
  const next = compute(state, event);
  if (next !== state) {
    breadcrumb('download', 'download.transition', {
      from: state.name,
      event: event.type,
      to: next.name,
    });
  }
  return next;
}

function compute(state: DownloadState, event: DownloadEvent): DownloadState {
  switch (state.name) {
    case 'none':
      switch (event.type) {
        case 'CHECK':
          return { name: 'checking' };
        case 'UP_TO_DATE':
        case 'NEEDED':
        case 'PROGRESS':
        case 'COMPLETE':
        case 'VERIFIED':
        case 'RETRY':
          return state;
        case 'FAILED':
          return failure(state, event.reason, event.at);
      }
      break;

    case 'checking':
      switch (event.type) {
        case 'UP_TO_DATE':
          return { name: 'installed', version: event.version };
        case 'NEEDED':
          return {
            name: 'downloading',
            version: event.version,
            received: 0,
            total: event.bytes,
            percent: 0,
          };
        case 'FAILED':
          return failure(state, event.reason, event.at);
        case 'CHECK':
        case 'PROGRESS':
        case 'COMPLETE':
        case 'VERIFIED':
        case 'RETRY':
          return state;
      }
      break;

    case 'downloading':
      switch (event.type) {
        case 'PROGRESS':
          return {
            name: 'downloading',
            version: state.version,
            received: event.received,
            total: state.total,
            percent: percentOf(event.received, state.total),
          };
        case 'COMPLETE':
          return { name: 'verifying', version: state.version };
        case 'FAILED':
          return failure(state, event.reason, event.at);
        case 'CHECK':
        case 'UP_TO_DATE':
        case 'NEEDED':
        case 'VERIFIED':
        case 'RETRY':
          return state;
      }
      break;

    case 'verifying':
      switch (event.type) {
        case 'VERIFIED':
          return { name: 'installed', version: state.version };
        // A hash mismatch arrives as FAILED: §7.5 says discard and retry from the top.
        case 'FAILED':
          return failure(state, event.reason, event.at);
        case 'CHECK':
        case 'UP_TO_DATE':
        case 'NEEDED':
        case 'PROGRESS':
        case 'COMPLETE':
        case 'RETRY':
          return state;
      }
      break;

    case 'installed':
      switch (event.type) {
        // A content update is the same machine run again against a new manifest version.
        case 'CHECK':
          return { name: 'checking' };
        case 'FAILED':
          return failure(state, event.reason, event.at);
        case 'UP_TO_DATE':
        case 'NEEDED':
        case 'PROGRESS':
        case 'COMPLETE':
        case 'VERIFIED':
        case 'RETRY':
          return state;
      }
      break;

    case 'error':
      switch (event.type) {
        // Back to the top rather than to the interrupted step: the byte count is kept in `kv`
        // and the next attempt resumes with a `Range` header, so restarting costs nothing and
        // re-reads the manifest, which may have moved on while we were failing.
        case 'RETRY':
          return { name: 'none' };
        case 'CHECK':
          return { name: 'checking' };
        case 'FAILED':
          return failure(state, event.reason, event.at);
        case 'UP_TO_DATE':
        case 'NEEDED':
        case 'PROGRESS':
        case 'COMPLETE':
        case 'VERIFIED':
          return state;
      }
      break;
  }
  return state;
}

function failure(state: DownloadState, reason: string, at: number): DownloadState {
  const attempt = state.name === 'error' ? state.attempt + 1 : 1;
  return { name: 'error', reason, attempt, retryAt: at + backupBackoffMs(attempt) };
}

/**
 * Not wired yet. Phase 5 fills this in: manifest compare, streamed `GET /api/content/paid` with
 * `Range` resumption, sha256 check against the manifest, then an atomic package swap (§7.5).
 */
export async function run(): Promise<void> {
  breadcrumb('download', 'download.run', { status: 'not wired (Phase 5)' });
}
