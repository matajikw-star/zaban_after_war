import { describe, expect, it } from 'vitest';
import { DAY_MS, dayKey, dayStart } from './day.ts';
import { fold } from './fold.ts';
import { DEFAULT_PARAMS } from './params.ts';
import { BOXES, boxCounts, dueCounts, introductionBudget, nextCard } from './queue.ts';
import type { ContentItem, Grade, Params, ReviewEvent } from './types.ts';

const P = DEFAULT_PARAMS;
const NOW = Date.UTC(2026, 2, 21, 8, 30, 0, 0);
const TODAY = dayKey(NOW);
const GOAL = 60; // floor = ceil(60/6) = 10, cap = 20

let minted = 0;
function review(itemId: string, at: number, grade: Grade = 1): ReviewEvent {
  minted += 1;
  return { id: `e${minted}`, itemId, at, kind: 'review', grade, device: 'dev-1' };
}

function know(itemId: string, at: number): ReviewEvent {
  minted += 1;
  return { id: `e${minted}`, itemId, at, kind: 'know', grade: 1, device: 'dev-1' };
}

function content(...ids: string[]): ContentItem[] {
  return ids.map((id, index) => ({ id, rank: index, weight: 1 }));
}

/** An rng that walks a fixed list, so every draw in a test is a stated choice. */
function scriptedRng(...values: number[]): () => number {
  let index = 0;
  return () => {
    const value = values[index] ?? (values[values.length - 1] as number);
    index += 1;
    return value;
  };
}

const never = (): number => {
  throw new Error('the rng must not be consulted for a deterministic pool');
};

describe('nextCard — pool order', () => {
  it('returns null only when there is no content at all', () => {
    expect(nextCard(fold([], P), [], [], NOW, GOAL, never, P)).toBeNull();
  });

  it('introduces the lowest-ranked unseen word when the due pool is thin', () => {
    const items = content('alpha', 'beta', 'gamma');
    const result = nextCard(fold([], P), items, [], NOW, GOAL, never, P);
    expect(result).toEqual({ itemId: 'alpha', source: 'new' });
  });

  it('introduces by rank, not by the order of the content array', () => {
    const items: ContentItem[] = [
      { id: 'zebra', rank: 7, weight: 1 },
      { id: 'apple', rank: 2, weight: 1 },
    ];
    expect(nextCard(fold([], P), items, [], NOW, GOAL, never, P)?.itemId).toBe('apple');
  });

  it('prefers a full due pool over introducing anything new', () => {
    const items = content(...Array.from({ length: 30 }, (_u, i) => `w${i}`));
    // Ten words answered wrong ten minutes ago: a due pool of exactly minDuePool.
    const events = Array.from({ length: 10 }, (_u, i) => review(`w${i}`, NOW - 20 * 60_000, 0));
    const result = nextCard(fold(events, P), items, [], NOW, GOAL, scriptedRng(0), P);
    expect(result?.source).toBe('due');
    const dueIds = Array.from({ length: 10 }, (_u, i) => `w${i}`);
    expect(dueIds).toContain(result?.itemId);
  });

  it('falls back to the due pool once the introduction budget is spent', () => {
    const items = content(...Array.from({ length: 40 }, (_u, i) => `w${i}`));
    // Ten introductions today (the floor for a goal of 60), one of them wrong and so due.
    const events = [
      ...Array.from({ length: 9 }, (_u, i) => review(`w${i}`, NOW - 60_000, 1)),
      review('w9', NOW - 20 * 60_000, 0),
    ];
    const result = nextCard(fold(events, P), items, [], NOW, GOAL, scriptedRng(0), P);
    expect(result).toEqual({ itemId: 'w9', source: 'due' });
  });

  it('serves a conquered word that has come due before any early card', () => {
    const items = content('alpha', 'beta');
    const events = [
      // alpha was marked known nine days ago, so its eight days have elapsed.
      know('alpha', NOW - 9 * DAY_MS),
      // beta is in box 2 and not due for another day.
      review('beta', NOW - 1000, 1),
    ];
    // The budget is spent by neither word being unseen, so pool 3 decides.
    const result = nextCard(fold(events, P), items, [], NOW, GOAL, never, P);
    expect(result).toEqual({ itemId: 'alpha', source: 'conquered' });
  });

  it('serves conquered words oldest-due first', () => {
    const items = content('alpha', 'beta');
    const events = [know('alpha', NOW - 9 * DAY_MS), know('beta', NOW - 12 * DAY_MS)];
    expect(nextCard(fold(events, P), items, [], NOW, GOAL, never, P)).toEqual({
      itemId: 'beta',
      source: 'conquered',
    });
  });

  it('falls back to the soonest-due early card, so the queue is never empty', () => {
    const items = content('alpha', 'beta');
    const events = [review('alpha', NOW - 1000, 1), review('beta', NOW - 2000, 1)];
    expect(nextCard(fold(events, P), items, [], NOW, GOAL, never, P)).toEqual({
      itemId: 'beta',
      source: 'early',
    });
  });

  it('breaks an early-pool tie on the item id, so the queue is deterministic', () => {
    const items = content('beta', 'alpha');
    const events = [review('alpha', NOW - 1000, 1), review('beta', NOW - 1000, 1)];
    expect(nextCard(fold(events, P), items, [], NOW, GOAL, never, P)).toEqual({
      itemId: 'alpha',
      source: 'early',
    });
  });

  it('ignores items the content package does not carry', () => {
    const events = [review('ghost', NOW - 10 * DAY_MS, 0)];
    expect(nextCard(fold(events, P), [], [], NOW, GOAL, never, P)).toBeNull();
  });
});

