import type { ReviewEvent } from '@kl/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { OutboxKind, OutboxRow } from '../db/dexie.ts';
import { setClockForTests } from '../engine/clock.ts';
import { AppError } from '../errors.ts';
import { breadcrumbs, clearBreadcrumbs } from '../log/breadcrumbs.ts';
import type { SyncPullResponse, SyncPushResponse } from '../net/api.ts';
import {
  BACKUP_INTERVAL_MS,
  type BackupDeps,
  type BackupEvent,
  type BackupRunner,
  type BackupState,
  type BackupTrigger,
  backupBackoffMs,
  createBackupRunner,
  mayRunNow,
  PUSH_BATCH,
  type SyncCursor,
  transition,
} from './backup.ts';

const AT = 1_760_000_000_000;

beforeEach(() => {
  setClockForTests(() => AT);
  clearBreadcrumbs();
});

afterEach(() => {
  setClockForTests(null);
  clearBreadcrumbs();
});

// ============================================================================ the machine

const IDLE: BackupState = { name: 'idle' };
const PUSHING: BackupState = { name: 'pushing', failures: 0 };
const PULLING: BackupState = { name: 'pulling', failures: 0 };
const ERROR: BackupState = { name: 'error', reason: 'NETWORK', attempt: 1, retryAt: AT + 60_000 };

const START: BackupEvent = { type: 'START' };
const PUSHED: BackupEvent = { type: 'PUSHED' };
const PULLED: BackupEvent = { type: 'PULLED' };
const FAILED: BackupEvent = { type: 'FAILED', reason: 'NETWORK', at: AT };

/** Every state × every event. A blank cell would be a hole an agent has to guess at. */
const TABLE: ReadonlyArray<readonly [BackupState, BackupEvent, string]> = [
  [IDLE, START, 'pushing'],
  [IDLE, PUSHED, 'idle'],
  [IDLE, PULLED, 'idle'],
  [IDLE, FAILED, 'idle'],

  [PUSHING, START, 'pushing'],
  [PUSHING, PUSHED, 'pulling'],
  [PUSHING, PULLED, 'pushing'],
  [PUSHING, FAILED, 'error'],

  [PULLING, START, 'pulling'],
  [PULLING, PUSHED, 'pulling'],
  [PULLING, PULLED, 'idle'],
  [PULLING, FAILED, 'error'],

  [ERROR, START, 'pushing'],
  [ERROR, PUSHED, 'error'],
  [ERROR, PULLED, 'error'],
  [ERROR, FAILED, 'error'],
];

describe('backup transition table', () => {
  it.each(TABLE)('%o + %o → %s', (state, event, expected) => {
    expect(transition(state, event).name).toBe(expected);
  });

  it('covers every state × event pair', () => {
    expect(TABLE).toHaveLength(4 * 4);
  });

  it('is pure: the state it is given is never mutated', () => {
    const state: BackupState = { name: 'pushing', failures: 0 };
    transition(state, FAILED);
    expect(state).toEqual({ name: 'pushing', failures: 0 });
  });

  it('breadcrumbs every transition and nothing else', () => {
    transition(IDLE, START);
    transition(IDLE, PULLED);
    const crumbs = breadcrumbs().filter((c) => c.msg === 'backup.transition');
    expect(crumbs).toHaveLength(1);
    expect(crumbs[0]?.data).toEqual({ from: 'idle', event: 'START', to: 'pushing' });
  });
});

