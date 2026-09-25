/**
 * The download runner bound to the real device (`what.md` §7.5): `net/api.ts`, IndexedDB, the
 * content store, and the triggers — app start, `online`, a fresh entitlement (the purchase result
 * or an `/api/me` refresh), and the retry button in settings.
 *
 * `sync/download.ts` holds the machine and the run, tested with fakes. This file holds the wiring
 * and the two pieces of real-`Response` handling the fakes cannot see: reading `Content-Range`,
 * and a stall watchdog, because a mobile connection that goes quiet without closing would
 * otherwise leave a run "downloading" forever and block every later trigger.
 */

import type { ContentPackage } from '@kl/content';
import { kvDelete, kvGet, kvSet, packageMeta, putPackage } from '../db/repo.ts';
import { now } from '../engine/clock.ts';
import { AppError } from '../errors.ts';
import { queueBeacon } from '../log/beacon.ts';
import { breadcrumb } from '../log/breadcrumbs.ts';
import { reportError } from '../log/errors.ts';
import { contentManifest, contentPaid } from '../net/api.ts';
import { useAuthStore } from '../stores/auth.ts';
import { useContentStore } from '../stores/content.ts';
import { useSyncStore } from '../stores/sync.ts';
import {
  createDownloadRunner,
  type DownloadDeps,
  type DownloadRunner,
  type DownloadTrigger,
  type PaidResponse,
  type PartialDownload,
} from './download.ts';
import { verifyPaidPackage } from './package-hash.ts';

/** No response headers within this long: the request is abandoned (`DOWNLOAD_STALLED`). */
export const HEADERS_TIMEOUT_MS = 30_000;
/** No body bytes for this long: the stream is abandoned, and what arrived is kept for a resume. */
export const STALL_TIMEOUT_MS = 30_000;

/** `bytes 1000-1999/2000` → 1000. Anything else → null, which the run refuses as a bad resume. */
export function rangeStartOf(header: string | null): number | null {
  if (header === null) return null;
  const match = /^bytes (\d+)-\d+\/(\d+|\*)$/.exec(header.trim());
  if (match === null) return null;
  const start = Number(match[1]);
  return Number.isSafeInteger(start) ? start : null;
}

export interface StallTimers {
  readonly setTimer: (fn: () => void, ms: number) => unknown;
  readonly clearTimer: (handle: unknown) => void;
}

/**
 * The body as chunks, abandoned with `DOWNLOAD_STALLED` when no chunk arrives for `stallMs`.
 * The reader is cancelled either way, so an abandoned stream frees its connection.
 */
export async function* chunksWithStallTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  stallMs: number,
  timers: StallTimers,
): AsyncGenerator<Uint8Array> {
  try {
    for (;;) {
      let handle: unknown = null;
      const stalled = new Promise<never>((_, reject) => {
        handle = timers.setTimer(() => {
          reject(
            new AppError('DOWNLOAD_STALLED', 'no bytes arrived for too long', {
              phase: 'body',
              stallMs,
            }),
          );
        }, stallMs);
      });
      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await Promise.race([reader.read(), stalled]);
      } finally {
        timers.clearTimer(handle);
      }
      if (result.done) return;
      if (result.value.length > 0) yield result.value;
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }
}

