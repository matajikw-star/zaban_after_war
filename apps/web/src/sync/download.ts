/**
 * The paid-content download: its state machine and its runner (`what.md` §7.5).
 *
 * `none → checking → downloading(progress) → verifying → installed`, and `error` on the backup
 * ladder (1 min, 5 min, 15 min, then hourly). The transition function is pure and total — six
 * states × seven events, a table in `download.test.ts` — so a breadcrumb trail replays exactly.
 * `checking`, `downloading` and `verifying` carry `failures` (consecutive failed runs before this
 * one) the way backup's running states do, so a retry that fails again climbs the ladder.
 *
 * `createDownloadRunner(deps)` performs a run with every effect injected; `download-live.ts` binds
 * the real ones. A run:
 *
 * 1. `GET /api/content/manifest`. The stored paid package already has the manifest's hash →
 *    `installed`, nothing fetched.
 * 2. Bytes already stored for *this* hash (`kv.downloadReceivedBytes`) are resumed:
 *    `Range: bytes=<n>-` with `If-Range: "<hash>"`. A 206 must start exactly at `n`; a 200 means
 *    the server sent the whole file (its content moved on, or it ignored the range), so the stored
 *    bytes are dropped and the count restarts at 0. A 416 means the stored bytes run past the file:
 *    they are dropped and the file is fetched whole, once, in the same run.
 * 3. The body streams into memory; every 256 KB, and whenever the stream breaks, what arrived is
 *    written to `kv.downloadReceivedBytes`, so neither a dropped connection nor a killed tab costs the
 *    bytes already received. Fewer bytes than the manifest promised is `DOWNLOAD_TRUNCATED`.
 * 4. Verify (`package-hash.ts`): UTF-8 JSON, a paid package, sha256 of canonical `items` equal to
 *    the manifest hash. A mismatch drops the stored bytes, so the next attempt starts clean.
 * 5. Install: `deps.install` swaps the package in one IndexedDB write and then the content store.
 *    Nothing before this step touches the package the user is studying from, so any failure —
 *    offline, a 403, a bad hash, a full disk — leaves the previous content fully usable.
 *
 * Runs only online, logged in and entitled (the cached entitlement, §7.6). One run at a time; a
 * trigger during a run is remembered and runs once after it, as in backup.
 */

import type { ContentPackage } from '@kl/content';
import type { ContentManifest } from '../content/manifest.ts';
import { AppError, toAppError } from '../errors.ts';
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
  /** `failures`: consecutive failed runs before this one — 0 unless it is a retry. */
  | { readonly name: 'checking'; readonly failures: number }
  | {
      readonly name: 'downloading';
      readonly version: string;
      readonly received: number;
      readonly total: number;
      /** 0..100, rounded — what «دانلود واژه‌ها ۶۳٪» prints. */
      readonly percent: number;
      readonly failures: number;
    }
  | { readonly name: 'verifying'; readonly version: string; readonly failures: number }
  | { readonly name: 'installed'; readonly version: string }
  | {
      readonly name: 'error';
      /** An `AppError` code: `NETWORK`, `HASH_MISMATCH`, `SERVER_NOT_ENTITLED`, … */
      readonly reason: string;
      /** 1 for the first failure. Drives the backoff. */
      readonly attempt: number;
      readonly retryAt: number;
    };

export type DownloadEvent =
  | { readonly type: 'CHECK' }
  /** The device already holds the manifest's package (or, from `none`, a stored one at start). */
  | { readonly type: 'UP_TO_DATE'; readonly version: string }
  /** `received`: bytes already stored for this version, which the fetch resumes after. */
  | {
      readonly type: 'NEEDED';
      readonly version: string;
      readonly bytes: number;
      readonly received: number;
    }
  | { readonly type: 'PROGRESS'; readonly received: number }
  | { readonly type: 'COMPLETE' }
  | { readonly type: 'VERIFIED' }
  | {
      readonly type: 'FAILED';
      readonly reason: string;
      readonly at: number;
      /** A 429's `retryAfter`, in ms. The wait is the longer of this and the ladder's step. */
      readonly retryAfterMs?: number;
    };

export const DOWNLOAD_NONE: DownloadState = { name: 'none' };

function percentOf(received: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((received / total) * 100)));
}

/**
 * Pure and total. A breadcrumb marks every change of state *name*; `PROGRESS` inside
 * `downloading` is not one, or a 1 MB download would push every other crumb out of the 50 kept.
 */
