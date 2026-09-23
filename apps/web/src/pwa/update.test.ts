import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/dexie.ts';
import { kvGet } from '../db/repo.ts';
import { setClockForTests } from '../engine/clock.ts';
import { clearBreadcrumbs } from '../log/breadcrumbs.ts';
import { usePwaStore } from '../stores/pwa.ts';
import {
  applyUpdate,
  hasWaitingWorker,
  noteNeedRefresh,
  onRegistered,
  type RegistrationLike,
  resetUpdateStateForTests,
  setUpdateSwFn,
  transition,
  type UpdateEvent,
  type UpdateState,
  UPDATE_IDLE,
  updateState,
} from './update.ts';

beforeEach(async () => {
  await db.open();
  await db.kv.clear();
  clearBreadcrumbs();
  setClockForTests(() => 1_760_000_000_000);
  resetUpdateStateForTests();
  usePwaStore.setState({ updateReady: false, installPrompt: 'unavailable' });
});

afterEach(() => {
  setClockForTests(null);
});

const IDLE: UpdateState = { name: 'idle' };
const AVAILABLE: UpdateState = { name: 'available' };
const APPLYING: UpdateState = { name: 'applying' };

const NEED_REFRESH: UpdateEvent = { type: 'NEED_REFRESH' };
const APPLY: UpdateEvent = { type: 'APPLY' };
const RESET: UpdateEvent = { type: 'RESET' };

/** Every state × every event — the same table discipline as `sync/backup.test.ts`. */
const TABLE: ReadonlyArray<readonly [UpdateState, UpdateEvent, string]> = [
  [IDLE, NEED_REFRESH, 'available'],
  [IDLE, APPLY, 'idle'],
  [IDLE, RESET, 'idle'],

  [AVAILABLE, NEED_REFRESH, 'available'],
  [AVAILABLE, APPLY, 'applying'],
  [AVAILABLE, RESET, 'idle'],

  [APPLYING, NEED_REFRESH, 'applying'],
  [APPLYING, APPLY, 'applying'],
  [APPLYING, RESET, 'applying'],
];

describe('update transition table', () => {
  it.each(TABLE)('%o + %o → %s', (state, event, expected) => {
    expect(transition(state, event).name).toBe(expected);
  });

  it('is a no-op (same reference) when the event does not change the state', () => {
    expect(transition(IDLE, APPLY)).toBe(IDLE);
    expect(transition(APPLYING, NEED_REFRESH)).toBe(APPLYING);
  });

  it('starts idle', () => {
    expect(UPDATE_IDLE).toEqual(IDLE);
  });
});

describe('hasWaitingWorker', () => {
  it('is false for no registration', () => {
    expect(hasWaitingWorker(undefined)).toBe(false);
    expect(hasWaitingWorker(null)).toBe(false);
  });

  it('is false when nothing is waiting', () => {
    const registration: RegistrationLike = { waiting: null };
    expect(hasWaitingWorker(registration)).toBe(false);
  });

  it('is true when a worker is waiting', () => {
    const registration: RegistrationLike = { waiting: {} };
    expect(hasWaitingWorker(registration)).toBe(true);
  });
});

describe('noteNeedRefresh', () => {
  it('moves the machine to available, sets the store, and persists the kv flag', async () => {
    await noteNeedRefresh();

    expect(updateState()).toEqual(AVAILABLE);
    expect(usePwaStore.getState().updateReady).toBe(true);
    expect(await kvGet<boolean>('swUpdateAvailable')).toBe(true);
  });
});

describe('onRegistered — stale-flag clear on boot', () => {
  it('clears a stale flag when there is no waiting worker', async () => {
    await noteNeedRefresh(); // simulates the flag set by the previous session
    expect(await kvGet<boolean>('swUpdateAvailable')).toBe(true);

    resetUpdateStateForTests(); // a fresh cold start: the machine starts over at idle
    usePwaStore.setState({ updateReady: false, installPrompt: 'unavailable' });

    await onRegistered({ waiting: null });

    expect(await kvGet<boolean>('swUpdateAvailable')).toBe(false);
    expect(updateState()).toEqual(IDLE);
    expect(usePwaStore.getState().updateReady).toBe(false);
  });

  it('leaves the flag alone when a worker is already waiting', async () => {
    await noteNeedRefresh();

    await onRegistered({ waiting: {} });

    expect(await kvGet<boolean>('swUpdateAvailable')).toBe(true);
    expect(updateState()).toEqual(AVAILABLE);
  });

  it('is a no-op when there was nothing to clear', async () => {
    await onRegistered({ waiting: null });

    expect(await kvGet<boolean>('swUpdateAvailable')).toBeUndefined();
    expect(updateState()).toEqual(IDLE);
  });
});

describe('applyUpdate', () => {
  it('does nothing when no update is available', async () => {
    const calls: Array<boolean | undefined> = [];
    setUpdateSwFn(async (reload) => {
      calls.push(reload);
    });

    await applyUpdate();

    expect(calls).toHaveLength(0);
    expect(updateState()).toEqual(IDLE);
  });

  it('moves to applying, clears the kv flag, and reloads exactly once when the user taps', async () => {
    await noteNeedRefresh();
    const calls: Array<boolean | undefined> = [];
    setUpdateSwFn(async (reload) => {
      calls.push(reload);
    });

    await applyUpdate();

    expect(updateState()).toEqual(APPLYING);
    expect(usePwaStore.getState().updateReady).toBe(false);
    expect(await kvGet<boolean>('swUpdateAvailable')).toBe(false);
    expect(calls).toEqual([true]);
  });

  it('never reloads mid-session on its own — only a tap (a second APPLY) calls updateSW', async () => {
    await noteNeedRefresh();
    const calls: Array<boolean | undefined> = [];
    setUpdateSwFn(async (reload) => {
      calls.push(reload);
    });

    // Nothing else in the app calls updateSw; a stray NEED_REFRESH does not trigger a reload.
    await noteNeedRefresh();
    expect(calls).toHaveLength(0);

    await applyUpdate();
    expect(calls).toEqual([true]);

    // A second tap while already applying is a no-op: transition() returns the same state, so
    // applyUpdate's guard (`next.name !== 'applying'`) never re-fires — it only fires while
    // idle/available produce a state that is NOT 'applying'.
    await applyUpdate();
    expect(calls).toEqual([true]);
  });

  it('tolerates no updateSW function being set yet (defensive; register.ts always sets one)', async () => {
    await noteNeedRefresh();

    await expect(applyUpdate()).resolves.toBeUndefined();
    expect(updateState()).toEqual(APPLYING);
  });
});
