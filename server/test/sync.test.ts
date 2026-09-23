// POST /api/sync/push and GET /api/sync/pull against a real PocketBase (what.md §8.2, §15; ticket
// dev-server/03). Losing or duplicating an event corrupts a user's progress, so every property the
// client relies on is asserted here over HTTP: idempotency, stable paging, isolation.

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Server, startServer } from './harness.ts';

let server: Server;

beforeAll(async () => {
  server = await startServer();
});

afterAll(async () => {
  await server?.stop();
});

interface Event {
  id: string;
  itemId: string;
  at: number;
  kind: 'review' | 'know';
  grade: 0 | 1;
  device: string;
}

let phoneSeq = 0;
function nextPhone(): string {
  phoneSeq += 1;
  return `+98912300${String(phoneSeq).padStart(4, '0')}`;
}

function event(n: number, overrides: Partial<Event> = {}): Event {
  return {
    id: randomUUID(),
    itemId: `word-${n}`,
    at: Date.now() - 1000 * n,
    kind: n % 7 === 0 ? 'know' : 'review',
    grade: n % 3 === 0 ? 0 : 1,
    device: 'device-a',
    ...overrides,
  };
}

function events(count: number, from = 0): Event[] {
  return Array.from({ length: count }, (_, i) => event(from + i));
}

function push(token: string, body: unknown) {
  return server.api<any>('POST', '/api/sync/push', { token, body });
}

function pull(token: string, since = '', limit?: number) {
  const params = new URLSearchParams();
  if (since) params.set('since', since);
  if (limit !== undefined) params.set('limit', String(limit));
  const qs = params.toString();
  return server.api<any>('GET', `/api/sync/pull${qs ? `?${qs}` : ''}`, { token });
}

/** Pull every page, asserting each page is well-formed. */
async function pullAll(token: string, limit: number) {
  const all: Event[] = [];
  let since = '';
  let pages = 0;
  for (;;) {
    const page = await pull(token, since, limit);
    expect(page.status).toBe(200);
    expect(page.body.events.length).toBeLessThanOrEqual(limit);
    all.push(...page.body.events);
    pages += 1;
    since = page.body.cursor;
    if (!page.body.more) break;
    expect(pages).toBeLessThan(1000);
  }
  return { all, pages, cursor: since };
}

describe('auth', () => {
  it('refuses push and pull without a token', async () => {
    const pushed = await server.api<any>('POST', '/api/sync/push', { body: { events: [] } });
    expect(pushed.status).toBe(401);
    expect(pushed.body.error.code).toBe('UNAUTHORIZED');

    const pulled = await server.api<any>('GET', '/api/sync/pull');
    expect(pulled.status).toBe(401);
    expect(pulled.body.error.code).toBe('UNAUTHORIZED');
  });

  it('refuses a superuser token: the log belongs to a user', async () => {
    const pulled = await server.asSuperuser<any>('GET', '/api/sync/pull');
    expect(pulled.status).toBe(403);
    expect(pulled.body.error.code).toBe('FORBIDDEN');
  });
});