export function transition(state: DownloadState, event: DownloadEvent): DownloadState {
  const next = compute(state, event);
  if (next.name !== state.name) {
    breadcrumb('download', 'download.transition', {
      from: state.name,
      event: event.type,
      to: next.name,
      ...(next.name === 'error' ? { reason: next.reason, attempt: next.attempt } : {}),
    });
  }
  return next;
}

function compute(state: DownloadState, event: DownloadEvent): DownloadState {
  switch (state.name) {
    case 'none':
      switch (event.type) {
        case 'CHECK':
          return { name: 'checking', failures: 0 };
        // At start: a paid package is already stored, so the settings row says so while offline.
        case 'UP_TO_DATE':
          return { name: 'installed', version: event.version };
        case 'FAILED':
          return failure(0, event);
        case 'NEEDED':
        case 'PROGRESS':
        case 'COMPLETE':
        case 'VERIFIED':
          return state;
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
            received: event.received,
            total: event.bytes,
            percent: percentOf(event.received, event.bytes),
            failures: state.failures,
          };
        case 'FAILED':
          return failure(state.failures, event);
        case 'CHECK':
        case 'PROGRESS':
        case 'COMPLETE':
        case 'VERIFIED':
          return state;
      }
      break;

    case 'downloading':
      switch (event.type) {
        case 'PROGRESS':
          return {
            ...state,
            received: event.received,
            percent: percentOf(event.received, state.total),
          };
        case 'COMPLETE':
          return { name: 'verifying', version: state.version, failures: state.failures };
        case 'FAILED':
          return failure(state.failures, event);
        case 'CHECK':
        case 'UP_TO_DATE':
        case 'NEEDED':
        case 'VERIFIED':
          return state;
      }
      break;

    case 'verifying':
      switch (event.type) {
        case 'VERIFIED':
          return { name: 'installed', version: state.version };
        // A hash mismatch arrives as FAILED; the runner has already dropped the stored bytes.
        case 'FAILED':
          return failure(state.failures, event);
        case 'CHECK':
        case 'UP_TO_DATE':
        case 'NEEDED':
        case 'PROGRESS':
        case 'COMPLETE':
          return state;
      }
      break;

    case 'installed':
      switch (event.type) {
        // A content update is the same machine run again against a new manifest.
        case 'CHECK':
          return { name: 'checking', failures: 0 };
        case 'FAILED':
          return failure(0, event);
        case 'UP_TO_DATE':
        case 'NEEDED':
        case 'PROGRESS':
        case 'COMPLETE':
        case 'VERIFIED':
          return state;
      }
      break;

    case 'error':
      switch (event.type) {
        // A retry starts from the top: the manifest may have moved on while we were failing, and
        // the stored bytes make the restart nearly free.
        case 'CHECK':
          return { name: 'checking', failures: state.attempt };
        // A stray failure while nothing runs still counts: the ladder only ever climbs.
        case 'FAILED':
          return failure(state.attempt, event);
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

function failure(
  previousFailures: number,
  event: { readonly reason: string; readonly at: number; readonly retryAfterMs?: number },
): DownloadState {
  const attempt = previousFailures + 1;
  const wait = Math.max(backupBackoffMs(attempt), event.retryAfterMs ?? 0);
  return { name: 'error', reason: event.reason, attempt, retryAt: event.at + wait };
}

// ============================================================================ the runner

/**
 * `start` (app start), `online`, `entitled` (the purchase result or an `/api/me` refresh just
 * cached `full`), `login`, `manual` (settings), `retry` (the backoff timer).
 */
export type DownloadTrigger = 'start' | 'online' | 'entitled' | 'login' | 'manual' | 'retry';

/** `kv.downloadReceivedBytes`: the bytes received so far and the manifest hash they belong to. */
export interface PartialDownload {
  readonly hash: string;
  readonly version: string;
  readonly bytes: Uint8Array;
}

export interface InstalledPackage {
  readonly version: string;
  readonly hash: string;
}

/** `GET /api/content/paid`'s answer, reduced to what the run needs (`download-live.ts`). */
export interface PaidResponse {
  /** 200 (the whole file) or 206 (from `rangeStart`). */
  readonly status: number;
  /** The first byte of a 206's `Content-Range`, 0 for a 200, null when a 206 had none. */
  readonly rangeStart: number | null;
  readonly etag: string | null;
  readonly chunks: AsyncIterable<Uint8Array>;
}

export type TimerHandle = unknown;

export interface DownloadDeps {
  readonly now: () => number;
  readonly isOnline: () => boolean;
  readonly userId: () => string | null;
  /** The cached entitlement (§7.6) — a device never asks for the paid file without it. */
  readonly isEntitled: () => boolean;

  readonly fetchManifest: () => Promise<ContentManifest>;
  /** `from` 0: the whole file; otherwise `Range` from there, with `If-Range: ifRange`. */
  readonly fetchPaid: (from: number, ifRange: string | null) => Promise<PaidResponse>;
  readonly readInstalled: () => Promise<InstalledPackage | null>;
  readonly readPartial: () => Promise<PartialDownload | null>;
  readonly writePartial: (partial: PartialDownload) => Promise<void>;
  readonly clearPartial: () => Promise<void>;
  /** Free bytes the origin may still use, or null when the browser will not say. */
  readonly storageFree: () => Promise<number | null>;
  readonly verify: (bytes: Uint8Array, expectedHash: string) => Promise<ContentPackage>;
  /** The atomic swap: one IndexedDB write, then the content store. */
  readonly install: (pkg: ContentPackage, bytes: number) => Promise<void>;

  readonly publishState: (state: DownloadState) => void;
  /** The `download_done` beacon (§8.4). */
  readonly onInstalled: (version: string) => void;
  readonly reportError: (err: unknown, data: unknown) => void;

  readonly setTimer: (fn: () => void, ms: number) => TimerHandle;
  readonly clearTimer: (handle: TimerHandle) => void;
}

/** How often the bytes received so far are written to `kv` while streaming. */
export const PERSIST_EVERY_BYTES = 256 * 1024;
/** The buffer, the parsed package and the stored copy: refuse to start without this much room. */
export const STORAGE_FACTOR = 3;
/** Same threshold as backup: the fifth consecutive failure files one `client_errors` record. */
export const REPORT_AT_ATTEMPT = 5;
/**
 * Failures that are a bug or a server fault rather than weather, reported the first time:
 * the bytes were wrong, the server is older than this client (404 — the route does not exist),
 * or the server refuses an entitlement the device holds (§7.6).
 */
export const REPORT_IMMEDIATELY: ReadonlySet<string> = new Set([
  'HASH_MISMATCH',
  'DOWNLOAD_CORRUPT',
  'DOWNLOAD_RANGE_MISMATCH',
  'SERVER_NOT_FOUND',
  'SERVER_NOT_ENTITLED',
  'INSTALL_FAILED',
]);

/**
 * Refusals that are the server working as designed, never a record however long they last:
 * payment and the paid file are switched off while SMS is mock (§8.2's gate), so an entitled
 * account on staging (an admin grant) sits here, retrying on the ladder, until the switch.
 */
export const NEVER_REPORT: ReadonlySet<string> = new Set(['SERVER_PAYMENT_DISABLED_MOCK_SMS']);

/**
 * The gate, as in backup: off the backoff anything runs; on it, a trigger that means "something
 * changed" jumps the wait. A 429 is the server asking for time, so nothing jumps it. A 401 or a
 * refused entitlement will not heal by retrying, so only a login, a fresh entitlement or the
 * user's own tap tries again.
 */
export function mayRunNow(state: DownloadState, trigger: DownloadTrigger, at: number): boolean {
  if (state.name !== 'error') return true;
  if (state.reason === 'RATE_LIMITED') return at >= state.retryAt;
  if (state.reason === 'UNAUTHORIZED' || state.reason === 'SERVER_NOT_ENTITLED') {
    return trigger === 'login' || trigger === 'manual' || trigger === 'entitled';
  }
  if (at >= state.retryAt) return true;
  return (
    trigger === 'manual' || trigger === 'online' || trigger === 'login' || trigger === 'entitled'
  );
}

/** Retrying on a timer cannot fix these; a trigger from the user or the server must. */
function waitsForTrigger(reason: string): boolean {
  return reason === 'UNAUTHORIZED' || reason === 'SERVER_NOT_ENTITLED';
}

function statusOf(err: AppError): number {
  const data = err.data as { status?: unknown } | undefined;
  return typeof data?.status === 'number' ? data.status : 0;
}

function retryAfterMsOf(err: AppError): number | undefined {
  const data = err.data as { retryAfter?: unknown } | undefined;
  return typeof data?.retryAfter === 'number' ? data.retryAfter * 1000 : undefined;
}

/**
 * Whether a response's `ETag` names the package with this hash. Caddy's `encode` (§14.2) rewrites
 * a strong `"<hash>"` to `"<hash>-gzip"` (or `-zstd`, `-br`) when it compresses, and a proxy may
 * weaken it to `W/"…"`; every browser asks for compression, so on the real server the exact tag
 * never arrives. Verified against staging's Caddy on 2026-09-25. The sha256 check after the
 * download stays the real guarantee; this only catches a file that moved on mid-download early.
 */
export function etagMatches(etag: string, hash: string): boolean {
  const tag = etag.trim().replace(/^W\//, '');
  return tag === `"${hash}"` || /^"(.+)-(gzip|zstd|br|deflate)"$/.exec(tag)?.[1] === hash;
}

function concat(chunks: readonly Uint8Array[], length: number): Uint8Array {
  if (chunks.length === 1 && chunks[0]?.length === length) return chunks[0];
  const out = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export interface DownloadRunner {
  /** At start: a stored paid package puts the machine in `installed` before any network. */
  init: () => Promise<void>;
  /** Ask for a run. Resolves when that run (and any follow-up it queued) has finished. */
  request: (trigger: DownloadTrigger) => Promise<void>;
  stop: () => void;
  state: () => DownloadState;
}

export function createDownloadRunner(deps: DownloadDeps): DownloadRunner {
  let state: DownloadState = DOWNLOAD_NONE;
  let running = false;
  let queued: DownloadTrigger | null = null;
  let retryTimer: TimerHandle | null = null;

  function dispatch(event: DownloadEvent): void {
    const next = transition(state, event);
    if (next === state) return;
    state = next;
    deps.publishState(state);
  }

  /** Never lets a failed write hide the error that led to it. */
  async function savePartial(partial: PartialDownload): Promise<void> {
    if (partial.bytes.length === 0) return;
    try {
      await deps.writePartial(partial);
    } catch (err) {
      breadcrumb('download', 'download.partial.saveFailed', {
        code: toAppError(err, 'KV_WRITE').code,
      });
    }
  }

  /**
   * Streams the paid file into memory, resuming after the stored bytes, and returns all of it.
   * Every exit that leaves bytes behind stores them first.
   */
  async function fetchAll(
    expected: { readonly version: string; readonly hash: string; readonly bytes: number },
    partial: PartialDownload | null,
  ): Promise<Uint8Array> {
    const etag = `"${expected.hash}"`;
    let chunks: Uint8Array[] = partial === null ? [] : [partial.bytes];
    let received = partial?.bytes.length ?? 0;
    dispatch({ type: 'NEEDED', version: expected.version, bytes: expected.bytes, received });

    // Everything is already here (the tab died between the last byte and the install).
    if (received >= expected.bytes) return concat(chunks, received);

    const store = async (): Promise<void> => {
      const all = concat(chunks, received);
      chunks = [all];
      await savePartial({ hash: expected.hash, version: expected.version, bytes: all });
    };

    let restartedAfter416 = false;
    for (;;) {
      let response: PaidResponse;
      try {
        response = await deps.fetchPaid(received, received > 0 ? etag : null);
      } catch (err) {
        const error = toAppError(err, 'DOWNLOAD_FAILED');
        // The stored bytes run past the file: they cannot be from it. Drop them, fetch it whole.
        if (statusOf(error) === 416 && received > 0 && !restartedAfter416) {
          restartedAfter416 = true;
          breadcrumb('download', 'download.restart', { reason: 'range_not_satisfiable', received });
          await deps.clearPartial();
          chunks = [];
          received = 0;
          dispatch({ type: 'PROGRESS', received });
          continue;
        }
        throw error;
      }

      if (response.etag !== null && !etagMatches(response.etag, expected.hash)) {
        await deps.clearPartial();
        throw new AppError(
          'DOWNLOAD_CONTENT_CHANGED',
          'the paid file is not the one the manifest named',
          {
            expected: etag,
            etag: response.etag,
          },
        );
      }

      if (response.status === 206) {
        if (response.rangeStart !== received) {
          await deps.clearPartial();
          throw new AppError('DOWNLOAD_RANGE_MISMATCH', 'the server resumed from the wrong byte', {
            asked: received,
            got: response.rangeStart,
          });
        }
        breadcrumb('download', 'download.resume', { from: received });
      } else if (received > 0) {
        // A 200 to a Range request is the whole file: start the count again from byte 0.
        breadcrumb('download', 'download.restart', { reason: 'whole_file', received });
        await deps.clearPartial();
        chunks = [];
        received = 0;
        dispatch({ type: 'PROGRESS', received });
      }

      let sinceStored = 0;
      try {
        for await (const chunk of response.chunks) {
          chunks.push(chunk);
          received += chunk.length;
          sinceStored += chunk.length;
          dispatch({ type: 'PROGRESS', received });
          if (sinceStored >= PERSIST_EVERY_BYTES) {
            await store();
            sinceStored = 0;
          }
        }
      } catch (err) {
        await store();
        throw toAppError(err, 'DOWNLOAD_INTERRUPTED');
      }

      await store();
      if (received < expected.bytes) {
        throw new AppError('DOWNLOAD_TRUNCATED', 'the stream ended before the whole file arrived', {
          received,
          bytes: expected.bytes,
        });
      }
      breadcrumb('download', 'download.received', { bytes: received });
      return concat(chunks, received);
    }
  }

  async function runOnce(): Promise<void> {
    dispatch({ type: 'CHECK' });
    try {
      const manifest = await deps.fetchManifest();
      const expected = manifest.paid;

      const installed = await deps.readInstalled();
      if (installed !== null && installed.hash === expected.hash) {
        await deps.clearPartial();
        dispatch({ type: 'UP_TO_DATE', version: installed.version });
        clearRetry();
        return;
      }

      let partial = await deps.readPartial();
      if (partial !== null && partial.hash !== expected.hash) {
        breadcrumb('download', 'download.partial.stale', { version: partial.version });
        await deps.clearPartial();
        partial = null;
      }

      const free = await deps.storageFree();
      if (free !== null && free < expected.bytes * STORAGE_FACTOR) {
        throw new AppError('STORAGE_FULL', 'not enough storage for the paid package', {
          free,
          bytes: expected.bytes,
        });
      }

      const bytes = await fetchAll(expected, partial);
      dispatch({ type: 'COMPLETE' });

      let pkg: ContentPackage;
      try {
        pkg = await deps.verify(bytes, expected.hash);
      } catch (err) {
        // Wrong bytes must never be resumed from.
        await deps.clearPartial();
        throw err;
      }

      try {
        await deps.install(pkg, bytes.length);
      } catch (err) {
        // The verified bytes stay stored: the next run skips the fetch and installs them.
        throw new AppError('INSTALL_FAILED', 'the paid package could not be stored', {
          cause: toAppError(err, 'INSTALL_FAILED').message,
        });
      }
      await deps.clearPartial();
      dispatch({ type: 'VERIFIED' });
      clearRetry();
      deps.onInstalled(pkg.version);
    } catch (err) {
      const error = toAppError(err, 'DOWNLOAD_FAILED');
      const retryAfterMs = retryAfterMsOf(error);
      dispatch({
        type: 'FAILED',
        reason: error.code,
        at: deps.now(),
        ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
      });
      breadcrumb('download', 'download.failed', { code: error.code, status: statusOf(error) });
      if (
        state.name === 'error' &&
        !NEVER_REPORT.has(error.code) &&
        (REPORT_IMMEDIATELY.has(error.code) || state.attempt === REPORT_AT_ATTEMPT)
      ) {
        deps.reportError(error, { attempt: state.attempt, reason: state.reason });
      }
      scheduleRetry();
    }
  }

  function clearRetry(): void {
    if (retryTimer !== null) deps.clearTimer(retryTimer);
    retryTimer = null;
  }

  function scheduleRetry(): void {
    clearRetry();
    if (state.name !== 'error' || waitsForTrigger(state.reason)) return;
    const wait = Math.max(0, state.retryAt - deps.now());
    retryTimer = deps.setTimer(() => {
      retryTimer = null;
      void request('retry');
    }, wait);
  }

  async function request(trigger: DownloadTrigger): Promise<void> {
    if (running) {
      queued = trigger;
      breadcrumb('download', 'download.trigger', { trigger, outcome: 'queued' });
      return;
    }
    const skip =
      deps.userId() === null
        ? 'anonymous'
        : !deps.isEntitled()
          ? 'not entitled'
          : !deps.isOnline()
            ? 'offline'
            : !mayRunNow(state, trigger, deps.now())
              ? 'backoff'
              : null;
    if (skip !== null) {
      breadcrumb('download', 'download.trigger', { trigger, outcome: skip });
      return;
    }

    breadcrumb('download', 'download.trigger', { trigger, outcome: 'run' });
    running = true;
    try {
      await runOnce();
    } finally {
      running = false;
    }

    const next = queued;
    queued = null;
    if (next !== null) await request(next);
  }

  return {
    init: async () => {
      const installed = await deps.readInstalled();
      if (installed !== null) dispatch({ type: 'UP_TO_DATE', version: installed.version });
    },
    request,
    stop: clearRetry,
    state: () => state,
  };
}
