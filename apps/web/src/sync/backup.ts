/**
 * The backup state machine and its runner (`what.md` §7.4). The owner's word for sync is "backup";
 * the mechanism is ADR-0002's event-log union.
 *
 * `idle → pushing → pulling → idle`. A failure goes to `error`, which waits out a backoff of
 * 1 min, 5 min, 15 min, then hourly, and leaves by the next `START` — a retry is a run that starts
 * from `error`, so the count of consecutive failures (and with it the ladder) survives it. The transition function is pure and total — every state
 * takes every event and answers with a state — so the whole machine is a table in a test and
 * an agent reading a breadcrumb trail can replay it exactly.
 *
 * `createBackupRunner(deps)` performs a run: push every `synced = 0` event in batches of 500,
 * drain the outbox, then pull from the cursor and hand new events to the fold. Every effect — the
 * database, the network, the clock, the timers — is a dependency, so `backup.test.ts` drives it
 * with a fake server and a fake clock. `backup-live.ts` binds the real ones and the triggers.
 *
 * An anonymous install (`deps.userId()` is null) skips push/pull entirely — there is no account
 * to key the review-event log by — but still drains the outbox: flags, beacons and error reports
 * are keyed on installId alone and the server accepts them without a login (ticket dev-server/04,
 * §19). That drain never touches the `idle → pushing → pulling → idle` machine.
 *
 * Why a run can never lose or double an event:
 * - An event is marked `synced` only after the server has answered for every id in its batch.
 *   A crash in between leaves it unsynced; the next push re-sends it and the server insert-ignores
 *   it by id (ADR-0002), so the retry costs bandwidth, never a duplicate.
 * - The pull cursor is stored only after the page it ends is in the database. A crash in between
 *   re-pulls that page, and `insertPulled` ignores the ids it already has.
 * - The cursor is kept per user, so a different account on this device starts from the beginning.
 * - Only one run is ever in flight: a trigger during a run is remembered and runs once after it.
 */

import type { ReviewEvent } from '@kl/core';
import type { OutboxKind, OutboxRow } from '../db/dexie.ts';
import { AppError, toAppError } from '../errors.ts';
import { breadcrumb } from '../log/breadcrumbs.ts';
import type { SyncPullResponse, SyncPushResponse } from '../net/api.ts';

export type BackupStateName = 'idle' | 'pushing' | 'pulling' | 'error';

export type BackupState =
  | { readonly name: 'idle' }
  /** `failures`: consecutive failed runs before this one — 0 unless it is a retry. */
  | { readonly name: 'pushing'; readonly failures: number }
  | { readonly name: 'pulling'; readonly failures: number }
  | {
      readonly name: 'error';
      /** An `AppError` code: `NETWORK`, `RATE_LIMITED`, `UNAUTHORIZED`, `SERVER_BAD_INPUT`, … */
      readonly reason: string;
      /** 1 for the first failure. Drives the backoff. */
      readonly attempt: number;
      /** Epoch ms before which only a trigger that jumps the backoff may start a run. */
      readonly retryAt: number;
    };

export type BackupEvent =
  | { readonly type: 'START' }
  | { readonly type: 'PUSHED' }
  | { readonly type: 'PULLED' }
  | {
      readonly type: 'FAILED';
      readonly reason: string;
      readonly at: number;
      /** A 429's `retryAfter`, in ms. The wait is the longer of this and the ladder's step. */
      readonly retryAfterMs?: number;
    };

export const BACKUP_IDLE: BackupState = { name: 'idle' };

/** 1 min, 5 min, 15 min, then hourly forever (§7.4). */
const BACKOFF_LADDER_MS: readonly number[] = [60_000, 300_000, 900_000];
const BACKOFF_HOURLY_MS = 3_600_000;

export function backupBackoffMs(attempt: number): number {
  return BACKOFF_LADDER_MS[attempt - 1] ?? BACKOFF_HOURLY_MS;
}