describe('push', () => {
  it('stores events and returns them exactly as sent', async () => {
    const user = await server.createUser(nextPhone());
    const batch = events(5);

    const pushed = await push(user.token, { events: batch });
    expect(pushed.status).toBe(200);
    expect(pushed.body).toEqual({ accepted: 5, duplicates: 0 });

    const pulled = await pull(user.token);
    expect(pulled.status).toBe(200);
    expect(pulled.body.more).toBe(false);
    const byId = new Map(pulled.body.events.map((e: Event) => [e.id, e]));
    for (const sent of batch) expect(byId.get(sent.id)).toEqual(sent);
  });

  it('is idempotent: the same batch twice stores each event once', async () => {
    const user = await server.createUser(nextPhone());
    const batch = events(40);

    const first = await push(user.token, { events: batch });
    expect(first.body).toEqual({ accepted: 40, duplicates: 0 });

    const second = await push(user.token, { events: batch });
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ accepted: 0, duplicates: 40 });

    // A retry that overlaps: half old, half new — the crash-between-push-and-mark case.
    const overlap = [...batch.slice(0, 20), ...events(10, 100)];
    const third = await push(user.token, { events: overlap });
    expect(third.body).toEqual({ accepted: 10, duplicates: 20 });

    const { all } = await pullAll(user.token, 500);
    expect(all).toHaveLength(50);
    expect(new Set(all.map((e) => e.id)).size).toBe(50);
  });

  it('keeps the first copy when a replay carries different fields for the same id', async () => {
    // Events are append-only and never edited (ADR-0002): insert-ignore, never upsert.
    const user = await server.createUser(nextPhone());
    const original = event(1, { grade: 1 });
    await push(user.token, { events: [original] });
    const tampered = { ...original, grade: 0, itemId: 'something-else' };
    const replay = await push(user.token, { events: [tampered] });
    expect(replay.body).toEqual({ accepted: 0, duplicates: 1 });

    const pulled = await pull(user.token);
    expect(pulled.body.events).toEqual([original]);
  });

  it('accepts a batch of exactly 500 and rejects 501', async () => {
    const user = await server.createUser(nextPhone());

    const tooMany = await push(user.token, { events: events(501) });
    expect(tooMany.status).toBe(400);
    expect(tooMany.body.error.code).toBe('BAD_INPUT');
    // Nothing from a refused batch is stored.
    expect((await pull(user.token)).body.events).toHaveLength(0);

    const exactly = await push(user.token, { events: events(500) });
    expect(exactly.status).toBe(200);
    expect(exactly.body).toEqual({ accepted: 500, duplicates: 0 });
  });

  it('accepts an empty batch', async () => {
    const user = await server.createUser(nextPhone());
    const pushed = await push(user.token, { events: [] });
    expect(pushed.status).toBe(200);
    expect(pushed.body).toEqual({ accepted: 0, duplicates: 0 });
  });

  it('rejects the whole batch when one event is malformed, and stores none of it', async () => {
    const user = await server.createUser(nextPhone());
    const cases: Array<[string, Record<string, unknown>]> = [
      ['id', { id: 'not-a-uuid' }],
      ['id', { id: randomUUID().toUpperCase() }],
      ['itemId', { itemId: '' }],
      ['itemId', { itemId: 'x'.repeat(65) }],
      ['at', { at: 1.5 }],
      ['at', { at: -1 }],
      ['at', { at: '1758000000000' }],
      ['kind', { kind: 'skip' }],
      ['grade', { grade: 2 }],
      ['device', { device: 7 }],
    ];

    for (const [field, override] of cases) {
      const batch: unknown[] = events(3);
      batch[1] = { ...(batch[1] as Event), ...override };
      const pushed = await push(user.token, { events: batch });
      expect(pushed.status, `${field} ${JSON.stringify(override)}`).toBe(400);
      expect(pushed.body.error.code).toBe('BAD_INPUT');
      expect(pushed.body.error.message).toContain('events[1]');
    }

    expect((await pull(user.token)).body.events).toHaveLength(0);
  });

  it('rejects a body without an events array', async () => {
    const user = await server.createUser(nextPhone());
    expect((await push(user.token, {})).status).toBe(400);
    expect((await push(user.token, { events: 'nope' })).status).toBe(400);
  });

  it('stores an out-of-range `at` as sent and flags it in the log', async () => {
    const user = await server.createUser(nextPhone());
    const skewed = event(1, { at: Date.now() + 2 * 365 * 24 * 3600 * 1000 });
    const pushed = await push(user.token, { events: [skewed, event(2)] });
    expect(pushed.body).toEqual({ accepted: 2, duplicates: 0 });

    const pulled = await pull(user.token);
    expect(pulled.body.events.find((e: Event) => e.id === skewed.id)).toEqual(skewed);

    const lines = await server.logsFor(
      'sync.push',
      (line) => line.data.flag === 'at_out_of_range' && line.data.userId === user.id,
    );
    const flagged = lines.find(
      (line) => line.data.flag === 'at_out_of_range' && line.data.userId === user.id,
    );
    expect(flagged).toBeDefined();
    expect(flagged?.data.count).toBe(1);
    expect(flagged?.data.sampleIds).toBe(skewed.id);
  });
});