describe('backup error state', () => {
  it('records the reason and the first backoff', () => {
    const next = transition(PUSHING, FAILED);
    expect(next).toEqual({ name: 'error', reason: 'NETWORK', attempt: 1, retryAt: AT + 60_000 });
  });

  it('a retry that starts from error keeps climbing the ladder, then stays hourly', () => {
    const expected = [60_000, 300_000, 900_000, 3_600_000, 3_600_000];
    let state: BackupState = IDLE;
    for (const [i, wait] of expected.entries()) {
      state = transition(state, START);
      state = transition(state, { type: 'FAILED', reason: 'HTTP_500', at: AT });
      expect(state).toEqual({
        name: 'error',
        reason: 'HTTP_500',
        attempt: i + 1,
        retryAt: AT + wait,
      });
    }
  });

  it('a failure while pulling counts the same as one while pushing', () => {
    let state = transition(ERROR, START);
    state = transition(state, PUSHED);
    expect(state).toEqual({ name: 'pulling', failures: 1 });
    expect(transition(state, FAILED)).toMatchObject({ attempt: 2, retryAt: AT + 300_000 });
  });

  it('a success resets the count', () => {
    let state = transition(ERROR, START);
    state = transition(transition(state, PUSHED), PULLED);
    expect(state).toEqual(IDLE);
    state = transition(transition(state, START), FAILED);
    expect(state).toMatchObject({ attempt: 1 });
  });

  it('a 429 waits for the longer of its retryAfter and the ladder', () => {
    const long = transition(PUSHING, {
      type: 'FAILED',
      reason: 'RATE_LIMITED',
      at: AT,
      retryAfterMs: 600_000,
    });
    expect(long).toMatchObject({ retryAt: AT + 600_000 });
    const short = transition(PUSHING, {
      type: 'FAILED',
      reason: 'RATE_LIMITED',
      at: AT,
      retryAfterMs: 5_000,
    });
    expect(short).toMatchObject({ retryAt: AT + 60_000 });
  });

  it('keeps the latest reason', () => {
    const first = transition(PUSHING, FAILED);
    const second = transition(first, { type: 'FAILED', reason: 'UNAUTHORIZED', at: AT });
    expect(second).toMatchObject({ reason: 'UNAUTHORIZED', attempt: 2 });
  });
});

describe('backupBackoffMs', () => {
  it('is 1 min, 5 min, 15 min, then hourly (§7.4)', () => {
    expect(backupBackoffMs(1)).toBe(60_000);
    expect(backupBackoffMs(2)).toBe(300_000);
    expect(backupBackoffMs(3)).toBe(900_000);
    expect(backupBackoffMs(4)).toBe(3_600_000);
    expect(backupBackoffMs(99)).toBe(3_600_000);
  });
});

describe('mayRunNow', () => {
  const early = AT;
  const late = AT + 60_000;
  const network: BackupState = ERROR;
  const limited: BackupState = { ...ERROR, reason: 'RATE_LIMITED' } as BackupState;
  const unauthorized: BackupState = { ...ERROR, reason: 'UNAUTHORIZED' } as BackupState;
  const triggers: BackupTrigger[] = [
    'start',
    'online',
    'session-end',
    'interval',
    'login',
    'manual',
    'retry',
  ];

  it('anything runs outside an error', () => {
    for (const t of triggers) expect(mayRunNow(IDLE, t, early)).toBe(true);
  });

  it('during a backoff only manual, online and login jump it', () => {
    const jumped = triggers.filter((t) => mayRunNow(network, t, early));
    expect(jumped.sort()).toEqual(['login', 'manual', 'online']);
    for (const t of triggers) expect(mayRunNow(network, t, late)).toBe(true);
  });

  it('nothing jumps a 429', () => {
    for (const t of triggers) expect(mayRunNow(limited, t, early)).toBe(false);
    for (const t of triggers) expect(mayRunNow(limited, t, late)).toBe(true);
  });

  it('a 401 waits for a login or the user, never for a timer', () => {
    const allowed = triggers.filter((t) => mayRunNow(unauthorized, t, late + 1e9));
    expect(allowed.sort()).toEqual(['login', 'manual']);
  });
});

// ============================================================================ the runner

