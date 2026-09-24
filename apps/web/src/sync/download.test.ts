import type { ContentPackage } from '@kl/content';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setClockForTests } from '../engine/clock.ts';
import { AppError } from '../errors.ts';
import { breadcrumbs, clearBreadcrumbs } from '../log/breadcrumbs.ts';
import {
  createDownloadRunner,
  type DownloadDeps,
  type DownloadEvent,
  type DownloadState,
  type InstalledPackage,
  mayRunNow,
  type PaidResponse,
  type PartialDownload,
  PERSIST_EVERY_BYTES,
  REPORT_AT_ATTEMPT,
  transition,
} from './download.ts';
import { canonicalJson, sha256Hex, verifyPaidPackage } from './package-hash.ts';

const AT = 1_760_000_000_000;

beforeEach(() => {
  setClockForTests(() => AT);
  clearBreadcrumbs();
});

afterEach(() => {
  setClockForTests(null);
  clearBreadcrumbs();
});

// ============================================================================ the table

const NONE: DownloadState = { name: 'none' };
const CHECKING: DownloadState = { name: 'checking', failures: 0 };
const DOWNLOADING: DownloadState = {
  name: 'downloading',
  version: '2026-09-30.1',
  received: 0,
  total: 1000,
  percent: 0,
  failures: 0,
};
const VERIFYING: DownloadState = { name: 'verifying', version: '2026-09-30.1', failures: 0 };
const INSTALLED: DownloadState = { name: 'installed', version: '2026-09-30.1' };
const ERROR: DownloadState = { name: 'error', reason: 'NETWORK', attempt: 1, retryAt: AT + 60_000 };

const CHECK: DownloadEvent = { type: 'CHECK' };
const UP_TO_DATE: DownloadEvent = { type: 'UP_TO_DATE', version: '2026-09-30.1' };
const NEEDED: DownloadEvent = { type: 'NEEDED', version: '2026-10-01.1', bytes: 1000, received: 0 };
const PROGRESS: DownloadEvent = { type: 'PROGRESS', received: 500 };
const COMPLETE: DownloadEvent = { type: 'COMPLETE' };
const VERIFIED: DownloadEvent = { type: 'VERIFIED' };
const FAILED: DownloadEvent = { type: 'FAILED', reason: 'NETWORK', at: AT };

/** Every state × every event — six states, seven events, forty-two cells. */
const TABLE: ReadonlyArray<readonly [DownloadState, DownloadEvent, string]> = [
  [NONE, CHECK, 'checking'],
  [NONE, UP_TO_DATE, 'installed'],
  [NONE, NEEDED, 'none'],
  [NONE, PROGRESS, 'none'],
  [NONE, COMPLETE, 'none'],
  [NONE, VERIFIED, 'none'],
  [NONE, FAILED, 'error'],

  [CHECKING, CHECK, 'checking'],
  [CHECKING, UP_TO_DATE, 'installed'],
  [CHECKING, NEEDED, 'downloading'],
  [CHECKING, PROGRESS, 'checking'],
  [CHECKING, COMPLETE, 'checking'],
  [CHECKING, VERIFIED, 'checking'],
  [CHECKING, FAILED, 'error'],

  [DOWNLOADING, CHECK, 'downloading'],
  [DOWNLOADING, UP_TO_DATE, 'downloading'],
  [DOWNLOADING, NEEDED, 'downloading'],
  [DOWNLOADING, PROGRESS, 'downloading'],
  [DOWNLOADING, COMPLETE, 'verifying'],
  [DOWNLOADING, VERIFIED, 'downloading'],
  [DOWNLOADING, FAILED, 'error'],

  [VERIFYING, CHECK, 'verifying'],
  [VERIFYING, UP_TO_DATE, 'verifying'],
  [VERIFYING, NEEDED, 'verifying'],
  [VERIFYING, PROGRESS, 'verifying'],
  [VERIFYING, COMPLETE, 'verifying'],
  [VERIFYING, VERIFIED, 'installed'],
  [VERIFYING, FAILED, 'error'],

  [INSTALLED, CHECK, 'checking'],
  [INSTALLED, UP_TO_DATE, 'installed'],
  [INSTALLED, NEEDED, 'installed'],
  [INSTALLED, PROGRESS, 'installed'],
  [INSTALLED, COMPLETE, 'installed'],
  [INSTALLED, VERIFIED, 'installed'],
  [INSTALLED, FAILED, 'error'],

  [ERROR, CHECK, 'checking'],
  [ERROR, UP_TO_DATE, 'error'],
  [ERROR, NEEDED, 'error'],
  [ERROR, PROGRESS, 'error'],
  [ERROR, COMPLETE, 'error'],
  [ERROR, VERIFIED, 'error'],
  [ERROR, FAILED, 'error'],
];