describe('pull paging', () => {
  it('walks many pages with no gaps and no duplicates, across identical `created` values', async () => {
    const user = await server.createUser(nextPhone());
    // Three pushes: every event of one push shares one `created` stamp, so a page boundary
    // inside a push can only be crossed correctly through the id tie-break.
    const sent = [...events(120, 0), ...events(75, 200), ...events(5, 400)];
    for (const batch of [sent.slice(0, 120), sent.slice(120, 195), sent.slice(195)]) {
      const pushed = await push(user.token, { events: batch });
      expect(pushed.body.accepted).toBe(batch.length);
    }

    for (const limit of [1, 7, 50, 120, 199, 200, 500]) {
      const { all, pages } = await pullAll(user.token, limit);
      expect(all).toHaveLength(200);
      expect(new Set(all.map((e) => e.id))).toEqual(new Set(sent.map((e) => e.id)));
      expect(pages).toBe(Math.max(1, Math.ceil(200 / limit)));
    }
  });

  it('returns identical `created` values and orders them by id inside a push', async () => {
    const user = await server.createUser(nextPhone());
    const batch = events(30);
    await push(user.token, { events: batch });

    const page = await pull(user.token, '', 10);
    // cursor = created|id: a push stamps all its rows alike.
    const [created] = page.body.cursor.split('|');
    const rest = await pullAll(user.token, 500);
    expect(rest.cursor.split('|')[0]).toBe(created);

    const ids = rest.all.map((e) => e.id);
    expect(ids).toEqual([...ids].sort());
  });

  it('a later push always sorts after an earlier cursor, even within the same millisecond', async () => {
    const user = await server.createUser(nextPhone());
    const seen = new Set<string>();
    let cursor = '';

    // Interleave pushes and pulls quickly: every event must reach the puller exactly once.
    for (let round = 0; round < 15; round++) {
      const batch = events(3, round * 10);
      await push(user.token, { events: batch });
      const page = await pull(user.token, cursor, 500);
      for (const e of page.body.events) {
        expect(seen.has(e.id)).toBe(false);
        seen.add(e.id);
      }
      cursor = page.body.cursor;
      for (const e of batch) expect(seen.has(e.id)).toBe(true);
    }
    expect(seen.size).toBe(45);
  });

  it('two concurrent pushes both land, and an incremental puller sees each event once', async () => {
    const user = await server.createUser(nextPhone());
    const a = events(200, 0);
    const b = events(200, 1000);
    const [ra, rb] = await Promise.all([
      push(user.token, { events: a }),
      push(user.token, { events: b }),
    ]);
    expect(ra.body.accepted + rb.body.accepted).toBe(400);
    const { all } = await pullAll(user.token, 33);
    expect(all).toHaveLength(400);
    expect(new Set(all.map((e) => e.id)).size).toBe(400);
  });

  it('an empty page keeps the cursor it was given', async () => {
    const user = await server.createUser(nextPhone());
    await push(user.token, { events: events(2) });
    const first = await pull(user.token);
    const again = await pull(user.token, first.body.cursor);
    expect(again.status).toBe(200);
    expect(again.body).toEqual({ events: [], cursor: first.body.cursor, more: false });

    const fresh = await server.createUser(nextPhone());
    expect((await pull(fresh.token)).body).toEqual({ events: [], cursor: '', more: false });
  });

  it('rejects a malformed cursor or limit', async () => {
    const user = await server.createUser(nextPhone());
    for (const since of ['garbage', '2026-09-23T21:38:00.000Z|x', "' OR 1=1 --"]) {
      const response = await pull(user.token, since);
      expect(response.status, since).toBe(400);
      expect(response.body.error.code).toBe('BAD_INPUT');
    }
    for (const limit of [0, 1001, -5]) {
      expect((await pull(user.token, '', limit)).status, String(limit)).toBe(400);
    }
    const nonNumeric = await server.api<any>('GET', '/api/sync/pull?limit=abc', {
      token: user.token,
    });
    expect(nonNumeric.status).toBe(400);
  });
});