let seq = 0;
function ev(n: number, device = 'this-device'): ReviewEvent {
  seq += 1;
  const id = `0190${String(seq).padStart(4, '0')}-0000-7000-8000-${String(n).padStart(12, '0')}`;
  return { id, itemId: `word-${n}`, at: AT - n * 1000, kind: 'review', grade: 1, device };
}

/** The server: insert-ignore by id, per user, pulled in insertion order. */
class FakeServer {
  readonly rows: Array<{ user: string; event: ReviewEvent }> = [];
  pushCalls: number[] = [];
  pullCalls = 0;
  /** Thrown by the next push/pull call instead of answering, in order. */
  pushFailures: AppError[] = [];
  pullFailures: AppError[] = [];
  /** When set, a push waits for this before answering. */
  gate: Promise<void> | null = null;
  inFlight = 0;
  maxInFlight = 0;
  lie = false;

  async push(user: string, events: readonly ReviewEvent[]): Promise<SyncPushResponse> {
    this.inFlight += 1;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    try {
      this.pushCalls.push(events.length);
      if (this.gate !== null) await this.gate;
      const failure = this.pushFailures.shift();
      if (failure !== undefined) throw failure;
      let accepted = 0;
      let duplicates = 0;
      for (const event of events) {
        if (this.rows.some((r) => r.event.id === event.id)) duplicates += 1;
        else {
          this.rows.push({ user, event });
          accepted += 1;
        }
      }
      return this.lie ? { accepted: accepted - 1, duplicates } : { accepted, duplicates };
    } finally {
      this.inFlight -= 1;
    }
  }

  async pull(user: string, since: string | null, limit: number): Promise<SyncPullResponse> {
    this.pullCalls += 1;
    const failure = this.pullFailures.shift();
    if (failure !== undefined) throw failure;
    const mine = this.rows.map((r, i) => ({ ...r, i })).filter((r) => r.user === user);
    const from = since === null ? -1 : Number(since);
    const after = mine.filter((r) => r.i > from);
    const page = after.slice(0, limit);
    const last = page.at(-1);
    return {
      events: page.map((r) => r.event),
      cursor: last === undefined ? (since ?? '') : String(last.i),
      more: after.length > limit,
    };
  }

  eventsOf(user: string): ReviewEvent[] {
    return this.rows.filter((r) => r.user === user).map((r) => r.event);
  }
}

interface Timer {
  readonly id: number;
  readonly at: number;
  readonly fn: () => void;
}

/** The device: an events table, kv, an outbox, a clock and timers — all in memory. */
class FakeDevice {
  clock = AT;
  online = true;
  user: string | null = 'user-a';
  readonly local = new Map<string, { event: ReviewEvent; synced: 0 | 1 }>();
  cursor: SyncCursor | null = null;
  lastBackupAt: number | null = null;
  outbox: OutboxRow[] = [];
  live: Record<OutboxKind, boolean> = { flag: false, beacon: false, error: false };
  sent: Array<{ kind: OutboxKind; payload: unknown }> = [];
  sendFailures = new Map<number, AppError>();
  refolded: ReviewEvent[][] = [];
  published: string[] = [];
  reports: unknown[] = [];
  unsyncedPublished: number[] = [];
  markSyncedFailures = 0;
  cursorWriteFailures = 0;
  timers: Timer[] = [];
  nextTimer = 1;

  constructor(readonly server: FakeServer) {}

  add(...events: ReviewEvent[]): void {
    for (const event of events) this.local.set(event.id, { event, synced: 0 });
  }

  unsynced(): ReviewEvent[] {
    return [...this.local.values()].filter((r) => r.synced === 0).map((r) => r.event);
  }