describe('download transition table', () => {
  it.each(TABLE)('%o + %o → %s', (state, event, expected) => {
    expect(transition(state, event).name).toBe(expected);
  });

  it('covers every state × event pair', () => {
    expect(TABLE).toHaveLength(6 * 7);
  });

  it('is pure: the state it is given is never mutated', () => {
    const state: DownloadState = { ...DOWNLOADING };
    transition(state, PROGRESS);
    expect(state).toEqual(DOWNLOADING);
  });

  it('breadcrumbs a change of state, not every byte of progress', () => {
    const downloading = transition(CHECKING, NEEDED);
    transition(downloading, PROGRESS);
    transition(downloading, { type: 'PROGRESS', received: 900 });
    const crumbs = breadcrumbs().filter((c) => c.msg === 'download.transition');
    expect(crumbs).toHaveLength(1);
    expect(crumbs[0]?.data).toMatchObject({ from: 'checking', to: 'downloading' });
  });
});

describe('download progress', () => {
  it('starts the count at the bytes already stored', () => {
    expect(
      transition(CHECKING, { type: 'NEEDED', version: 'v2', bytes: 1000, received: 634 }),
    ).toEqual({
      name: 'downloading',
      version: 'v2',
      received: 634,
      total: 1000,
      percent: 63,
      failures: 0,
    });
  });

  it('clamps a byte count outside the declared total, and reports 0 % with no total', () => {
    expect(transition(DOWNLOADING, { type: 'PROGRESS', received: 5000 })).toMatchObject({
      percent: 100,
    });
    expect(transition(DOWNLOADING, { type: 'PROGRESS', received: -1 })).toMatchObject({
      percent: 0,
    });
    expect(transition({ ...DOWNLOADING, total: 0 }, PROGRESS)).toMatchObject({ percent: 0 });
  });

  it('keeps the version through verification to installation', () => {
    const verifying = transition(transition(CHECKING, NEEDED), COMPLETE);
    expect(verifying).toEqual({ name: 'verifying', version: '2026-10-01.1', failures: 0 });
    expect(transition(verifying, VERIFIED)).toEqual({ name: 'installed', version: '2026-10-01.1' });
  });
});

describe('download error state', () => {
  it('climbs the backup ladder across retries', () => {
    let state = transition(DOWNLOADING, FAILED);
    expect(state).toMatchObject({ attempt: 1, retryAt: AT + 60_000 });
    state = transition(state, CHECK);
    expect(state).toEqual({ name: 'checking', failures: 1 });
    state = transition(state, { type: 'FAILED', reason: 'HASH_MISMATCH', at: AT });
    expect(state).toMatchObject({ attempt: 2, reason: 'HASH_MISMATCH', retryAt: AT + 300_000 });
  });

  it("honours a 429's retryAfter when it is longer than the ladder's step", () => {
    const state = transition(CHECKING, {
      type: 'FAILED',
      reason: 'RATE_LIMITED',
      at: AT,
      retryAfterMs: 7_200_000,
    });
    expect(state).toMatchObject({ retryAt: AT + 7_200_000 });
  });
});

