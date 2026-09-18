import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setClockForTests } from '../engine/clock.ts';
import { clearBreadcrumbs } from '../log/breadcrumbs.ts';
import { type BackupEvent, type BackupState, backupBackoffMs, transition } from './backup.ts';

const AT = 1_760_000_000_000;

beforeEach(() => {
  setClockForTests(() => AT);
  clearBreadcrumbs();
});

afterEach(() => {
  setClockForTests(null);
  clearBreadcrumbs();
});

const IDLE: BackupState = { name: 'idle' };
const PUSHING: BackupState = { name: 'pushing' };
const PULLING: BackupState = { name: 'pulling' };
const ERROR: BackupState = { name: 'error', reason: 'NETWORK', attempt: 1, retryAt: AT + 60_000 };

const START: BackupEvent = { type: 'START' };
const PUSHED: BackupEvent = { type: 'PUSHED' };
const PULLED: BackupEvent = { type: 'PULLED' };
const FAILED: BackupEvent = { type: 'FAILED', reason: 'NETWORK', at: AT };
const RETRY: BackupEvent = { type: 'RETRY' };

/** Every state × every event. A blank cell would be a hole an agent has to guess at. */
const TABLE: ReadonlyArray<readonly [BackupState, BackupEvent, string]> = [
  [IDLE, START, 'pushing'],
  [IDLE, PUSHED, 'idle'],
  [IDLE, PULLED, 'idle'],
  [IDLE, FAILED, 'idle'],
  [IDLE, RETRY, 'idle'],

  [PUSHING, START, 'pushing'],
  [PUSHING, PUSHED, 'pulling'],
  [PUSHING, PULLED, 'pushing'],
  [PUSHING, FAILED, 'error'],
  [PUSHING, RETRY, 'pushing'],

  [PULLING, START, 'pulling'],
  [PULLING, PUSHED, 'pulling'],
  [PULLING, PULLED, 'idle'],
  [PULLING, FAILED, 'error'],
  [PULLING, RETRY, 'pulling'],

  [ERROR, START, 'pushing'],
  [ERROR, PUSHED, 'error'],
  [ERROR, PULLED, 'error'],
  [ERROR, FAILED, 'error'],
  [ERROR, RETRY, 'idle'],
];

describe('backup transition table', () => {
  it.each(TABLE)('%o + %o → %s', (state, event, expected) => {
    expect(transition(state, event).name).toBe(expected);
  });

  it('covers every state × event pair', () => {
    expect(TABLE).toHaveLength(4 * 5);
  });

  it('is pure: the state it is given is never mutated', () => {
    const state: BackupState = { name: 'pushing' };
    transition(state, FAILED);
    expect(state).toEqual({ name: 'pushing' });
  });
});

describe('backup error state', () => {
  it('records the reason and the first backoff', () => {
    const next = transition(PUSHING, FAILED);
    expect(next).toEqual({ name: 'error', reason: 'NETWORK', attempt: 1, retryAt: AT + 60_000 });
  });

  it('climbs the ladder on repeated failures and then stays hourly', () => {
    let state = transition(PUSHING, FAILED);
    expect(state).toMatchObject({ attempt: 1, retryAt: AT + 60_000 });

    state = transition(state, { type: 'FAILED', reason: 'HTTP_500', at: AT });
    expect(state).toMatchObject({ attempt: 2, retryAt: AT + 300_000 });

    state = transition(state, { type: 'FAILED', reason: 'HTTP_500', at: AT });
    expect(state).toMatchObject({ attempt: 3, retryAt: AT + 900_000 });

    state = transition(state, { type: 'FAILED', reason: 'HTTP_500', at: AT });
    expect(state).toMatchObject({ attempt: 4, retryAt: AT + 3_600_000 });

    state = transition(state, { type: 'FAILED', reason: 'HTTP_500', at: AT });
    expect(state).toMatchObject({ attempt: 5, retryAt: AT + 3_600_000 });
  });

  it('keeps the latest reason', () => {
    const first = transition(PUSHING, FAILED);
    const second = transition(first, { type: 'FAILED', reason: 'UNAUTHORIZED', at: AT });
    expect(second).toMatchObject({ reason: 'UNAUTHORIZED' });
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

describe('the happy path', () => {
  it('idle → pushing → pulling → idle', () => {
    const pushing = transition(IDLE, START);
    const pulling = transition(pushing, PUSHED);
    const done = transition(pulling, PULLED);

    expect([pushing.name, pulling.name, done.name]).toEqual(['pushing', 'pulling', 'idle']);
  });
});