/**
 * Pure and total. A `START` while already running is ignored rather than restarting the push:
 * the triggers in §7.4 (timer, `online`, session end, manual button) overlap by design. The
 * runner remembers such a trigger and runs once more afterwards.
 */
export function transition(state: BackupState, event: BackupEvent): BackupState {
  const next = compute(state, event);
  if (next !== state) {
    breadcrumb('sync', 'backup.transition', { from: state.name, event: event.type, to: next.name });
  }
  return next;
}

function compute(state: BackupState, event: BackupEvent): BackupState {
  switch (state.name) {
    case 'idle':
      switch (event.type) {
        case 'START':
          return { name: 'pushing', failures: 0 };
        // Nothing is in flight, so a completion or a failure is a stale message from a run that
        // has already been abandoned. Staying idle is the only safe answer.
        case 'PUSHED':
        case 'PULLED':
        case 'FAILED':
          return state;
      }
      break;

    case 'pushing':
      switch (event.type) {
        case 'PUSHED':
          return { name: 'pulling', failures: state.failures };
        case 'FAILED':
          return failure(state.failures, event);
        case 'START':
        case 'PULLED':
          return state;
      }
      break;

    case 'pulling':
      switch (event.type) {
        case 'PULLED':
          return BACKUP_IDLE;
        case 'FAILED':
          return failure(state.failures, event);
        case 'START':
        case 'PUSHED':
          return state;
      }
      break;

    case 'error':
      switch (event.type) {
        // A retry. Whether a START may come before `retryAt` is the runner's gate (`mayRunNow`):
        // the manual button in settings deliberately jumps the backoff, because a user who taps
        // it is watching and an hour's wait for a retry they asked for reads as broken.
        case 'START':
          return { name: 'pushing', failures: state.attempt };
        // A stray failure while nothing runs still counts: the ladder only ever climbs.
        case 'FAILED':
          return failure(state.attempt, event);
        case 'PUSHED':
        case 'PULLED':
          return state;
      }
      break;
  }
  return state;
}

function failure(
  previousFailures: number,
  event: { readonly reason: string; readonly at: number; readonly retryAfterMs?: number },
): BackupState {
  const attempt = previousFailures + 1;
  const wait = Math.max(backupBackoffMs(attempt), event.retryAfterMs ?? 0);
  return { name: 'error', reason: event.reason, attempt, retryAt: event.at + wait };
}

// ============================================================================ the runner

/** §7.4's triggers, plus the runner's own retry timer. Each is a breadcrumb. */
export type BackupTrigger =
  | 'start'
  | 'online'
  | 'session-end'
  | 'interval'
  | 'login'
  | 'manual'
  | 'retry';

/** `kv.syncCursor`. Keyed by user: another account on this device must pull from the start. */
export interface SyncCursor {
  readonly userId: string;
  readonly cursor: string;
}

export type TimerHandle = unknown;

export interface BackupDeps {
  readonly now: () => number;
  readonly isOnline: () => boolean;
  /**
   * The logged-in user, or null. An anonymous install's review-event log is never backed up
   * (§7.4) — that needs an account to key the log by — but its outbox still drains (ticket
   * dev-server/04, §19).
   */
  readonly userId: () => string | null;

  readonly unsyncedEvents: (limit: number) => Promise<ReviewEvent[]>;
  readonly markSynced: (ids: readonly string[]) => Promise<void>;
  readonly unsyncedCount: () => Promise<number>;
  /** Inserts what the device lacks; returns exactly those events. */
  readonly insertPulled: (events: readonly ReviewEvent[]) => Promise<ReviewEvent[]>;
  /** Re-fold with events this device did not have (§7.4: "a pull that brings new events"). */
  readonly onNewEvents: (fresh: readonly ReviewEvent[]) => void;
  readonly readCursor: () => Promise<SyncCursor | null>;
  readonly writeCursor: (cursor: SyncCursor) => Promise<void>;
  readonly writeLastBackupAt: (at: number) => Promise<void>;

