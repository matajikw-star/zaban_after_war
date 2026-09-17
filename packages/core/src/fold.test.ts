import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DAY_MS, dayKey } from './day.ts';
import { fold, isConquered } from './fold.ts';
import { DEFAULT_PARAMS } from './params.ts';
import type { Fold, Grade, ReviewEvent, ReviewEventKind } from './types.ts';

const P = DEFAULT_PARAMS;
const MINUTE_MS = 60_000;
/** A Tehran midday, so the tests never sit on a day boundary by accident. */
const T0 = Date.UTC(2026, 2, 21, 8, 30, 0, 0);

let minted = 0;
function event(
  itemId: string,
  at: number,
  grade: Grade = 1,
  kind: ReviewEventKind = 'review',
  id?: string,
): ReviewEvent {
  minted += 1;
  return { id: id ?? `e${minted}`, itemId, at, kind, grade, device: 'dev-1' };
}

/** Maps compare structurally, but sorted entries make a failure readable. */
function snapshot(result: Fold): unknown {
  return {
    items: [...result.items.entries()].sort(([a], [b]) => (a < b ? -1 : 1)),
    byDay: [...result.byDay.entries()].sort(([a], [b]) => a - b),
    lastEventAt: result.lastEventAt,
  };
}

describe('fold — the empty log', () => {
  it('is an empty fold, not a throw', () => {
    const result = fold([], P);
    expect(result.items.size).toBe(0);
    expect(result.byDay.size).toBe(0);
    expect(result.lastEventAt).toBe(0);
  });
});

describe('fold — a single event of each kind', () => {
  it('puts a first remembered review in box 2, due one day later', () => {
    const result = fold([event('alpha', T0, 1)], P);
    const state = result.items.get('alpha');
    expect(state).toEqual({
      itemId: 'alpha',
      box: 2,
      highWaterBox: 2,
      lastReviewedAt: T0,
      dueAt: T0 + DAY_MS,
      reviewCount: 1,
      lapseCount: 0,
    });
    expect(result.lastEventAt).toBe(T0);
  });

  it('puts a first forgotten review in box 1 with a lapse, due ten minutes later', () => {
    const state = fold([event('alpha', T0, 0)], P).items.get('alpha');
    expect(state?.box).toBe(1);
    expect(state?.highWaterBox).toBe(1);
    expect(state?.lapseCount).toBe(1);
    expect(state?.dueAt).toBe(T0 + 10 * MINUTE_MS);
  });

  it('sends a know straight to box 5, due eight days later', () => {
    const state = fold([event('alpha', T0, 1, 'know')].slice(), P).items.get('alpha');
    expect(state?.box).toBe(5);
    expect(state?.highWaterBox).toBe(5);
    expect(state?.dueAt).toBe(T0 + 8 * DAY_MS);
    expect(isConquered(state as NonNullable<typeof state>)).toBe(true);
  });
});

describe('fold — promotion only when the interval has elapsed', () => {
  it('promotes a remembered card once its due time has passed', () => {
    const result = fold([event('alpha', T0, 1), event('alpha', T0 + DAY_MS, 1)], P);
    expect(result.items.get('alpha')?.box).toBe(3);
  });

  it('promotes exactly at the due instant, not a millisecond later', () => {
    const atDue = fold([event('alpha', T0, 1), event('alpha', T0 + DAY_MS, 1)], P);
    const oneEarly = fold([event('alpha', T0, 1), event('alpha', T0 + DAY_MS - 1, 1)], P);
    expect(atDue.items.get('alpha')?.box).toBe(3);
    expect(oneEarly.items.get('alpha')?.box).toBe(2);
  });

  it('leaves the box alone on an early correct answer, but pushes the due date out', () => {
    const early = T0 + 5 * MINUTE_MS;
    const state = fold([event('alpha', T0, 1), event('alpha', early, 1)], P).items.get('alpha');
    expect(state?.box).toBe(2);
    expect(state?.reviewCount).toBe(2);
    expect(state?.dueAt).toBe(early + DAY_MS);
  });

  it('reaches box 5 in exactly seven days along the fastest path', () => {
    const events = [
      event('alpha', T0, 1),
      event('alpha', T0 + DAY_MS, 1),
      event('alpha', T0 + 3 * DAY_MS, 1),
      event('alpha', T0 + 7 * DAY_MS, 1),
    ];
    const result = fold(events, P);
    expect(result.items.get('alpha')?.box).toBe(5);
    expect(dayKey(T0 + 7 * DAY_MS) - dayKey(T0)).toBe(7);
  });
});

describe('fold — forgetting', () => {
  it('drops a card to box 1 from anywhere and bumps the lapse count', () => {
    const events = [
      event('alpha', T0, 1),
      event('alpha', T0 + DAY_MS, 1),
      event('alpha', T0 + 3 * DAY_MS, 1),
      event('alpha', T0 + 4 * DAY_MS, 0),
    ];
    const state = fold(events, P).items.get('alpha');
    expect(state?.box).toBe(1);
    expect(state?.lapseCount).toBe(1);
    expect(state?.dueAt).toBe(T0 + 4 * DAY_MS + 10 * MINUTE_MS);
  });

  it('demotes even when the answer came early', () => {
    const state = fold([event('alpha', T0, 1), event('alpha', T0 + 1, 0)], P).items.get('alpha');
    expect(state?.box).toBe(1);
    expect(state?.lapseCount).toBe(1);
  });

  it('never lets the high-water box decrease', () => {
    const events = [
      event('alpha', T0, 1, 'know'),
      event('alpha', T0 + 8 * DAY_MS, 0),
      event('alpha', T0 + 8 * DAY_MS + MINUTE_MS, 0),
    ];
    const state = fold(events, P).items.get('alpha');
    expect(state?.box).toBe(1);
    expect(state?.highWaterBox).toBe(5);
    expect(state?.lapseCount).toBe(2);
    expect(isConquered(state as NonNullable<typeof state>)).toBe(true);
  });
});