describe('mayRunNow', () => {
  const error = (reason: string): DownloadState => ({
    name: 'error',
    reason,
    attempt: 1,
    retryAt: AT + 60_000,
  });

  it('runs anything off the backoff', () => {
    expect(mayRunNow(NONE, 'interval' as never, AT)).toBe(true);
    expect(mayRunNow(error('NETWORK'), 'retry', AT + 60_000)).toBe(true);
  });

  it('lets online, manual, login and a fresh entitlement jump an ordinary backoff', () => {
    for (const trigger of ['online', 'manual', 'login', 'entitled'] as const) {
      expect(mayRunNow(error('NETWORK'), trigger, AT)).toBe(true);
    }
    expect(mayRunNow(error('NETWORK'), 'start', AT)).toBe(false);
  });

  it('lets nothing jump a 429', () => {
    expect(mayRunNow(error('RATE_LIMITED'), 'manual', AT)).toBe(false);
    expect(mayRunNow(error('RATE_LIMITED'), 'retry', AT + 60_000)).toBe(true);
  });

  it('retries a refused entitlement or token only on a login, a new entitlement or a tap', () => {
    for (const reason of ['UNAUTHORIZED', 'SERVER_NOT_ENTITLED']) {
      expect(mayRunNow(error(reason), 'retry', AT + 999_999)).toBe(false);
      expect(mayRunNow(error(reason), 'online', AT)).toBe(false);
      expect(mayRunNow(error(reason), 'entitled', AT)).toBe(true);
      expect(mayRunNow(error(reason), 'manual', AT)).toBe(true);
    }
  });
});

// ============================================================================ the runner

interface Built {
  readonly pkg: ContentPackage;
  readonly bytes: Uint8Array;
  readonly hash: string;
}

async function buildPackage(version: string, words: number, filler = 0): Promise<Built> {
  const items = Array.from({ length: words }, (_, i) => ({
    id: `word-${i}`,
    lemma: `word ${i}`,
    rank: i + 1,
    weight: 1,
    note: `معنی ${i} ${'x'.repeat(filler)}`,
  }));
  const hash = await sha256Hex(canonicalJson(items));
  const pkg = { packageId: 'paid', version, builtAt: '', schemaVersion: 1, hash, items };
  return {
    pkg: pkg as unknown as ContentPackage,
    bytes: new TextEncoder().encode(JSON.stringify(pkg)),
    hash,
  };
}

interface ServeOptions {
  /** Throw (a dropped connection) once this many bytes of the body have been delivered. */
  cutAfter?: number;
  /** End the body quietly (a truncated response) after this many bytes. */
  endAfter?: number;
  /** Ignore Range and always answer 200. */
  ignoreRange?: boolean;
  /** Answer 206 starting from this byte instead of the one asked for. */
  wrongStart?: number;
  etag?: string | null;
}

const CHUNK = 1000;

async function* body(bytes: Uint8Array, options: ServeOptions): AsyncGenerator<Uint8Array> {
  let sent = 0;
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    const chunk = bytes.subarray(offset, Math.min(bytes.length, offset + CHUNK));
    if (options.cutAfter !== undefined && sent + chunk.length > options.cutAfter) {
      const head = chunk.subarray(0, options.cutAfter - sent);
      if (head.length > 0) yield head;
      throw new TypeError('network error');
    }
    if (options.endAfter !== undefined && sent + chunk.length > options.endAfter) {
      const head = chunk.subarray(0, options.endAfter - sent);
      if (head.length > 0) yield head;
      return;
    }
    sent += chunk.length;
    yield chunk;
  }
}

