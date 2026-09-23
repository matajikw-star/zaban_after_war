import { DEFAULT_PARAMS } from '@kl/core';
import { describe, expect, it } from 'vitest';
import { countPresentation } from './paywall-counter.ts';

const LIMIT = DEFAULT_PARAMS.freePresentationLimit;

describe('countPresentation', () => {
  it('counts a free user up by one and stays quiet below the limit', () => {
    expect(
      countPresentation({ count: 0, entitled: false, limit: LIMIT, shownThisSession: false }),
    ).toEqual({ count: 1, show: false });
  });

  it('shows the paywall on the presentation that reaches the limit', () => {
    expect(
      countPresentation({
        count: LIMIT - 1,
        entitled: false,
        limit: LIMIT,
        shownThisSession: false,
      }),
    ).toEqual({ count: LIMIT, show: true });
  });

  it('keeps counting past the limit but shows it only once per session', () => {
    expect(
      countPresentation({ count: LIMIT, entitled: false, limit: LIMIT, shownThisSession: true }),
    ).toEqual({ count: LIMIT + 1, show: false });
  });

  it('shows it again in a fresh session for a user who is still not entitled', () => {
    expect(
      countPresentation({
        count: LIMIT + 40,
        entitled: false,
        limit: LIMIT,
        shownThisSession: false,
      }),
    ).toEqual({ count: LIMIT + 41, show: true });
  });

  it('never counts or shows for an entitled user', () => {
    expect(
      countPresentation({ count: 7, entitled: true, limit: LIMIT, shownThisSession: false }),
    ).toEqual({ count: 7, show: false });
  });

  it('is disabled by a limit of zero, which is how config turns the paywall off', () => {
    expect(
      countPresentation({ count: 500, entitled: false, limit: 0, shownThisSession: false }),
    ).toEqual({ count: 501, show: false });
  });

  it('counts 100 presentations to exactly one paywall', () => {
    let count = 0;
    let shown = false;
    let shows = 0;
    for (let i = 0; i < 150; i += 1) {
      const result = countPresentation({
        count,
        entitled: false,
        limit: LIMIT,
        shownThisSession: shown,
      });
      count = result.count;
      if (result.show) {
        shows += 1;
        shown = true;
      }
    }

    expect(shows).toBe(1);
    expect(count).toBe(150);
  });
});