describe('fold — duplicate ids', () => {
  it('ignores an event id it has already seen', () => {
    const once = event('alpha', T0, 1, 'review', 'dup');
    const twice = [once, { ...once }, { ...once }];
    const result = fold(twice, P);
    expect(result.items.get('alpha')?.reviewCount).toBe(1);
    expect(result.byDay.get(dayKey(T0))?.presentations).toBe(1);
  });
});

describe('fold — byDay', () => {
  it('counts presentations, correct answers, introductions and conquests per Tehran day', () => {
    const day2 = T0 + DAY_MS;
    const events = [
      event('alpha', T0, 1),
      event('beta', T0, 0),
      event('beta', T0 + 20 * MINUTE_MS, 1),
      event('alpha', day2, 1),
    ];
    const result = fold(events, P);
    expect(result.byDay.get(dayKey(T0))).toEqual({
      presentations: 3,
      correct: 2,
      conquered: 0,
      introduced: 2,
    });
    expect(result.byDay.get(dayKey(day2))).toEqual({
      presentations: 1,
      correct: 1,
      conquered: 0,
      introduced: 0,
    });
  });

  it('counts a conquest on the day the high-water box first reaches 5 through a review', () => {
    const conquestAt = T0 + 7 * DAY_MS;
    const events = [
      event('alpha', T0, 1),
      event('alpha', T0 + DAY_MS, 1),
      event('alpha', T0 + 3 * DAY_MS, 1),
      event('alpha', conquestAt, 1),
      // Answering it again later must not count a second conquest.
      event('alpha', conquestAt + 8 * DAY_MS, 1),
    ];
    const result = fold(events, P);
    expect(result.byDay.get(dayKey(conquestAt))?.conquered).toBe(1);
    expect(result.byDay.get(dayKey(conquestAt + 8 * DAY_MS))?.conquered).toBe(0);
  });

  it('does not count a know as a conquest, though it counts as a correct presentation', () => {
    const result = fold([event('alpha', T0, 1, 'know')], P);
    expect(result.byDay.get(dayKey(T0))).toEqual({
      presentations: 1,
      correct: 1,
      conquered: 0,
      introduced: 1,
    });
  });

  it('still counts no conquest when a review confirms a word that a know already sent to 5', () => {
    const events = [event('alpha', T0, 1, 'know'), event('alpha', T0 + 8 * DAY_MS, 1)];
    const result = fold(events, P);
    expect(result.byDay.get(dayKey(T0 + 8 * DAY_MS))?.conquered).toBe(0);
    expect(result.items.get('alpha')?.highWaterBox).toBe(5);
  });
});

describe('fold — order independence (property)', () => {
  const eventArb = fc
    .record({
      itemId: fc.constantFrom('alpha', 'beta', 'gamma'),
      offsetMinutes: fc.integer({ min: 0, max: 60 * 24 * 30 }),
      kind: fc.constantFrom<ReviewEventKind>('review', 'know'),
      grade: fc.constantFrom<Grade>(0, 1),
    })
    .map(({ itemId, offsetMinutes, kind, grade }) => ({
      itemId,
      at: T0 + offsetMinutes * MINUTE_MS,
      kind,
      grade,
    }));

  const logArb = fc.array(eventArb, { maxLength: 40 }).map((partials) =>
    partials.map(
      (partial, index): ReviewEvent => ({
        id: `p${index}`,
        device: 'dev-1',
        ...partial,
      }),
    ),
  );

  it('folds any permutation of the same log to the same Fold', () => {
    const permutationArb = logArb.chain((log) =>
      fc.tuple(
        fc.constant(log),
        fc.shuffledSubarray(log, { minLength: log.length, maxLength: log.length }),
      ),
    );
    fc.assert(
      fc.property(permutationArb, ([log, shuffled]) => {
        expect(snapshot(fold(shuffled, P))).toEqual(snapshot(fold(log, P)));
      }),
      { numRuns: 200 },
    );
  });

  it('folds a log with duplicated events to the same Fold as the log itself', () => {
    fc.assert(
      fc.property(logArb, (log) => {
        const doubled = [...log, ...log.map((e) => ({ ...e }))];
        expect(snapshot(fold(doubled, P))).toEqual(snapshot(fold(log, P)));
      }),
      { numRuns: 200 },
    );
  });

  it('does not mutate the array it is given', () => {
    const log = [event('beta', T0 + DAY_MS), event('alpha', T0)];
    const copy = [...log];
    fold(log, P);
    expect(log).toEqual(copy);
  });

  it('breaks ties on equal timestamps by event id, whichever order they arrive in', () => {
    const first = event('alpha', T0, 1, 'review', 'aaa');
    const second = event('alpha', T0, 0, 'review', 'bbb');
    const forwards = fold([first, second], P).items.get('alpha');
    const backwards = fold([second, first], P).items.get('alpha');
    expect(forwards).toEqual(backwards);
    // 'aaa' sorts first, so the forgot is applied last and the card sits in box 1.
    expect(forwards?.box).toBe(1);
  });
});
