import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setClockForTests } from '../engine/clock.ts';
import { clearBreadcrumbs } from '../log/breadcrumbs.ts';
import { type DownloadEvent, type DownloadState, transition } from './download.ts';

const AT = 1_760_000_000_000;

beforeEach(() => {
  setClockForTests(() => AT);
  clearBreadcrumbs();
});

afterEach(() => {
  setClockForTests(null);
  clearBreadcrumbs();
});

const NONE: DownloadState = { name: 'none' };
const CHECKING: DownloadState = { name: 'checking' };
const DOWNLOADING: DownloadState = {
  name: 'downloading',
  version: '2026-09-30.1',
  received: 0,
  total: 1000,
  percent: 0,
};
const VERIFYING: DownloadState = { name: 'verifying', version: '2026-09-30.1' };
const INSTALLED: DownloadState = { name: 'installed', version: '2026-09-30.1' };
const ERROR: DownloadState = { name: 'error', reason: 'NETWORK', attempt: 1, retryAt: AT + 60_000 };

const CHECK: DownloadEvent = { type: 'CHECK' };
const UP_TO_DATE: DownloadEvent = { type: 'UP_TO_DATE', version: '2026-09-30.1' };
const NEEDED: DownloadEvent = { type: 'NEEDED', version: '2026-10-01.1', bytes: 1000 };
const PROGRESS: DownloadEvent = { type: 'PROGRESS', received: 500 };
const COMPLETE: DownloadEvent = { type: 'COMPLETE' };
const VERIFIED: DownloadEvent = { type: 'VERIFIED' };
const FAILED: DownloadEvent = { type: 'FAILED', reason: 'NETWORK', at: AT };
const RETRY: DownloadEvent = { type: 'RETRY' };

/** Every state × every event — six states, eight events, forty-eight cells. */
const TABLE: ReadonlyArray<readonly [DownloadState, DownloadEvent, string]> = [
  [NONE, CHECK, 'checking'],
  [NONE, UP_TO_DATE, 'none'],
  [NONE, NEEDED, 'none'],
  [NONE, PROGRESS, 'none'],
  [NONE, COMPLETE, 'none'],
  [NONE, VERIFIED, 'none'],
  [NONE, FAILED, 'error'],
  [NONE, RETRY, 'none'],

  [CHECKING, CHECK, 'checking'],
  [CHECKING, UP_TO_DATE, 'installed'],
  [CHECKING, NEEDED, 'downloading'],
  [CHECKING, PROGRESS, 'checking'],
  [CHECKING, COMPLETE, 'checking'],
  [CHECKING, VERIFIED, 'checking'],
  [CHECKING, FAILED, 'error'],
  [CHECKING, RETRY, 'checking'],

  [DOWNLOADING, CHECK, 'downloading'],
  [DOWNLOADING, UP_TO_DATE, 'downloading'],
  [DOWNLOADING, NEEDED, 'downloading'],
  [DOWNLOADING, PROGRESS, 'downloading'],
  [DOWNLOADING, COMPLETE, 'verifying'],
  [DOWNLOADING, VERIFIED, 'downloading'],
  [DOWNLOADING, FAILED, 'error'],
  [DOWNLOADING, RETRY, 'downloading'],

  [VERIFYING, CHECK, 'verifying'],
  [VERIFYING, UP_TO_DATE, 'verifying'],
  [VERIFYING, NEEDED, 'verifying'],
  [VERIFYING, PROGRESS, 'verifying'],
  [VERIFYING, COMPLETE, 'verifying'],
  [VERIFYING, VERIFIED, 'installed'],
  [VERIFYING, FAILED, 'error'],
  [VERIFYING, RETRY, 'verifying'],

  [INSTALLED, CHECK, 'checking'],
  [INSTALLED, UP_TO_DATE, 'installed'],
  [INSTALLED, NEEDED, 'installed'],
  [INSTALLED, PROGRESS, 'installed'],
  [INSTALLED, COMPLETE, 'installed'],
  [INSTALLED, VERIFIED, 'installed'],
  [INSTALLED, FAILED, 'error'],
  [INSTALLED, RETRY, 'installed'],

  [ERROR, CHECK, 'checking'],
  [ERROR, UP_TO_DATE, 'error'],
  [ERROR, NEEDED, 'error'],
  [ERROR, PROGRESS, 'error'],
  [ERROR, COMPLETE, 'error'],
  [ERROR, VERIFIED, 'error'],
  [ERROR, FAILED, 'error'],
  [ERROR, RETRY, 'none'],
];

describe('download transition table', () => {
  it.each(TABLE)('%o + %o → %s', (state, event, expected) => {
    expect(transition(state, event).name).toBe(expected);
  });

  it('covers every state × event pair', () => {
    expect(TABLE).toHaveLength(6 * 8);
  });

  it('is pure: the state it is given is never mutated', () => {
    const state: DownloadState = { ...DOWNLOADING };
    transition(state, PROGRESS);
    expect(state).toEqual(DOWNLOADING);
  });
});

describe('download progress', () => {
  it('carries the version and the byte count into downloading', () => {
    expect(transition(CHECKING, NEEDED)).toEqual({
      name: 'downloading',
      version: '2026-10-01.1',
      received: 0,
      total: 1000,
      percent: 0,
    });
  });

  it('computes a rounded percentage', () => {
    expect(transition(DOWNLOADING, { type: 'PROGRESS', received: 500 })).toMatchObject({
      percent: 50,
    });
    expect(transition(DOWNLOADING, { type: 'PROGRESS', received: 634 })).toMatchObject({
      percent: 63,
    });
  });

  it('clamps a byte count outside the declared total', () => {
    expect(transition(DOWNLOADING, { type: 'PROGRESS', received: 5000 })).toMatchObject({
      percent: 100,
    });
    expect(transition(DOWNLOADING, { type: 'PROGRESS', received: -1 })).toMatchObject({
      percent: 0,
    });
  });

  it('reports 0 % when the server declared no length', () => {
    const unknownLength: DownloadState = { ...DOWNLOADING, total: 0 };
    expect(transition(unknownLength, PROGRESS)).toMatchObject({ percent: 0 });
  });

  it('keeps the version through verification to installation', () => {
    const downloading = transition(CHECKING, NEEDED);
    const verifying = transition(downloading, COMPLETE);
    const installed = transition(verifying, VERIFIED);

    expect(verifying).toEqual({ name: 'verifying', version: '2026-10-01.1' });
    expect(installed).toEqual({ name: 'installed', version: '2026-10-01.1' });
  });
});

describe('download error state', () => {
  it('uses the backup backoff ladder', () => {
    let state = transition(DOWNLOADING, FAILED);
    expect(state).toMatchObject({ attempt: 1, retryAt: AT + 60_000 });

    state = transition(state, { type: 'FAILED', reason: 'HASH_MISMATCH', at: AT });
    expect(state).toMatchObject({ attempt: 2, reason: 'HASH_MISMATCH', retryAt: AT + 300_000 });
  });

  it('a hash mismatch during verification discards and goes back to the top', () => {
    const failed = transition(VERIFYING, { type: 'FAILED', reason: 'HASH_MISMATCH', at: AT });
    expect(transition(failed, RETRY)).toEqual({ name: 'none' });
  });
});
