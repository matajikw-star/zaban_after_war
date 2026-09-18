import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setClockForTests } from '../engine/clock.ts';
import { BREADCRUMB_LIMIT, breadcrumb, breadcrumbs, clearBreadcrumbs } from './breadcrumbs.ts';

beforeEach(() => {
  clearBreadcrumbs();
  setClockForTests(() => 1_760_000_000_000);
});

afterEach(() => {
  clearBreadcrumbs();
  setClockForTests(null);
});

describe('breadcrumbs', () => {
  it('records the type, the message and the clock', () => {
    breadcrumb('nav', '/review');

    expect(breadcrumbs()).toEqual([{ at: 1_760_000_000_000, type: 'nav', msg: '/review' }]);
  });

  it('omits `data` entirely when none was given', () => {
    breadcrumb('tap', 'reveal');

    expect(Object.hasOwn(breadcrumbs()[0] as object, 'data')).toBe(false);
  });

  it('keeps `data` when it was given', () => {
    breadcrumb('net', 'request', { method: 'GET', route: '/api/health', status: 200, ms: 12 });

    expect(breadcrumbs()[0]?.data).toEqual({
      method: 'GET',
      route: '/api/health',
      status: 200,
      ms: 12,
    });
  });

  it('caps the ring at 50 and drops the oldest', () => {
    for (let i = 0; i < BREADCRUMB_LIMIT + 25; i += 1) breadcrumb('log', `crumb-${i}`);

    const ring = breadcrumbs();
    expect(BREADCRUMB_LIMIT).toBe(50);
    expect(ring).toHaveLength(BREADCRUMB_LIMIT);
    expect(ring[0]?.msg).toBe('crumb-25');
    expect(ring[ring.length - 1]?.msg).toBe('crumb-74');
  });

  it('hands back a copy, so a caller cannot mutate the ring', () => {
    breadcrumb('log', 'one');

    // A fresh array each call: an error record holds a snapshot, not a live view that keeps
    // growing while the report is being assembled.
    expect(breadcrumbs()).not.toBe(breadcrumbs());
    expect(breadcrumbs()).toEqual(breadcrumbs());
  });
});
