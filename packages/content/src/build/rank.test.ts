import { describe, expect, it } from 'vitest';
import { assignRanks } from './rank.ts';

describe('assignRanks', () => {
  it('starts ranks at 1 on an empty file, ordered by priority desc', () => {
    const ranks = assignRanks({}, [
      { id: 'low', priority: 1, timesTested: 1, firstYear: 1400 },
      { id: 'high', priority: 10, timesTested: 1, firstYear: 1400 },
    ]);
    expect(ranks).toEqual({ high: 1, low: 2 });
  });

  it('never changes an existing rank', () => {
    const existing = { keep: 3 };
    const ranks = assignRanks(existing, [
      { id: 'keep', priority: 999, timesTested: 999, firstYear: 1405 },
      { id: 'new', priority: 1, timesTested: 1, firstYear: 1400 },
    ]);
    expect(ranks.keep).toBe(3);
    expect(ranks.new).toBe(4); // appended after the current max, not re-sorted in
  });

  it('breaks ties by timesTested desc, then firstYear desc, then id asc', () => {
    const ranks = assignRanks({}, [
      { id: 'b', priority: 5, timesTested: 2, firstYear: 1401 },
      { id: 'a', priority: 5, timesTested: 2, firstYear: 1402 },
      { id: 'c', priority: 5, timesTested: 1, firstYear: 1403 },
      { id: 'd', priority: 5, timesTested: 2, firstYear: 1402 },
    ]);
    // a and d tie on everything but id -> a before d.
    expect(ranks).toEqual({ a: 1, d: 2, b: 3, c: 4 });
  });

  it('treats a missing firstYear as lower than any real year', () => {
    const ranks = assignRanks({}, [
      { id: 'context-only', priority: 0, timesTested: 0, firstYear: null },
      { id: 'tested', priority: 0, timesTested: 0, firstYear: 1400 },
    ]);
    expect(ranks).toEqual({ tested: 1, 'context-only': 2 });
  });

  it('appends new ids after the current maximum, whatever gaps exist below it', () => {
    const ranks = assignRanks({ a: 1, b: 5 }, [
      { id: 'a', priority: 0, timesTested: 0, firstYear: null },
      { id: 'b', priority: 0, timesTested: 0, firstYear: null },
      { id: 'c', priority: 0, timesTested: 0, firstYear: null },
    ]);
    expect(ranks).toEqual({ a: 1, b: 5, c: 6 });
  });
});
