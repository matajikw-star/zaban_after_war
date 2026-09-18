/**
 * The backup state machine (`what.md` §7.4). The owner's word for sync is "backup".
 *
 * `idle → pushing → pulling → idle`, with `error` returning to `idle` after a backoff of
 * 1 min, 5 min, 15 min, then hourly. The transition function is pure and total — every state
 * takes every event and answers with a state — so the whole machine is a table in a test and
 * an agent reading a breadcrumb trail can replay it exactly.
 *
 * PHASE 4 wires `run()` to `net/api.ts` and `db/repo.ts`. The states and the transitions are
 * final now because the UI and the error snapshot both name them.
 */

import { breadcrumb } from '../log/breadcrumbs.ts';

export type BackupStateName = 'idle' | 'pushing' | 'pulling' | 'error';

export type BackupState =
  | { readonly name: 'idle' }
  | { readonly name: 'pushing' }
  | { readonly name: 'pulling' }
  | {
      readonly name: 'error';
      readonly reason: string;
      /** 1 for the first failure. Drives the backoff. */
      readonly attempt: number;
      /** Epoch ms after which a `RETRY` is due. */
      readonly retryAt: number;
    };

export type BackupEvent =
  | { readonly type: 'START' }
  | { readonly type: 'PUSHED' }
  | { readonly type: 'PULLED' }
  | { readonly type: 'FAILED'; readonly reason: string; readonly at: number }
  | { readonly type: 'RETRY' };

export const BACKUP_IDLE: BackupState = { name: 'idle' };

/** 1 min, 5 min, 15 min, then hourly forever (§7.4). */
const BACKOFF_LADDER_MS: readonly number[] = [60_000, 300_000, 900_000];
const BACKOFF_HOURLY_MS = 3_600_000;

export function backupBackoffMs(attempt: number): number {
  return BACKOFF_LADDER_MS[attempt - 1] ?? BACKOFF_HOURLY_MS;
}

/**
 * Pure and total. A `START` while already running is ignored rather than restarting the push:
 * the triggers in §7.4 (timer, `online`, session end, manual button) overlap by design, and the
 * push is not idempotent in the cheap sense — it would double the request, not the data.
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
          return { name: 'pushing' };
        // Nothing is in flight, so a completion or a failure is a stale message from a run that
        // has already been abandoned. Staying idle is the only safe answer.
        case 'PUSHED':
        case 'PULLED':
        case 'FAILED':
        case 'RETRY':
          return state;
      }
      break;

    case 'pushing':
      switch (event.type) {
        case 'PUSHED':
          return { name: 'pulling' };
        case 'FAILED':
          return failure(state, event.reason, event.at);
        case 'START':
        case 'PULLED':
        case 'RETRY':
          return state;
      }
      break;

    case 'pulling':
      switch (event.type) {
        case 'PULLED':
          return { name: 'idle' };
        case 'FAILED':
          return failure(state, event.reason, event.at);
        case 'START':
        case 'PUSHED':
        case 'RETRY':
          return state;
      }
      break;

    case 'error':
      switch (event.type) {
        case 'RETRY':
          return { name: 'idle' };
        // The manual button in settings deliberately jumps the backoff: a user who taps it is
        // watching, and making them wait an hour for a retry they asked for reads as broken.
        case 'START':
          return { name: 'pushing' };
        case 'FAILED':
          return failure(state, event.reason, event.at);
        case 'PUSHED':
        case 'PULLED':
          return state;
      }
      break;
  }
  return state;
}

function failure(state: BackupState, reason: string, at: number): BackupState {
  const attempt = state.name === 'error' ? state.attempt + 1 : 1;
  return { name: 'error', reason, attempt, retryAt: at + backupBackoffMs(attempt) };
}

/**
 * Not wired yet. Phase 4 fills this in: push `events where synced = 0` in batches of 500, drain
 * the outbox, then pull from the cursor and re-fold (§7.4).
 */
export async function run(): Promise<void> {
  breadcrumb('sync', 'backup.run', { status: 'not wired (Phase 4)' });
}
