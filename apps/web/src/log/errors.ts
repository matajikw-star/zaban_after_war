/**
 * Client error capture and reporting (`what.md` §10.1).
 *
 * The goal of the whole logging layer is that a bug is fixable from one record, with no
 * "can you reproduce it?" (§10, `docs/runbooks/debug-from-log.md`). So a record carries the
 * stack, the build, the route, the last fifty breadcrumbs and a snapshot of the device.
 *
 * Records go into `outbox` rather than straight to the network: an error that happens offline is
 * exactly the kind worth having, and the drain in §7.4 sends it when the connection returns.
 */

import { outboxEnqueue } from '../db/repo.ts';
import { now } from '../engine/clock.ts';
import { useAuthStore } from '../stores/auth.ts';
import { APP_VERSION, BUILD_SHA } from '../version.ts';
import { type Breadcrumb, breadcrumb, breadcrumbs } from './breadcrumbs.ts';
import { type ErrorSnapshot, snapshot } from './snapshot.ts';

export type ClientErrorKind =
  | 'error'
  | 'unhandledrejection'
  | 'react'
  | 'sw'
  | 'sync'
  | 'download'
  | 'payment'
  | 'user_report';

export interface ClientErrorDevice {
  readonly ua: string;
  readonly platform: string;
  readonly screen: string;
  readonly memory: number | null;
  readonly standalone: boolean;
  readonly twa: boolean;
}

export interface ClientErrorRecord {
  readonly kind: ClientErrorKind;
  /** sha1(kind + message + top stack frame) — the server dedupes on it within the hour. */
  readonly fingerprint: string;
  readonly message: string;
  /** Minified; `tools/errors` symbolicates it against the sourcemaps for `buildSha`. */
  readonly stack: string | null;
  readonly appVersion: string;
  readonly buildSha: string;
  readonly route: string;
  readonly installId: string;
  readonly userId: string | null;
  readonly at: number;
  readonly online: boolean;
  readonly device: ClientErrorDevice;
  readonly breadcrumbs: readonly Breadcrumb[];
  readonly snapshot: ErrorSnapshot;
  /** Only ever set for `user_report` (§10.4). */
  readonly userNote: string | null;
  /** Always 1 from the client; the server increments it when it dedupes (§8.2). */
  readonly count: number;
}

/**
 * One report per fingerprint per session. The server dedupes within the hour anyway, but a
 * render loop can throw hundreds of times a second and there is no reason to fill IndexedDB
 * with copies of one bug before the connection comes back.
 */
const reportedThisSession = new Set<string>();

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message || err.name;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function stackOf(err: unknown): string | null {
  return err instanceof Error ? (err.stack ?? null) : null;
}

function topFrame(stack: string | null): string {
  if (stack === null) return '';
  for (const line of stack.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('at ')) return trimmed;
  }
  return stack.split('\n')[0]?.trim() ?? '';
}

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

/**
 * sha1 through Web Crypto. Not available on an insecure origin or in some test environments, so
 * a djb2 digest stands in — prefixed, so a record built without crypto is obvious in the data
 * and is never mistaken for a real sha1 collision.
 */
async function fingerprintOf(
  kind: ClientErrorKind,
  message: string,
  stack: string | null,
): Promise<string> {
  const input = `${kind}\n${message}\n${topFrame(stack)}`;
  const subtle = globalThis.crypto?.subtle;
  if (subtle !== undefined) {
    try {
      const digest = await subtle.digest('SHA-1', new TextEncoder().encode(input));
      return toHex(new Uint8Array(digest));
    } catch {
      // fall through to the fallback below
    }
  }
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) hash = ((hash * 33) ^ input.charCodeAt(i)) >>> 0;
  return `djb2-${hash.toString(16).padStart(8, '0')}`;
}

function deviceInfo(): ClientErrorDevice {
  const nav = globalThis.navigator as (Navigator & { deviceMemory?: number }) | undefined;
  const view = globalThis.window;
  const standalone =
    view?.matchMedia?.('(display-mode: standalone)').matches === true ||
    (nav as (Navigator & { standalone?: boolean }) | undefined)?.standalone === true;
  return {
    ua: nav?.userAgent ?? '',
    platform: nav?.platform ?? '',
    screen:
      view?.screen === undefined
        ? ''
        : `${view.screen.width}x${view.screen.height}@${view.devicePixelRatio}`,
    memory: nav?.deviceMemory ?? null,
    standalone,
    // The TWA sets this referrer on every navigation; it is the only reliable signal (§13).
    twa: typeof document !== 'undefined' && document.referrer.startsWith('android-app://'),
  };
}

function currentRoute(): string {
  return globalThis.location === undefined ? '' : globalThis.location.pathname;
}

export interface ReportOptions {
  /** Only for `user_report` (§10.4). */
  readonly userNote?: string;
}

/**
 * Builds the §10.1 record and queues it. Returns the record, or `null` when this fingerprint has
 * already been reported in this session. Never throws: reporting an error must not raise one.
 */
export async function reportError(
  kind: ClientErrorKind,
  err: unknown,
  data?: unknown,
  options?: ReportOptions,
): Promise<ClientErrorRecord | null> {
  try {
    const message = messageOf(err);
    const stack = stackOf(err);
    const fingerprint = await fingerprintOf(kind, message, stack);

    if (reportedThisSession.has(fingerprint)) {
      breadcrumb('log', 'errors.deduped', { kind, fingerprint });
      return null;
    }
    reportedThisSession.add(fingerprint);

    // Recorded before the snapshot so the crumb is part of the record it describes.
    breadcrumb('log', 'errors.report', { kind, message, data });

    const auth = useAuthStore.getState();
    const record: ClientErrorRecord = {
      kind,
      fingerprint,
      message,
      stack,
      appVersion: APP_VERSION,
      buildSha: BUILD_SHA,
      route: currentRoute(),
      installId: auth.installId,
      userId: auth.userId,
      at: now(),
      online: globalThis.navigator?.onLine ?? true,
      device: deviceInfo(),
      breadcrumbs: breadcrumbs(),
      snapshot: await snapshot(),
      userNote: options?.userNote ?? null,
      count: 1,
    };

    await outboxEnqueue('error', record);
    return record;
  } catch (failure) {
    // Last resort. There is nowhere left to report to, so the console is the only channel.
    console.error('KL_ERROR_REPORT_FAILED', failure);
    return null;
  }
}

let captureInstalled = false;

/** Wires the global handlers of §10.1. Called once, from `main.tsx`, before the first render. */
export function installErrorCapture(): void {
  if (captureInstalled) return;
  captureInstalled = true;

  globalThis.addEventListener('error', (event: ErrorEvent) => {
    void reportError('error', event.error ?? event.message, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  globalThis.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    void reportError('unhandledrejection', event.reason);
  });

  // A failing service worker breaks offline study, which is the product's whole promise (§7.7).
  const container = globalThis.navigator?.serviceWorker;
  if (container !== undefined) {
    container.addEventListener('error', (event: Event) => {
      void reportError('sw', new Error('service worker error'), { type: event.type });
    });
  }

  breadcrumb('log', 'errors.installErrorCapture');
}

/** Test hook: the session dedupe set is module state and has to be resettable. */
export function resetErrorDedupeForTests(): void {
  reportedThisSession.clear();
}