/** A fake `/api/content/paid` over one file, honouring `Range` + `If-Range` like Go does. */
function serve(file: Built, options: ServeOptions = {}) {
  return (from: number, ifRange: string | null): Promise<PaidResponse> => {
    const etag = options.etag === undefined ? `"${file.hash}"` : options.etag;
    const honour = from > 0 && !options.ignoreRange && ifRange === `"${file.hash}"`;
    if (honour && from >= file.bytes.length) {
      return Promise.reject(new AppError('HTTP_416', 'range', { status: 416 }));
    }
    const start = honour ? from : 0;
    return Promise.resolve({
      status: honour ? 206 : 200,
      rangeStart: honour ? (options.wrongStart ?? start) : 0,
      etag,
      chunks: body(file.bytes.subarray(start), options),
    });
  };
}

interface Harness {
  deps: DownloadDeps;
  fetches: Array<{ from: number; ifRange: string | null }>;
  published: DownloadState[];
  installed: ContentPackage[];
  reports: Array<{ err: unknown; data: unknown }>;
  timers: Array<{ ms: number; fn: () => void; cleared: boolean }>;
  partialWrites: number[];
  beacons: string[];
  kv: { partial: PartialDownload | null; installed: InstalledPackage | null };
  env: {
    online: boolean;
    userId: string | null;
    entitled: boolean;
    free: number | null;
    now: number;
  };
  setServer: (fn: DownloadDeps['fetchPaid']) => void;
  setManifestFor: (file: Built) => void;
}

function harness(file: Built, overrides: Partial<DownloadDeps> = {}): Harness {
  let server: DownloadDeps['fetchPaid'] = serve(file);
  let manifestFile = file;
  const h: Omit<Harness, 'deps' | 'setServer' | 'setManifestFor'> = {
    fetches: [],
    published: [],
    installed: [],
    reports: [],
    timers: [],
    partialWrites: [],
    beacons: [],
    kv: { partial: null, installed: null },
    env: { online: true, userId: 'user-a', entitled: true, free: null, now: AT },
  };
  const deps: DownloadDeps = {
    now: () => h.env.now,
    isOnline: () => h.env.online,
    userId: () => h.env.userId,
    isEntitled: () => h.env.entitled,
    fetchManifest: async () => ({
      free: { version: 'f', hash: 'f', bytes: 1 },
      paid: {
        version: manifestFile.pkg.version,
        hash: manifestFile.hash,
        bytes: manifestFile.bytes.length,
      },
    }),
    fetchPaid: (from, ifRange) => {
      h.fetches.push({ from, ifRange });
      return server(from, ifRange);
    },
    readInstalled: async () => h.kv.installed,
    readPartial: async () => h.kv.partial,
    writePartial: async (partial) => {
      h.partialWrites.push(partial.bytes.length);
      h.kv.partial = { ...partial, bytes: partial.bytes.slice() };
    },
    clearPartial: async () => {
      h.kv.partial = null;
    },
    storageFree: async () => h.env.free,
    verify: verifyPaidPackage,
    install: async (pkg) => {
      h.installed.push(pkg);
      h.kv.installed = { version: pkg.version, hash: pkg.hash };
    },
    publishState: (state) => h.published.push(state),
    onInstalled: (version) => h.beacons.push(version),
    reportError: (err, data) => h.reports.push({ err, data }),
    setTimer: (fn, ms) => {
      const timer = { ms, fn, cleared: false };
      h.timers.push(timer);
      return timer;
    },
    clearTimer: (handle) => {
      (handle as { cleared: boolean }).cleared = true;
    },
    ...overrides,
  };
  return {
    ...h,
    deps,
    setServer: (fn) => {
      server = fn;
    },
    setManifestFor: (next) => {
      manifestFile = next;
    },
  };
}

function names(states: readonly DownloadState[]): string[] {
  const out: string[] = [];
  for (const state of states) if (out[out.length - 1] !== state.name) out.push(state.name);
  return out;
}

function codeOf(report: { err: unknown } | undefined): string | undefined {
  return report?.err instanceof AppError ? report.err.code : undefined;
}