  readonly outboxAll: (limit: number) => Promise<OutboxRow[]>;
  readonly outboxDelete: (seq: number) => Promise<void>;
  readonly outboxRecordFailure: (seq: number, reason: string) => Promise<void>;
  /** Whether the server route for this outbox kind exists yet (ticket dev-server/04). */
  readonly outboxRouteLive: (kind: OutboxKind) => boolean;
  readonly sendOutbox: (kind: OutboxKind, payload: unknown) => Promise<unknown>;

  readonly push: (events: readonly ReviewEvent[]) => Promise<SyncPushResponse>;
  readonly pull: (since: string | null, limit: number) => Promise<SyncPullResponse>;

  /** Mirror for the UI (`stores/sync.ts`). */
  readonly publishState: (state: BackupState) => void;
  readonly publishUnsyncedCount: (count: number) => void;
  readonly publishLastBackupAt: (at: number) => void;
  /** One `client_errors` record of kind `sync` (§7.4: after ≥ 5 failures). */
  readonly reportError: (err: unknown, data: unknown) => void;

  readonly setTimer: (fn: () => void, ms: number) => TimerHandle;
  readonly clearTimer: (handle: TimerHandle) => void;
}

export const PUSH_BATCH = 500;
export const PULL_PAGE = 500;
export const OUTBOX_BATCH = 100;
/** §7.4: "every 5 minutes while the app is open". */
export const BACKUP_INTERVAL_MS = 5 * 60_000;
/** §7.4: "repeated failures (≥ 5) log one `client_errors` record". */
export const REPORT_AT_ATTEMPT = 5;

export interface BackupRunner {
  /** Ask for a run. Resolves when that run (and any follow-up it queued) has finished. */
  request: (trigger: BackupTrigger) => Promise<void>;
  /** Arms the 5-minute interval. */
  startInterval: () => void;
  /** Clears every timer. */
  stop: () => void;
  state: () => BackupState;
}

/**
 * The gate. Off the backoff, anything runs. On it, only a trigger that means "something changed"
 * jumps the wait: the user tapping the button, the device coming back online, a fresh login.
 * A 429 is the server asking for time, so nothing jumps it; a 401 will not heal by retrying, so
 * only a new login (or the user's own tap) tries again.
 */
export function mayRunNow(state: BackupState, trigger: BackupTrigger, at: number): boolean {
  if (state.name !== 'error') return true;
  if (state.reason === 'RATE_LIMITED') return at >= state.retryAt;
  if (state.reason === 'UNAUTHORIZED') return trigger === 'login' || trigger === 'manual';
  if (at >= state.retryAt) return true;
  return trigger === 'manual' || trigger === 'online' || trigger === 'login';
}

function sameIds(a: ReadonlySet<string>, batch: readonly ReviewEvent[]): boolean {
  return batch.every((event) => a.has(event.id));
}

function statusOf(err: AppError): number {
  const data = err.data as { status?: unknown } | undefined;
  return typeof data?.status === 'number' ? data.status : 0;
}

function retryAfterMsOf(err: AppError): number | undefined {
  const data = err.data as { retryAfter?: unknown } | undefined;
  return typeof data?.retryAfter === 'number' ? data.retryAfter * 1000 : undefined;
}