const realTimers: StallTimers = {
  setTimer: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimer: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * The response of `send`, abandoned with `DOWNLOAD_STALLED` (`phase: 'headers'`) when its headers
 * take longer than `timeoutMs`. The request is aborted too, but the abort is not what the caller
 * sees: `net/api.ts` turns an abort into `NETWORK`, which would tell the log a stall was a lost
 * connection. A real failure before the timeout keeps its own code.
 */
export async function responseWithHeadersTimeout(
  send: (signal: AbortSignal) => Promise<Response>,
  timeoutMs: number,
  timers: StallTimers,
): Promise<Response> {
  const controller = new AbortController();
  let handle: unknown = null;
  const timedOut = new Promise<never>((_, reject) => {
    handle = timers.setTimer(() => {
      reject(
        new AppError('DOWNLOAD_STALLED', 'no response headers arrived in time', {
          phase: 'headers',
          timeoutMs,
        }),
      );
      controller.abort();
    }, timeoutMs);
  });
  const sent = send(controller.signal);
  // Once the timeout has won the race, the aborted request's own rejection is expected noise.
  sent.catch(() => undefined);
  try {
    return await Promise.race([sent, timedOut]);
  } finally {
    timers.clearTimer(handle);
  }
}

async function fetchPaid(from: number, ifRange: string | null): Promise<PaidResponse> {
  const response = await responseWithHeadersTimeout(
    (signal) => contentPaid({ from, ...(ifRange === null ? {} : { ifRange }), signal }),
    HEADERS_TIMEOUT_MS,
    realTimers,
  );
  if (response.body === null) {
    throw new AppError('DOWNLOAD_NO_BODY', 'the paid package response has no body', {
      status: response.status,
    });
  }
  return {
    status: response.status,
    rangeStart: response.status === 206 ? rangeStartOf(response.headers.get('content-range')) : 0,
    etag: response.headers.get('etag'),
    chunks: chunksWithStallTimeout(response.body.getReader(), STALL_TIMEOUT_MS, realTimers),
  };
}

function isPartial(value: unknown): value is PartialDownload {
  const v = value as Partial<PartialDownload> | null | undefined;
  return (
    v !== null &&
    typeof v === 'object' &&
    typeof v.hash === 'string' &&
    typeof v.version === 'string' &&
    v.bytes instanceof Uint8Array
  );
}

async function storageFree(): Promise<number | null> {
  try {
    const estimate = await globalThis.navigator?.storage?.estimate?.();
    if (estimate?.quota === undefined || estimate.usage === undefined) return null;
    return estimate.quota - estimate.usage;
  } catch {
    // A browser that refuses to say is not a browser without room.
    return null;
  }
}

const liveDeps: DownloadDeps = {
  now,
  isOnline: () => globalThis.navigator?.onLine ?? true,
  userId: () => useAuthStore.getState().userId,
  isEntitled: () => useAuthStore.getState().entitlement.status === 'full',

  fetchManifest: contentManifest,
  fetchPaid,
  readInstalled: () => packageMeta('paid'),
  readPartial: async () => {
    const stored = await kvGet<unknown>('downloadReceivedBytes');
    return isPartial(stored) ? stored : null;
  },
  writePartial: (partial) => kvSet('downloadReceivedBytes', partial),
  clearPartial: () => kvDelete('downloadReceivedBytes'),
  storageFree,
  verify: verifyPaidPackage,
  install: async (pkg: ContentPackage, bytes: number) => {
    // Stored either way; loaded only if the account signed in now is entitled — a sign-out during
    // the download must not switch the next account onto the paid package (§7.6).
    if (useAuthStore.getState().entitlement.status === 'full') {
      await useContentStore.getState().install(pkg, bytes);
    } else {
      await putPackage(pkg, bytes);
    }
  },

  publishState: (state) => useSyncStore.getState().setDownload(state),
  onInstalled: () => {
    void queueBeacon('download_done');
  },
  reportError: (err, data) => {
    void reportError('download', err, data);
  },

  setTimer: realTimers.setTimer,
  clearTimer: realTimers.clearTimer,
};

let runner: DownloadRunner | null = null;

/**
 * Ask for a download run. Never throws and never blocks: callers fire and forget. Before
 * `startDownload()` it does nothing, which only happens before bootstrap has finished.
 */
export function requestDownload(trigger: DownloadTrigger): Promise<void> {
  if (runner === null) {
    breadcrumb('download', 'download.trigger', { trigger, outcome: 'not started' });
    return Promise.resolve();
  }
  return runner.request(trigger).catch((err: unknown) => {
    void reportError('download', err, { phase: 'download.request', trigger });
  });
}

/** Called once from `main.tsx`, after the content store has loaded. */
export async function startDownload(): Promise<void> {
  if (runner !== null) return;
  runner = createDownloadRunner(liveDeps);
  await runner.init();
  globalThis.addEventListener('online', () => {
    void requestDownload('online');
  });
  void requestDownload('start');
}