describe('nextCard — the weighted draw', () => {
  // Only the two words that are already seen, so the new pool cannot pre-empt the draw.
  const items = content('w0', 'w1');

  /** Two due cards, sorted by id: w0 in box 1 (ten days overdue), w1 in box 4 (one day). */
  function twoDueCards(): ReviewEvent[] {
    return [
      review('w0', NOW - 10 * DAY_MS - 10 * 60_000, 0),
      review('w1', NOW - 8 * DAY_MS, 1),
      review('w1', NOW - 7 * DAY_MS, 1),
      review('w1', NOW - 5 * DAY_MS, 1),
    ];
  }

  it('weights each word by its own overdue days, not by its box alone', () => {
    const state = fold(twoDueCards(), P);
    const w0 = state.items.get('w0');
    const w1 = state.items.get('w1');
    expect(w0?.box).toBe(1);
    expect(w1?.box).toBe(4);
    // w0: (1 + 10 days overdue) × 1.5 = 16.5 ; w1: (1 + 1 day overdue) × 1.0 = 2 → 18.5 total.
    const recent: string[] = [];
    const takesFirst = nextCard(state, items, recent, NOW, GOAL, scriptedRng(0.5), P);
    expect(takesFirst?.itemId).toBe('w0');
    const takesSecond = nextCard(state, items, recent, NOW, GOAL, scriptedRng(0.95), P);
    expect(takesSecond?.itemId).toBe('w1');
  });

  it('never falls off the end of the pool when the rng returns one', () => {
    const state = fold(twoDueCards(), P);
    const result = nextCard(state, items, [], NOW, GOAL, scriptedRng(1), P);
    expect(result?.itemId).toBe('w1');
    expect(result?.source).toBe('due');
  });
});

describe('nextCard — the suppression window', () => {
  // A content package of exactly the four seen words: nothing new is left to introduce, so the
  // due pool decides even though four is thinner than minDuePool.
  const items = content('w0', 'w1', 'w2', 'w3');

  /** Four due cards, all ten minutes overdue in box 1. */
  const events = Array.from({ length: 4 }, (_u, i) => review(`w${i}`, NOW - 20 * 60_000, 0));

  it('skips a card shown inside the window', () => {
    const state = fold(events, P);
    // w0, w1 and w2 were the last three cards shown; only w3 survives the window.
    const result = nextCard(state, items, ['w0', 'w1', 'w2'], NOW, GOAL, scriptedRng(0), P);
    expect(result).toEqual({ itemId: 'w3', source: 'due' });
  });

  it('plays the least-recently-shown card when the pool is smaller than the window', () => {
    const state = fold(events, P);
    // Every due card is inside the window of 8. The window is not switched off: the card shown
    // longest ago wins, which is the one deepest in `recent`.
    const recent = ['w3', 'w0', 'w2', 'w1', 'other', 'other2'];
    const result = nextCard(state, items, recent, NOW, GOAL, never, P);
    expect(result).toEqual({ itemId: 'w1', source: 'due' });
  });

  it('only remembers the last suppressionWindow ids', () => {
    const state = fold(events, P);
    // w0 sits at position 8, outside a window of 8, so it is drawable again.
    const recent = ['w1', 'w2', 'w3', 'a', 'b', 'c', 'd', 'e', 'w0'];
    const result = nextCard(state, items, recent, NOW, GOAL, scriptedRng(0), P);
    expect(result).toEqual({ itemId: 'w0', source: 'due' });
  });

  it('treats a card missing from recent as shown longest ago', () => {
    const state = fold(events, P);
    const tightWindow: Params = { ...P, suppressionWindow: 4 };
    // All four are inside the window; w3 is the only one not listed at all.
    const recent = ['w0', 'w1', 'w2', 'w3'];
    const shortened = recent.slice(0, 3);
    expect(nextCard(state, items, recent, NOW, GOAL, never, tightWindow)).toEqual({
      itemId: 'w3',
      source: 'due',
    });
    // With only three shown, w3 is not suppressed and the rng picks among the survivors.
    expect(nextCard(state, items, shortened, NOW, GOAL, scriptedRng(0), tightWindow)?.itemId).toBe(
      'w3',
    );
  });
});