  deps(): BackupDeps {
    return {
      now: () => this.clock,
      isOnline: () => this.online,
      userId: () => this.user,
      unsyncedEvents: async (limit) => this.unsynced().slice(0, limit),
      markSynced: async (ids) => {
        if (this.markSyncedFailures > 0) {
          this.markSyncedFailures -= 1;
          throw new Error('the tab was killed between push and mark');
        }
        for (const id of ids) {
          const row = this.local.get(id);
          if (row !== undefined) row.synced = 1;
        }
      },
      unsyncedCount: async () => this.unsynced().length,
      insertPulled: async (events) => {
        const fresh: ReviewEvent[] = [];
        for (const event of events) {
          if (this.local.has(event.id)) continue;
          this.local.set(event.id, { event, synced: 1 });
          fresh.push(event);
        }
        return fresh;
      },
      onNewEvents: (fresh) => {
        this.refolded.push([...fresh]);
      },
      readCursor: async () => this.cursor,
      writeCursor: async (cursor) => {
        if (this.cursorWriteFailures > 0) {
          this.cursorWriteFailures -= 1;
          throw new Error('the tab was killed before the cursor was stored');
        }
        this.cursor = cursor;
      },
      writeLastBackupAt: async (at) => {
        this.lastBackupAt = at;
      },
      outboxAll: async (limit) => this.outbox.slice(0, limit),
      outboxDelete: async (s) => {
        this.outbox = this.outbox.filter((row) => row.seq !== s);
      },
      outboxRecordFailure: async (s, reason) => {
        this.outbox = this.outbox.map((row) =>
          row.seq === s ? { ...row, attempts: row.attempts + 1, lastError: reason } : row,
        );
      },
      outboxRouteLive: (kind) => this.live[kind],
      sendOutbox: async (kind, payload) => {
        const s = (payload as { seq: number }).seq;
        const failure = this.sendFailures.get(s);
        if (failure !== undefined) throw failure;
        this.sent.push({ kind, payload });
        return { ok: true };
      },
      push: (events) => this.server.push(this.user ?? '', events),
      pull: (since, limit) => this.server.pull(this.user ?? '', since, limit),
      publishState: (state) => {
        this.published.push(state.name);
      },
      publishUnsyncedCount: (count) => {
        this.unsyncedPublished.push(count);
      },
      publishLastBackupAt: () => {},
      reportError: (err, data) => {
        this.reports.push({ err, data });
      },
      setTimer: (fn, ms) => {
        const timer = { id: this.nextTimer++, at: this.clock + ms, fn };
        this.timers.push(timer);
        return timer.id;
      },
      clearTimer: (handle) => {
        this.timers = this.timers.filter((t) => t.id !== handle);
      },
    };
  }

  /** Moves the clock and fires every timer that falls due, in order. */
  async advance(ms: number): Promise<void> {
    const target = this.clock + ms;
    for (;;) {
      const due = this.timers.filter((t) => t.at <= target).sort((a, b) => a.at - b.at)[0];
      if (due === undefined) break;
      this.timers = this.timers.filter((t) => t !== due);
      this.clock = due.at;
      due.fn();
      await settle();
    }
    this.clock = target;
  }
}