describe('cross-user isolation', () => {
  it('B never pulls A’s events', async () => {
    const a = await server.createUser(nextPhone());
    const b = await server.createUser(nextPhone());
    await push(a.token, { events: events(10) });
    await push(b.token, { events: events(3, 50) });

    const { all } = await pullAll(b.token, 2);
    expect(all).toHaveLength(3);
    expect(all.every((e) => e.itemId.startsWith('word-5'))).toBe(true);
  });

  it('B cannot overwrite or steal A’s events by pushing their ids', async () => {
    const a = await server.createUser(nextPhone());
    const b = await server.createUser(nextPhone());
    const aEvents = events(5);
    await push(a.token, { events: aEvents });

    const forged = aEvents.map((e) => ({ ...e, grade: 0 as const, itemId: 'stolen' }));
    const pushed = await push(b.token, { events: forged });
    expect(pushed.status).toBe(200);
    expect(pushed.body).toEqual({ accepted: 0, duplicates: 5 });

    // A's events are untouched and B has none of them.
    const aAll = (await pullAll(a.token, 500)).all;
    expect(aAll).toEqual(expect.arrayContaining(aEvents));
    expect(aAll).toHaveLength(5);
    expect((await pull(b.token)).body.events).toHaveLength(0);

    const lines = await server.logsFor(
      'sync.push',
      (line) => line.data.flag === 'id_conflict' && line.data.userId === b.id,
    );
    expect(
      lines.some((line) => line.data.flag === 'id_conflict' && line.data.userId === b.id),
    ).toBe(true);
  });

  it('ignores a forged `user` in the body and on each event', async () => {
    const a = await server.createUser(nextPhone());
    const b = await server.createUser(nextPhone());
    const batch = events(4).map((e) => ({ ...e, user: a.id }));

    const pushed = await push(b.token, { user: a.id, events: batch });
    expect(pushed.status).toBe(200);
    expect(pushed.body.accepted).toBe(4);

    expect((await pull(a.token)).body.events).toHaveLength(0);
    const bEvents = (await pull(b.token)).body.events;
    expect(bEvents).toHaveLength(4);
    // The stray field is dropped, not echoed back.
    expect(bEvents[0].user).toBeUndefined();
  });

  it('a cursor from A’s log does not open B’s events to A', async () => {
    const a = await server.createUser(nextPhone());
    const b = await server.createUser(nextPhone());
    await push(b.token, { events: events(3) });
    await push(a.token, { events: events(1, 9) });
    const bCursor = (await pull(b.token, '', 1)).body.cursor;
    const aWithBCursor = await pull(a.token, bCursor);
    expect(aWithBCursor.status).toBe(200);
    for (const e of aWithBCursor.body.events) expect(e.itemId).toBe('word-9');
  });
});

describe('the direct collection API stays shut', () => {
  it('a user cannot list or create review_events through PocketBase’s generic API', async () => {
    const user = await server.createUser(nextPhone());
    await push(user.token, { events: events(1) });

    const listed = await server.api<any>('GET', '/api/collections/review_events/records', {
      token: user.token,
    });
    // A null listRule answers 403 for a non-superuser.
    expect([403, 404]).toContain(listed.status);

    const created = await server.api<any>('POST', '/api/collections/review_events/records', {
      token: user.token,
      body: { ...event(1), user: user.id },
    });
    expect([400, 403, 404]).toContain(created.status);
    expect((await pull(user.token)).body.events).toHaveLength(1);
  });
});