describe('introductionBudget', () => {
  it('opens at the floor of ceil(goal / 6)', () => {
    const budget = introductionBudget(fold([], P), GOAL, NOW, P);
    expect(budget).toEqual({ floor: 10, cap: 20, budget: 10, introduced: 0, remaining: 10 });
  });

  it('never drops below the floor, so the first days are not dead', () => {
    expect(introductionBudget(fold([], P), 50, NOW, P).budget).toBe(9);
    expect(introductionBudget(fold([], P), 1, NOW, P).budget).toBe(1);
  });

  it('grows by one for each word conquered today', () => {
    const conquestAt = NOW - 60_000;
    const events = [
      review('alpha', conquestAt - 7 * DAY_MS, 1),
      review('alpha', conquestAt - 6 * DAY_MS, 1),
      review('alpha', conquestAt - 4 * DAY_MS, 1),
      review('alpha', conquestAt, 1),
    ];
    const state = fold(events, P);
    expect(state.byDay.get(TODAY)?.conquered).toBe(1);
    expect(introductionBudget(state, GOAL, NOW, P).budget).toBe(11);
  });

  it('caps at twice the floor however many words are conquered', () => {
    // Fifteen words conquered today would ask for 25; the cap holds it at 20.
    const events: ReviewEvent[] = [];
    for (let i = 0; i < 15; i += 1) {
      const id = `c${i}`;
      events.push(review(id, NOW - 8 * DAY_MS, 1));
      events.push(review(id, NOW - 7 * DAY_MS, 1));
      events.push(review(id, NOW - 5 * DAY_MS, 1));
      events.push(review(id, NOW - 60_000, 1));
    }
    const state = fold(events, P);
    expect(state.byDay.get(TODAY)?.conquered).toBe(15);
    const budget = introductionBudget(state, GOAL, NOW, P);
    expect(budget.budget).toBe(20);
    expect(budget.cap).toBe(20);
  });

  it('counts introductions against the budget and stops at zero remaining', () => {
    const events = Array.from({ length: 12 }, (_u, i) => review(`w${i}`, NOW - 60_000, 1));
    const budget = introductionBudget(fold(events, P), GOAL, NOW, P);
    expect(budget.introduced).toBe(12);
    expect(budget.remaining).toBe(0);
  });

  it('does not let a know raise the budget', () => {
    const events = Array.from({ length: 5 }, (_u, i) => know(`k${i}`, NOW - 60_000));
    const state = fold(events, P);
    expect(state.byDay.get(TODAY)?.conquered).toBe(0);
    expect(introductionBudget(state, GOAL, NOW, P).budget).toBe(10);
  });

  it('resets on the Tehran day boundary', () => {
    const yesterday = dayStart(TODAY) - 60_000;
    const events = Array.from({ length: 20 }, (_u, i) => review(`w${i}`, yesterday, 1));
    expect(introductionBudget(fold(events, P), GOAL, NOW, P).remaining).toBe(10);
  });

  it('stops introducing once the budget is spent, even with the due pool empty', () => {
    const items = content(...Array.from({ length: 40 }, (_u, i) => `w${i}`));
    const events = Array.from({ length: 10 }, (_u, i) => review(`w${i}`, NOW - 60_000, 1));
    const result = nextCard(fold(events, P), items, [], NOW, GOAL, never, P);
    expect(result?.source).toBe('early');
  });
});

describe('dueCounts and boxCounts', () => {
  it('counts what is waiting, per live box', () => {
    const events = [
      review('alpha', NOW - 20 * 60_000, 0), // box 1, due
      review('beta', NOW - 2 * DAY_MS, 1), // box 2, due
      review('gamma', NOW - 1000, 1), // box 2, not due
      know('delta', NOW - 9 * DAY_MS), // box 5, due
    ];
    const state = fold(events, P);
    expect(dueCounts(state, NOW)).toEqual({ 1: 1, 2: 1, 3: 0, 4: 0, 5: 1 });
  });

  it('counts the content by live box and reports what is still unseen', () => {
    const items = content('alpha', 'beta', 'gamma', 'delta');
    const events = [review('alpha', NOW - 20 * 60_000, 0), know('beta', NOW - DAY_MS)];
    expect(boxCounts(fold(events, P), items)).toEqual({
      byBox: { 1: 1, 2: 0, 3: 0, 4: 0, 5: 1 },
      unseen: 2,
    });
  });

  it('lists the five boxes in order for the screens that iterate them', () => {
    expect(BOXES).toEqual([1, 2, 3, 4, 5]);
  });
});