/** Every fake resolves without I/O, so one macrotask turn drains the whole chain. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const networkError = () => new AppError('NETWORK', 'the request never reached the server');
const httpError = (code: string, status: number, extra: object = {}) =>
  new AppError(code, `${status}`, { route: '/api/sync/push', status, ...extra });

let server: FakeServer;
let device: FakeDevice;
let runner: BackupRunner;

beforeEach(() => {
  seq = 0;
  server = new FakeServer();
  device = new FakeDevice(server);
  runner = createBackupRunner(device.deps());
});

afterEach(() => {
  runner.stop();
});

describe('a run', () => {
  it('pushes every unsynced event, marks them synced, pulls, and ends idle', async () => {
    device.add(ev(1), ev(2), ev(3));

    await runner.request('manual');

    expect(server.eventsOf('user-a')).toHaveLength(3);
    expect(device.unsynced()).toEqual([]);
    expect(device.published).toEqual(['pushing', 'pulling', 'idle']);
    expect(runner.state()).toEqual({ name: 'idle' });
    expect(device.lastBackupAt).toBe(AT);
    expect(device.cursor).toEqual({ userId: 'user-a', cursor: '2' });
    // Its own events come back on the pull and are already known: nothing to re-fold.
    expect(device.refolded).toEqual([]);
    expect(device.unsyncedPublished.at(-1)).toBe(0);
  });

  it('pushes in batches of 500', async () => {
    for (let n = 0; n < 1234; n++) device.add(ev(n));
    await runner.request('manual');
    expect(PUSH_BATCH).toBe(500);
    expect(server.pushCalls).toEqual([500, 500, 234]);
    expect(server.rows).toHaveLength(1234);
  });

  it('with nothing to push, still pulls', async () => {
    await runner.request('start');
    expect(server.pushCalls).toEqual([]);
    expect(server.pullCalls).toBe(1);
    expect(runner.state().name).toBe('idle');
  });

  it('pulls page after page, stores the cursor after each, and re-folds only new events', async () => {
    const elsewhere = Array.from({ length: 1200 }, (_, n) => ev(n, 'other-phone'));
    for (const event of elsewhere) server.rows.push({ user: 'user-a', event });
    server.rows.push({ user: 'user-b', event: ev(9999) });
    const mine = ev(5000);
    device.add(mine);

    await runner.request('manual');

    expect(server.pullCalls).toBe(3);
    expect(device.local.size).toBe(1201);
    const refolded = device.refolded.flat();
    expect(refolded).toHaveLength(1200);
    expect(new Set(refolded.map((e) => e.id)).size).toBe(1200);
    expect(refolded.some((e) => e.id === mine.id)).toBe(false);
    // Nothing of user B's.
    expect([...device.local.values()].some((r) => r.event.itemId === 'word-9999')).toBe(false);
    expect(device.cursor).toEqual({ userId: 'user-a', cursor: '1201' });
  });

  it('pulls from the start when the stored cursor belongs to another user', async () => {
    server.rows.push({ user: 'user-a', event: ev(1, 'other-phone') });
    device.cursor = { userId: 'user-b', cursor: '999' };
    await runner.request('manual');
    expect(device.local.size).toBe(1);
    expect(device.cursor).toEqual({ userId: 'user-a', cursor: '0' });
  });

  it('refuses to mark events synced when the server does not account for all of them', async () => {
    device.add(ev(1), ev(2));
    server.lie = true;
    await runner.request('manual');
    expect(runner.state()).toMatchObject({ name: 'error', reason: 'SYNC_PUSH_MISMATCH' });
    expect(device.unsynced()).toHaveLength(2);
  });
});

describe('failures', () => {
  it('offline: nothing runs, nothing fails, and coming online runs it', async () => {
    device.add(ev(1));
    device.online = false;

    await runner.request('start');
    await runner.request('interval');
    expect(server.pushCalls).toEqual([]);
    expect(runner.state()).toEqual({ name: 'idle' });
    expect(device.published).toEqual([]);
    expect(device.unsyncedPublished.at(-1)).toBe(1);

    device.online = true;
    await runner.request('online');
    expect(server.rows).toHaveLength(1);
  });

  it('a network failure backs off 1 min, then the retry timer runs it', async () => {
    device.add(ev(1));
    server.pushFailures.push(networkError());

    await runner.request('start');
    expect(runner.state()).toEqual({
      name: 'error',
      reason: 'NETWORK',
      attempt: 1,
      retryAt: AT + 60_000,
    });
    expect(device.unsynced()).toHaveLength(1);

    // An interval tick inside the backoff does not run.
    await runner.request('interval');
    expect(server.pushCalls).toHaveLength(1);

    await device.advance(59_999);
    expect(server.pushCalls).toHaveLength(1);
    await device.advance(1);
    expect(server.pushCalls).toHaveLength(2);
    expect(runner.state()).toEqual({ name: 'idle' });
    expect(device.unsynced()).toEqual([]);
  });

  it('repeated failures climb 1, 5, 15 min, then hourly, through real retries', async () => {
    device.add(ev(1));
    for (let i = 0; i < 6; i++) server.pushFailures.push(httpError('HTTP_502', 502));

    await runner.request('start');
    const waits: number[] = [];
    for (let i = 0; i < 5; i++) {
      const state = runner.state();
      if (state.name !== 'error') throw new Error('expected error');
      waits.push(state.retryAt - device.clock);
      await device.advance(state.retryAt - device.clock);
    }
    expect(waits).toEqual([60_000, 300_000, 900_000, 3_600_000, 3_600_000]);
  });

  it('files one client_errors record at the fifth consecutive failure, not before, not again', async () => {
    device.add(ev(1));
    for (let i = 0; i < 7; i++) server.pushFailures.push(networkError());

    await runner.request('start');
    for (let i = 0; i < 6; i++) {
      expect(device.reports).toHaveLength(i < 4 ? 0 : 1);
      const state = runner.state();
      if (state.name !== 'error') throw new Error('expected error');
      await device.advance(state.retryAt - device.clock);
    }
    expect(device.reports).toHaveLength(1);
    expect(device.reports[0]).toMatchObject({ data: { attempt: 5, reason: 'NETWORK' } });
  });

  it('a 429 respects retryAfter: not even the manual button jumps it', async () => {
    device.add(ev(1));
    server.pushFailures.push(httpError('RATE_LIMITED', 429, { retryAfter: 600 }));

    await runner.request('manual');
    expect(runner.state()).toMatchObject({
      name: 'error',
      reason: 'RATE_LIMITED',
      retryAt: AT + 600_000,
    });

    await device.advance(120_000);
    await runner.request('manual');
    await runner.request('online');
    expect(server.pushCalls).toHaveLength(1);

    await device.advance(480_000);
    expect(server.pushCalls).toHaveLength(2);
    expect(runner.state().name).toBe('idle');
  });

  it('a 401 stops retrying until a login (or the user) asks again', async () => {
    device.add(ev(1));
    server.pushFailures.push(httpError('UNAUTHORIZED', 401));

    await runner.request('start');
    expect(runner.state()).toMatchObject({ name: 'error', reason: 'UNAUTHORIZED' });
    expect(device.timers.filter((t) => t.at < AT + BACKUP_INTERVAL_MS)).toEqual([]);

    await device.advance(10 * 3_600_000);
    await runner.request('interval');
    await runner.request('online');
    expect(server.pushCalls).toHaveLength(1);

    await runner.request('login');
    expect(server.pushCalls).toHaveLength(2);
    expect(runner.state().name).toBe('idle');
  });

  it('a failure mid-push keeps the batches that landed and resends only the rest', async () => {
    for (let n = 0; n < 1200; n++) device.add(ev(n));
    // The first batch lands, the second fails.
    let calls = 0;
    const realPush = server.push.bind(server);
    server.push = async (user, events) => {
      calls += 1;
      if (calls === 2) throw networkError();
      return realPush(user, events);
    };

    await runner.request('manual');
    expect(runner.state()).toMatchObject({ name: 'error', reason: 'NETWORK' });
    expect(device.unsynced()).toHaveLength(700);
    expect(server.rows).toHaveLength(500);

    await runner.request('manual');
    expect(runner.state().name).toBe('idle');
    expect(server.rows).toHaveLength(1200);
    expect(new Set(server.rows.map((r) => r.event.id)).size).toBe(1200);
    expect(device.unsynced()).toEqual([]);
  });

  it('a crash between the push and marking synced resends, and the server keeps one copy', async () => {
    const events = [ev(1), ev(2), ev(3)];
    device.add(...events);
    device.markSyncedFailures = 1;

    await runner.request('manual');
    expect(runner.state()).toMatchObject({ name: 'error' });
    // The server has them; the device does not know it yet.
    expect(server.rows).toHaveLength(3);
    expect(device.unsynced()).toHaveLength(3);

    await runner.request('manual');
    expect(runner.state().name).toBe('idle');
    expect(server.rows).toHaveLength(3);
    expect(new Set(server.rows.map((r) => r.event.id)).size).toBe(3);
    expect(device.unsynced()).toEqual([]);
    const pushed = breadcrumbs().filter((c) => c.msg === 'backup.pushed');
    expect(pushed.at(-1)?.data).toEqual({ count: 3, accepted: 0, duplicates: 3 });
  });

  it('a crash between inserting a pulled page and storing its cursor re-pulls without doubling', async () => {
    for (let n = 0; n < 3; n++) server.rows.push({ user: 'user-a', event: ev(n, 'other-phone') });
    device.cursorWriteFailures = 1;

    await runner.request('manual');
    expect(runner.state()).toMatchObject({ name: 'error' });
    expect(device.local.size).toBe(3);
    expect(device.cursor).toBeNull();

    await runner.request('manual');
    expect(runner.state().name).toBe('idle');
    expect(device.local.size).toBe(3);
    // The second pull brought the same three: known, so not re-folded again.
    expect(device.refolded.flat()).toHaveLength(3);
  });

  it('a failed pull after a good push leaves the push done and retries only the pull', async () => {
    device.add(ev(1));
    server.pullFailures.push(networkError());
    await runner.request('manual');
    expect(runner.state()).toMatchObject({ name: 'error', attempt: 1 });
    expect(device.published).toEqual(['pushing', 'pulling', 'error']);
    expect(device.unsynced()).toEqual([]);
    expect(device.lastBackupAt).toBeNull();

    await device.advance(60_000);
    expect(runner.state().name).toBe('idle');
    expect(server.pushCalls).toEqual([1]);
  });

  it('a malformed-event rejection keeps every event local and unsynced', async () => {
    device.add(ev(1), ev(2));
    server.pushFailures.push(httpError('SERVER_BAD_INPUT', 400));
    await runner.request('manual');
    expect(runner.state()).toMatchObject({ name: 'error', reason: 'SERVER_BAD_INPUT' });
    expect(device.unsynced()).toHaveLength(2);
    expect(device.local.size).toBe(2);
  });

  it('a user change mid-run abandons it instead of mixing two accounts', async () => {
    device.add(ev(1));
    let release: () => void = () => {};
    server.gate = new Promise((resolve) => {
      release = resolve;
    });
    const run = runner.request('manual');
    await settle();
    device.user = 'user-b';
    release();
    await run;
    expect(runner.state()).toMatchObject({ name: 'error', reason: 'SYNC_USER_CHANGED' });
    expect(device.unsynced()).toHaveLength(1);
  });
});

describe('one run at a time', () => {
  it('a trigger during a run is queued, never concurrent, and runs once afterwards', async () => {
    device.add(ev(1));
    let release: () => void = () => {};
    server.gate = new Promise((resolve) => {
      release = resolve;
    });

    const first = runner.request('start');
    await settle();
    expect(runner.state().name).toBe('pushing');

    // A burst of triggers while the push is in flight.
    const others = [
      runner.request('manual'),
      runner.request('online'),
      runner.request('session-end'),
    ];
    await Promise.all(others);
    expect(server.pushCalls).toHaveLength(1);

    device.add(ev(2)); // recorded during the run
    server.gate = null;
    release();
    await first;

    expect(server.maxInFlight).toBe(1);
    // The run itself picked up ev(2) in its next batch; the queued follow-up found nothing new.
    expect(server.rows).toHaveLength(2);
    expect(server.pullCalls).toBe(2);
    expect(device.published).toEqual(['pushing', 'pulling', 'idle', 'pushing', 'pulling', 'idle']);
  });
});

describe('triggers', () => {
  it('an anonymous install is never backed up', async () => {
    device.user = null;
    device.add(ev(1));
    await runner.request('manual');
    expect(server.pushCalls).toEqual([]);
    expect(server.pullCalls).toBe(0);
  });

  it('the interval runs every 5 minutes', async () => {
    runner.startInterval();
    runner.startInterval(); // idempotent
    expect(device.timers).toHaveLength(1);
    await device.advance(BACKUP_INTERVAL_MS);
    expect(server.pullCalls).toBe(1);
    await device.advance(BACKUP_INTERVAL_MS);
    expect(server.pullCalls).toBe(2);
    runner.stop();
    await device.advance(BACKUP_INTERVAL_MS);
    expect(server.pullCalls).toBe(2);
  });

  it('breadcrumbs each trigger with its outcome', async () => {
    device.online = false;
    await runner.request('interval');
    device.online = true;
    device.user = null;
    await runner.request('manual');
    const outcomes = breadcrumbs()
      .filter((c) => c.msg === 'backup.trigger')
      .map((c) => c.data);
    expect(outcomes).toEqual([
      { trigger: 'interval', outcome: 'offline' },
      { trigger: 'manual', outcome: 'anonymous' },
    ]);
  });
});

describe('the outbox', () => {
  function row(s: number, kind: OutboxKind): OutboxRow {
    return { seq: s, kind, payload: { seq: s }, attempts: 0, createdAt: AT + s, lastError: null };
  }

  it('keeps every item whose route is not live yet, and says so', async () => {
    device.outbox = [row(1, 'flag'), row(2, 'beacon'), row(3, 'error'), row(4, 'beacon')];
    await runner.request('manual');
    expect(device.outbox).toHaveLength(4);
    expect(device.sent).toEqual([]);
    expect(runner.state().name).toBe('idle');
    const kept = breadcrumbs()
      .filter((c) => c.msg === 'backup.outbox.kept')
      .map((c) => c.data);
    expect(kept).toEqual(
      expect.arrayContaining([
        { kind: 'flag', count: 1, reason: 'route not live yet' },
        { kind: 'beacon', count: 2, reason: 'route not live yet' },
        { kind: 'error', count: 1, reason: 'route not live yet' },
      ]),
    );
  });

  it('deletes on 2xx, drops a non-429 4xx with a breadcrumb, keeps a 429 and stops', async () => {
    device.live = { flag: true, beacon: true, error: true };
    device.outbox = [row(1, 'flag'), row(2, 'beacon'), row(3, 'error'), row(4, 'flag')];
    device.sendFailures.set(2, httpError('SERVER_BAD_INPUT', 400));
    device.sendFailures.set(3, httpError('RATE_LIMITED', 429, { retryAfter: 60 }));

    await runner.request('manual');

    expect(device.sent.map((s) => (s.payload as { seq: number }).seq)).toEqual([1]);
    expect(device.outbox.map((r) => r.seq)).toEqual([3, 4]);
    expect(device.outbox[0]).toMatchObject({ attempts: 1, lastError: 'RATE_LIMITED' });
    expect(breadcrumbs().some((c) => c.msg === 'backup.outbox.dropped')).toBe(true);
    // The outbox never fails the progress backup.
    expect(runner.state().name).toBe('idle');
  });

  it('keeps items on a network failure or a 5xx', async () => {
    device.live = { flag: true, beacon: true, error: true };
    device.outbox = [row(1, 'error'), row(2, 'error')];
    device.sendFailures.set(1, networkError());
    await runner.request('manual');
    expect(device.outbox.map((r) => r.seq)).toEqual([1, 2]);

    device.sendFailures.set(1, httpError('HTTP_502', 502));
    await runner.request('manual');
    expect(device.outbox.map((r) => r.seq)).toEqual([1, 2]);
    expect(runner.state().name).toBe('idle');
  });
});
