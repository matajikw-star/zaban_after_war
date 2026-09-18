import type { ReviewEvent } from '@kl/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/dexie.ts';
import { eventCount } from '../db/repo.ts';
import { useAuthStore } from '../stores/auth.ts';
import { setClockForTests } from './clock.ts';
import {
  appendToFold,
  cachedEvents,
  currentFold,
  loadEvents,
  resetFoldCache,
  subscribeToFold,
} from './fold-cache.ts';
import { recordReview } from './index.ts';

function event(id: string, itemId: string, at: number, grade: 0 | 1 = 1): ReviewEvent {
  return { id, itemId, at, kind: 'review', grade, device: 'device-1' };
}

const T0 = 1_760_000_000_000;

beforeEach(async () => {
  await db.open();
  await db.events.clear();
  resetFoldCache();
  setClockForTests(() => T0);
  useAuthStore.setState({ installId: 'device-1' });
});

afterEach(async () => {
  setClockForTests(null);
  resetFoldCache();
  await db.events.clear();
});

describe('fold cache', () => {
  it('starts empty', () => {
    expect(currentFold().items.size).toBe(0);
    expect(currentFold().lastEventAt).toBe(0);
  });

  it('loadEvents replaces the whole log', () => {
    loadEvents([event('a', 'abandon', T0)]);
    expect(currentFold().items.size).toBe(1);

    loadEvents([event('b', 'bear', T0), event('c', 'acquire', T0)]);
    expect(currentFold().items.size).toBe(2);
    expect(currentFold().items.has('abandon')).toBe(false);
  });

  it('appendToFold re-folds rather than patching state', () => {
    loadEvents([event('a', 'abandon', T0)]);
    expect(currentFold().items.get('abandon')?.box).toBe(2);

    // A second correct answer before the interval has elapsed must not promote (§5.2). Only a
    // genuine re-fold of the whole log gets this right; an incremental patch would not.
    appendToFold(event('b', 'abandon', T0 + 1000));

    const state = currentFold().items.get('abandon');
    expect(state?.box).toBe(2);
    expect(state?.reviewCount).toBe(2);
    expect(cachedEvents()).toHaveLength(2);
  });

  it('notifies subscribers on every re-fold and stops after unsubscribe', () => {
    const seen: number[] = [];
    const unsubscribe = subscribeToFold((next) => seen.push(next.items.size));

    loadEvents([event('a', 'abandon', T0)]);
    appendToFold(event('b', 'bear', T0 + 1000));
    unsubscribe();
    appendToFold(event('c', 'acquire', T0 + 2000));

    expect(seen).toEqual([1, 2]);
  });
});

describe('recordReview', () => {
  it('appends to the log and re-folds in one call', async () => {
    loadEvents([]);

    const recorded = await recordReview('abandon', 'review', 1);

    expect(recorded.itemId).toBe('abandon');
    expect(recorded.at).toBe(T0);
    expect(recorded.device).toBe('device-1');
    expect(await eventCount()).toBe(1);
    expect(currentFold().items.get('abandon')?.box).toBe(2);
    expect(currentFold().lastEventAt).toBe(T0);
  });

  it('forces grade 1 on a `know` and sends the word straight to box 5', async () => {
    loadEvents([]);

    const recorded = await recordReview('bear', 'know', 0);

    expect(recorded.grade).toBe(1);
    expect(currentFold().items.get('bear')?.box).toBe(5);
    expect(currentFold().items.get('bear')?.highWaterBox).toBe(5);
  });

  it('a forgot drops the box back to 1 on the next fold', async () => {
    loadEvents([event('a', 'abandon', T0 - 1000)]);
    expect(currentFold().items.get('abandon')?.box).toBe(2);

    await recordReview('abandon', 'review', 0);

    const state = currentFold().items.get('abandon');
    expect(state?.box).toBe(1);
    expect(state?.lapseCount).toBe(1);
    // High water never decreases: progress does not go backwards (§5.2).
    expect(state?.highWaterBox).toBe(2);
  });
});