describe('a download run', () => {
  it('downloads, verifies and installs the paid package', async () => {
    const file = await buildPackage('2026-09-30.1', 40);
    const h = harness(file);
    const runner = createDownloadRunner(h.deps);

    await runner.request('entitled');

    expect(names(h.published)).toEqual(['checking', 'downloading', 'verifying', 'installed']);
    expect(runner.state()).toEqual({ name: 'installed', version: '2026-09-30.1' });
    expect(h.fetches).toEqual([{ from: 0, ifRange: null }]);
    expect(h.installed).toHaveLength(1);
    expect(h.installed[0]?.items).toHaveLength(40);
    expect(h.kv.partial).toBeNull();
    expect(h.beacons).toEqual(['2026-09-30.1']);
    expect(h.reports).toEqual([]);
    const last = h.published.filter((s) => s.name === 'downloading').at(-1);
    expect(last).toMatchObject({ received: file.bytes.length, percent: 100 });
  });

  it('fetches nothing when the stored package already has the manifest hash', async () => {
    const file = await buildPackage('2026-09-30.1', 5);
    const h = harness(file);
    h.kv.installed = { version: file.pkg.version, hash: file.hash };
    const runner = createDownloadRunner(h.deps);

    await runner.request('start');

    expect(runner.state()).toEqual({ name: 'installed', version: '2026-09-30.1' });
    expect(h.fetches).toEqual([]);
  });

  it('init puts a stored package in `installed` before any network', async () => {
    const file = await buildPackage('v1', 2);
    const h = harness(file);
    h.kv.installed = { version: 'v1', hash: file.hash };
    const runner = createDownloadRunner(h.deps);
    await runner.init();
    expect(runner.state()).toEqual({ name: 'installed', version: 'v1' });
  });

  it('resumes an interrupted stream from exactly the byte it stopped at', async () => {
    const file = await buildPackage('v1', 300);
    const h = harness(file);
    const cut = 5_500;
    h.setServer(serve(file, { cutAfter: cut }));
    const runner = createDownloadRunner(h.deps);

    await runner.request('entitled');

    expect(runner.state()).toMatchObject({ name: 'error', reason: 'DOWNLOAD_INTERRUPTED' });
    expect(h.kv.partial?.bytes.length).toBe(cut);
    expect(h.kv.partial?.hash).toBe(file.hash);
    expect(h.installed).toEqual([]);

    h.setServer(serve(file));
    await runner.request('online');

    expect(h.fetches[1]).toEqual({ from: cut, ifRange: `"${file.hash}"` });
    expect(runner.state()).toEqual({ name: 'installed', version: 'v1' });
    expect(h.installed[0]?.items).toHaveLength(300);
    // The resumed run's count starts at the stored bytes, not at zero.
    const resumed = h.published.filter((s) => s.name === 'downloading').slice(-1)[0];
    expect(resumed).toMatchObject({ received: file.bytes.length });
    expect(h.published).toContainEqual(expect.objectContaining({ name: 'downloading', received: cut }));
  });

  it('resumes after a truncated response (the stream ended early without an error)', async () => {
    const file = await buildPackage('v1', 100);
    const h = harness(file);
    h.setServer(serve(file, { endAfter: 3_000 }));
    const runner = createDownloadRunner(h.deps);

    await runner.request('entitled');
    expect(runner.state()).toMatchObject({ name: 'error', reason: 'DOWNLOAD_TRUNCATED' });
    expect(h.kv.partial?.bytes.length).toBe(3_000);

    h.setServer(serve(file));
    await runner.request('manual');
    expect(h.fetches[1]?.from).toBe(3_000);
    expect(runner.state().name).toBe('installed');
  });

  it('stores the bytes while streaming, every 256 KB, so a killed tab keeps them', async () => {
    const file = await buildPackage('v1', 20, 40_000); // ≈ 800 KB
    const h = harness(file);
    const runner = createDownloadRunner(h.deps);

    await runner.request('entitled');

    const during = h.partialWrites.filter((n) => n < file.bytes.length);
    expect(during.length).toBeGreaterThanOrEqual(Math.floor(file.bytes.length / PERSIST_EVERY_BYTES));
    expect(runner.state().name).toBe('installed');
  });

  it('restarts from byte 0 when the server answers a resume with a whole 200', async () => {
    const file = await buildPackage('v1', 100);
    const h = harness(file);
    h.kv.partial = { hash: file.hash, version: 'v1', bytes: file.bytes.slice(0, 2_000) };
    h.setServer(serve(file, { ignoreRange: true }));
    const runner = createDownloadRunner(h.deps);

    await runner.request('start');

    expect(h.fetches).toEqual([{ from: 2_000, ifRange: `"${file.hash}"` }]);
    expect(runner.state().name).toBe('installed');
    expect(h.installed[0]?.items).toHaveLength(100);
    expect(breadcrumbs().some((c) => c.msg === 'download.restart')).toBe(true);
  });

  it('drops stored bytes that belong to an older manifest and fetches the new file whole', async () => {
    const old = await buildPackage('v1', 50);
    const file = await buildPackage('v2', 60);
    const h = harness(file);
    h.kv.partial = { hash: old.hash, version: 'v1', bytes: old.bytes.slice(0, 2_000) };
    const runner = createDownloadRunner(h.deps);

    await runner.request('start');

    expect(h.fetches).toEqual([{ from: 0, ifRange: null }]);
    expect(runner.state()).toEqual({ name: 'installed', version: 'v2' });
  });

  it('on a 416 drops the stored bytes and fetches the file whole, once', async () => {
    const file = await buildPackage('v1', 30);
    const h = harness(file);
    // More bytes than the file: they cannot be a prefix of it.
    const junk = new Uint8Array(file.bytes.length + 10);
    h.kv.partial = { hash: file.hash, version: 'v1', bytes: junk.subarray(0, file.bytes.length - 1) };
    h.setServer((from, ifRange) =>
      from > 0
        ? Promise.reject(new AppError('HTTP_416', 'range', { status: 416 }))
        : serve(file)(from, ifRange),
    );
    const runner = createDownloadRunner(h.deps);

    await runner.request('start');

    expect(h.fetches.map((f) => f.from)).toEqual([file.bytes.length - 1, 0]);
    expect(runner.state().name).toBe('installed');
  });

  it('skips the fetch when every byte is already stored, and installs them', async () => {
    const file = await buildPackage('v1', 10);
    const h = harness(file);
    h.kv.partial = { hash: file.hash, version: 'v1', bytes: file.bytes.slice() };
    const runner = createDownloadRunner(h.deps);

    await runner.request('start');

    expect(h.fetches).toEqual([]);
    expect(runner.state().name).toBe('installed');
  });

  it('a hash mismatch keeps the old package, drops the bytes and reports once', async () => {
    const previous = await buildPackage('v1', 10);
    const promised = await buildPackage('v2', 20);
    // Same length, valid JSON, one letter changed: only the hash can tell.
    const tampered = promised.bytes.slice();
    tampered[new TextDecoder().decode(tampered).indexOf('"word 0"') + 6] = 0x39;
    const h = harness(promised);
    h.kv.installed = { version: 'v1', hash: previous.hash };
    h.setServer(serve({ ...promised, bytes: tampered }));
    const runner = createDownloadRunner(h.deps);

    await runner.request('start');

    expect(runner.state()).toMatchObject({ name: 'error', reason: 'HASH_MISMATCH' });
    expect(h.installed).toEqual([]);
    expect(h.kv.installed).toEqual({ version: 'v1', hash: previous.hash });
    expect(h.kv.partial).toBeNull();
    expect(h.reports.map(codeOf)).toEqual(['HASH_MISMATCH']);
    expect(h.timers.at(-1)?.ms).toBe(60_000);
  });

  it('refuses a file whose ETag is not the manifest hash, and drops the stored bytes', async () => {
    const file = await buildPackage('v1', 10);
    const h = harness(file);
    h.kv.partial = { hash: file.hash, version: 'v1', bytes: file.bytes.slice(0, 100) };
    h.setServer(serve(file, { etag: '"something-else"' }));
    const runner = createDownloadRunner(h.deps);

    await runner.request('start');

    expect(runner.state()).toMatchObject({ reason: 'DOWNLOAD_CONTENT_CHANGED' });
    expect(h.kv.partial).toBeNull();
  });

  it('refuses a 206 that starts at the wrong byte', async () => {
    const file = await buildPackage('v1', 50);
    const h = harness(file);
    h.kv.partial = { hash: file.hash, version: 'v1', bytes: file.bytes.slice(0, 1_000) };
    h.setServer(serve(file, { wrongStart: 0 }));
    const runner = createDownloadRunner(h.deps);

    await runner.request('start');

    expect(runner.state()).toMatchObject({ reason: 'DOWNLOAD_RANGE_MISMATCH' });
    expect(h.kv.partial).toBeNull();
    expect(h.installed).toEqual([]);
  });

  it('keeps verified bytes when the install fails, and installs them next time without fetching', async () => {
    const file = await buildPackage('v1', 10);
    let failInstall = true;
    const h = harness(file, {
      install: async (pkg) => {
        if (failInstall) throw new Error('QuotaExceededError');
        h.installed.push(pkg);
        h.kv.installed = { version: pkg.version, hash: pkg.hash };
      },
    });
    const runner = createDownloadRunner(h.deps);

    await runner.request('entitled');
    expect(runner.state()).toMatchObject({ reason: 'INSTALL_FAILED' });
    expect(h.kv.partial?.bytes.length).toBe(file.bytes.length);

    failInstall = false;
    await runner.request('manual');
    expect(h.fetches).toHaveLength(1);
    expect(runner.state().name).toBe('installed');
  });

  it('refuses to start without room for the package', async () => {
    const file = await buildPackage('v1', 10);
    const h = harness(file);
    h.env.free = file.bytes.length;
    const runner = createDownloadRunner(h.deps);

    await runner.request('entitled');

    expect(runner.state()).toMatchObject({ reason: 'STORAGE_FULL' });
    expect(h.fetches).toEqual([]);
  });
});