export function createBackupRunner(deps: BackupDeps): BackupRunner {
  let state: BackupState = BACKUP_IDLE;
  let running = false;
  /** A trigger that arrived during a run; the latest one wins. */
  let queued: BackupTrigger | null = null;
  let retryTimer: TimerHandle | null = null;
  let intervalTimer: TimerHandle | null = null;

  function dispatch(event: BackupEvent): void {
    state = transition(state, event);
    deps.publishState(state);
  }

  function assertSameUser(userId: string): void {
    if (deps.userId() !== userId) {
      throw new AppError('SYNC_USER_CHANGED', 'the logged-in user changed during a backup run');
    }
  }

  async function pushAll(userId: string): Promise<void> {
    const pushed = new Set<string>();
    for (;;) {
      const batch = await deps.unsyncedEvents(PUSH_BATCH);
      if (batch.length === 0) return;
      // markSynced ran but the same ids came back: looping would push forever.
      if (sameIds(pushed, batch)) {
        throw new AppError('SYNC_NO_PROGRESS', 'the push queue did not shrink', {
          count: batch.length,
        });
      }

      const response = await deps.push(batch);
      assertSameUser(userId);
      // The server must have answered for every id, or marking them synced could hide an event
      // it never stored.
      if (response.accepted + response.duplicates !== batch.length) {
        throw new AppError('SYNC_PUSH_MISMATCH', 'the server did not account for every event', {
          sent: batch.length,
          accepted: response.accepted,
          duplicates: response.duplicates,
        });
      }
      await deps.markSynced(batch.map((event) => event.id));
      for (const event of batch) pushed.add(event.id);
      breadcrumb('sync', 'backup.pushed', {
        count: batch.length,
        accepted: response.accepted,
        duplicates: response.duplicates,
      });
    }
  }

  /**
   * Never fails the run: flags, beacons and error reports must not hold the progress backup
   * hostage. A 2xx deletes; a non-429 4xx drops with a breadcrumb (the record is malformed and
   * retrying will not help); anything transient stops the drain until the next run.
   */
  async function drainOutbox(): Promise<void> {
    const rows = await deps.outboxAll(OUTBOX_BATCH);
    const kept: Partial<Record<OutboxKind, number>> = {};

    for (const row of rows) {
      const seq = row.seq;
      if (seq === undefined) continue;

      if (!deps.outboxRouteLive(row.kind)) {
        kept[row.kind] = (kept[row.kind] ?? 0) + 1;
        continue;
      }

      try {
        await deps.sendOutbox(row.kind, row.payload);
        await deps.outboxDelete(seq);
      } catch (err) {
        const error = toAppError(err, 'OUTBOX_SEND_FAILED');
        const status = statusOf(error);
        if (status >= 400 && status < 500 && status !== 429 && status !== 401) {
          await deps.outboxDelete(seq);
          breadcrumb('sync', 'backup.outbox.dropped', { kind: row.kind, seq, code: error.code });
          continue;
        }
        await deps.outboxRecordFailure(seq, error.code);
        breadcrumb('sync', 'backup.outbox.deferred', { kind: row.kind, seq, code: error.code });
        return;
      }
    }

    for (const kind of Object.keys(kept) as OutboxKind[]) {
      breadcrumb('sync', 'backup.outbox.kept', {
        kind,
        count: kept[kind],
        reason: 'route not live yet',
      });
    }
  }

  async function pullAll(userId: string): Promise<void> {
    const stored = await deps.readCursor();
    let since = stored !== null && stored.userId === userId ? stored.cursor : null;
    let received = 0;
    let inserted = 0;

    for (;;) {
      const page = await deps.pull(since, PULL_PAGE);
      assertSameUser(userId);

      const fresh = await deps.insertPulled(page.events);
      received += page.events.length;
      inserted += fresh.length;
      if (fresh.length > 0) deps.onNewEvents(fresh);

      const advanced = page.cursor !== '' && page.cursor !== since;
      if (advanced) {
        since = page.cursor;
        await deps.writeCursor({ userId, cursor: page.cursor });
      }
      if (!page.more) break;
      // `more` with a cursor that did not move would loop forever on the same page.
      if (!advanced || page.events.length === 0) {
        throw new AppError('SYNC_PULL_STALLED', 'the pull cursor did not advance', {
          events: page.events.length,
        });
      }
    }
    breadcrumb('sync', 'backup.pulled', { received, inserted });
  }

  function scheduleRetry(): void {
    if (retryTimer !== null) deps.clearTimer(retryTimer);
    retryTimer = null;
    if (state.name !== 'error' || state.reason === 'UNAUTHORIZED') return;
    const wait = Math.max(0, state.retryAt - deps.now());
    retryTimer = deps.setTimer(() => {
      retryTimer = null;
      void request('retry');
    }, wait);
  }

  async function refreshUnsynced(): Promise<void> {
    try {
      deps.publishUnsyncedCount(await deps.unsyncedCount());
    } catch (err) {
      breadcrumb('sync', 'backup.unsyncedCount.failed', { error: String(err) });
    }
  }

  async function runOnce(userId: string): Promise<void> {
    dispatch({ type: 'START' });
    try {
      await pushAll(userId);
      await drainOutbox();
      dispatch({ type: 'PUSHED' });
      await pullAll(userId);
      const at = deps.now();
      await deps.writeLastBackupAt(at);
      deps.publishLastBackupAt(at);
      dispatch({ type: 'PULLED' });
      if (retryTimer !== null) deps.clearTimer(retryTimer);
      retryTimer = null;
    } catch (err) {
      const error = toAppError(err, 'SYNC_FAILED');
      const retryAfterMs = retryAfterMsOf(error);
      dispatch({
        type: 'FAILED',
        reason: error.code,
        at: deps.now(),
        ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
      });
      breadcrumb('sync', 'backup.failed', { code: error.code, status: statusOf(error) });
      if (state.name === 'error' && state.attempt === REPORT_AT_ATTEMPT) {
        deps.reportError(error, { attempt: state.attempt, reason: state.reason });
      }
      scheduleRetry();
    } finally {
      await refreshUnsynced();
    }
  }

  /**
   * Ticket dev-server/04, what.md §19: an anonymous install has no review-event log to back up —
   * that still requires a login — but its outbox (flags, beacons, error reports) is keyed on
   * installId alone and the routes accept it, so there is no reason to leave those queued until
   * whenever the user eventually logs in. This never touches `state`/`dispatch`: the
   * `idle → pushing → pulling → idle` machine is about the review-event log, and an anonymous
   * drain has none of that to report.
   */
  async function drainAnonymousOutbox(): Promise<void> {
    running = true;
    try {
      await drainOutbox();
    } finally {
      running = false;
    }
    const next = queued;
    queued = null;
    if (next !== null) await request(next);
  }

  async function request(trigger: BackupTrigger): Promise<void> {
    if (running) {
      queued = trigger;
      breadcrumb('sync', 'backup.trigger', { trigger, outcome: 'queued' });
      return;
    }
    const userId = deps.userId();
    if (userId === null) {
      breadcrumb('sync', 'backup.trigger', { trigger, outcome: 'anonymous' });
      if (deps.isOnline()) await drainAnonymousOutbox();
      return;
    }
    if (!deps.isOnline()) {
      breadcrumb('sync', 'backup.trigger', { trigger, outcome: 'offline' });
      await refreshUnsynced();
      return;
    }
    if (!mayRunNow(state, trigger, deps.now())) {
      breadcrumb('sync', 'backup.trigger', { trigger, outcome: 'backoff' });
      return;
    }

    breadcrumb('sync', 'backup.trigger', { trigger, outcome: 'run' });
    running = true;
    try {
      await runOnce(userId);
    } finally {
      running = false;
    }

    const next = queued;
    queued = null;
    if (next !== null) await request(next);
  }

  function armInterval(): void {
    intervalTimer = deps.setTimer(() => {
      armInterval();
      void request('interval');
    }, BACKUP_INTERVAL_MS);
  }

  return {
    request,
    startInterval: () => {
      if (intervalTimer !== null) return;
      armInterval();
    },
    stop: () => {
      if (retryTimer !== null) deps.clearTimer(retryTimer);
      if (intervalTimer !== null) deps.clearTimer(intervalTimer);
      retryTimer = null;
      intervalTimer = null;
    },
    state: () => state,
  };
}