describe('a download run refused by the server', () => {
  async function refused(error: AppError) {
    const file = await buildPackage('v1', 5);
    const h = harness(file);
    h.setServer(() => Promise.reject(error));
    const runner = createDownloadRunner(h.deps);
    await runner.request('entitled');
    return { h, runner };
  }

  it('403 NOT_ENTITLED: reported, not retried on a timer, retried on a fresh entitlement', async () => {
    const { h, runner } = await refused(
      new AppError('SERVER_NOT_ENTITLED', 'no', { status: 403 }),
    );
    expect(runner.state()).toMatchObject({ reason: 'SERVER_NOT_ENTITLED' });
    expect(h.reports.map(codeOf)).toEqual(['SERVER_NOT_ENTITLED']);
    expect(h.timers).toEqual([]);

    await runner.request('online');
    expect(h.fetches).toHaveLength(1);
    await runner.request('entitled');
    expect(h.fetches).toHaveLength(2);
  });

  it('429 RATE_LIMITED: waits out retryAfter and nothing jumps it', async () => {
    const { h, runner } = await refused(
      new AppError('RATE_LIMITED', 'slow down', { status: 429, retryAfter: 7200 }),
    );
    expect(runner.state()).toMatchObject({ reason: 'RATE_LIMITED', retryAt: AT + 7_200_000 });
    expect(h.timers[0]?.ms).toBe(7_200_000);

    await runner.request('manual');
    await runner.request('online');
    expect(h.fetches).toHaveLength(1);
    expect(h.reports).toEqual([]);
  });

  it('503 PAYMENT_DISABLED_MOCK_SMS: a quiet error on the ladder, never a crash', async () => {
    const { h, runner } = await refused(
      new AppError('SERVER_PAYMENT_DISABLED_MOCK_SMS', 'gated', { status: 503 }),
    );
    expect(runner.state()).toMatchObject({
      name: 'error',
      reason: 'SERVER_PAYMENT_DISABLED_MOCK_SMS',
    });
    expect(h.timers[0]?.ms).toBe(60_000);
    expect(h.reports).toEqual([]);
  });

  it('404 NOT_FOUND (a server older than this client): reported the first time', async () => {
    const { h, runner } = await refused(new AppError('SERVER_NOT_FOUND', 'no', { status: 404 }));
    expect(runner.state()).toMatchObject({ reason: 'SERVER_NOT_FOUND' });
    expect(h.reports.map(codeOf)).toEqual(['SERVER_NOT_FOUND']);
  });

  it('a network failure at the manifest leaves an installed package installed on disk', async () => {
    const file = await buildPackage('v1', 5);
    const h = harness(file, {
      fetchManifest: () => Promise.reject(new AppError('NETWORK', 'offline')),
    });
    h.kv.installed = { version: 'v1', hash: file.hash };
    const runner = createDownloadRunner(h.deps);
    await runner.init();
    await runner.request('start');
    expect(runner.state()).toMatchObject({ name: 'error', reason: 'NETWORK' });
    expect(h.kv.installed).toEqual({ version: 'v1', hash: file.hash });
  });

  it('climbs the ladder through real retries and reports the fifth failure once', async () => {
    const { h, runner } = await refused(new AppError('NETWORK', 'offline'));
    const waits: number[] = [h.timers[0]?.ms ?? -1];
    for (let i = 1; i < REPORT_AT_ATTEMPT + 1; i += 1) {
      await runner.request('online');
      waits.push(h.timers.at(-1)?.ms ?? -1);
    }
    expect(waits).toEqual([60_000, 300_000, 900_000, 3_600_000, 3_600_000, 3_600_000]);
    expect(h.reports).toHaveLength(1);
    expect(h.reports[0]?.data).toMatchObject({ attempt: REPORT_AT_ATTEMPT });
  });

  it('the retry timer runs the download again once the wait is over', async () => {
    const file = await buildPackage('v1', 5);
    const h = harness(file);
    h.setServer(() => Promise.reject(new AppError('NETWORK', 'offline')));
    const runner = createDownloadRunner(h.deps);
    await runner.request('entitled');
    expect(h.timers).toHaveLength(1);

    h.setServer(serve(file));
    h.env.now = AT + 60_000;
    h.timers[0]?.fn();
    await expect.poll(() => runner.state().name).toBe('installed');
    expect(h.fetches).toHaveLength(2);
  });
});

describe('when a download may start at all', () => {
  it('never runs offline, anonymous or unentitled', async () => {
    const file = await buildPackage('v1', 5);
    for (const env of [
      { online: false, userId: 'u', entitled: true },
      { online: true, userId: null, entitled: true },
      { online: true, userId: 'u', entitled: false },
    ]) {
      const h = harness(file);
      Object.assign(h.env, env);
      const runner = createDownloadRunner(h.deps);
      await runner.request('manual');
      expect(h.fetches).toEqual([]);
      expect(runner.state().name).toBe('none');
    }
  });

  it('runs one at a time: a trigger during a run runs once after it', async () => {
    const file = await buildPackage('v1', 5);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let manifests = 0;
    const h = harness(file);
    const base = h.deps.fetchManifest;
    h.deps = {
      ...h.deps,
      fetchManifest: async () => {
        manifests += 1;
        if (manifests === 1) await gate;
        return base();
      },
    } as DownloadDeps;
    const runner = createDownloadRunner(h.deps);

    const first = runner.request('entitled');
    await runner.request('online');
    await runner.request('manual');
    release();
    await first;

    expect(manifests).toBe(2);
    expect(h.fetches).toHaveLength(1);
    expect(runner.state().name).toBe('installed');
  });
});
