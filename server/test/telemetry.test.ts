// POST /api/flags, POST /api/beacon, POST /api/client-errors, GET /api/admin/sourcemap/:sha/:file
// against a real PocketBase (what.md §8.2, §8.4, §10.1, §15; ticket dev-server/04).
//
// Every test uses its own installId (and, for the sourcemap route, its own sha) so the per-install
// daily caps of one test never leak into another — same reasoning as otp.test.ts's per-test phone.

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Server, startServer } from './harness.ts';

let server: Server;
let sourcemapDir: string;

beforeAll(async () => {
  sourcemapDir = await mkdtemp(path.join(tmpdir(), 'kl-sourcemaps-'));
  server = await startServer({ env: { SOURCEMAP_DIR: sourcemapDir } });
});

afterAll(async () => {
  await server?.stop();
  await rm(sourcemapDir, { recursive: true, force: true });
});

let nextInstall = 1;
/** A fresh installId per call, so caps never leak between tests. */
function installId(): string {
  nextInstall += 1;
  return `install-${nextInstall}`;
}

// ================================================================================ POST /api/flags

describe('POST /api/flags', () => {
  it('accepts an anonymous flag', async () => {
    const id = installId();
    const response = await server.api<any>('POST', '/api/flags', {
      body: {
        installId: id,
        itemId: 'attribute',
        reason: 'translation',
        appVersion: '0.1.0',
        at: 1_700_000_000_000,
      },
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it('accepts a flag from a logged-in user and records the relation', async () => {
    const id = installId();
    const user = await server.createUser('+989123330001');

    const response = await server.api<any>('POST', '/api/flags', {
      token: user.token,
      body: {
        installId: id,
        itemId: 'distinct',
        reason: 'hint',
        appVersion: '0.1.0',
        at: 1_700_000_000_000,
      },
    });
    expect(response.status).toBe(200);

    const list = await server.asSuperuser<any>(
      'GET',
      `/api/collections/word_flags/records?filter=${encodeURIComponent(`installId='${id}'`)}`,
    );
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].user).toBe(user.id);
  });

  it('accepts every reason code the client sends — both screens use the same three', async () => {
    // `/review` and `/word/:id` both build this body through `engine/flag-body.ts`'s
    // `buildFlagBody` (ticket dev-web/07); this is the full set `FLAG_REASONS` offers.
    for (const reason of ['translation', 'example', 'hint']) {
      const response = await server.api<any>('POST', '/api/flags', {
        body: {
          installId: installId(),
          itemId: 'attribute',
          reason,
          appVersion: '0.1.0',
          at: 1_700_000_000_000,
        },
      });
      expect(response.status).toBe(200);
    }
  });

  it('rejects an unknown reason with BAD_INPUT', async () => {
    const id = installId();
    const response = await server.api<any>('POST', '/api/flags', {
      body: {
        installId: id,
        itemId: 'attribute',
        reason: 'bogus',
        appVersion: '0.1.0',
        at: 1_700_000_000_000,
      },
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('BAD_INPUT');
  });

  it('refuses a body over 32 KB', async () => {
    const id = installId();
    const response = await server.api<any>('POST', '/api/flags', {
      body: {
        installId: id,
        itemId: 'attribute',
        reason: 'translation',
        appVersion: '0.1.0'.padEnd(40_000, 'x'),
        at: 1_700_000_000_000,
      },
    });

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('BAD_INPUT');
  });

  it('caps an install at 50 flags per day, with retryAfter', async () => {
    const id = installId();
    let last: any;
    for (let i = 0; i < 50; i++) {
      last = await server.api<any>('POST', '/api/flags', {
        body: {
          installId: id,
          itemId: `word-${i}`,
          reason: 'translation',
          appVersion: '0.1.0',
          at: 1_700_000_000_000,
        },
      });
      expect(last.status).toBe(200);
    }

    const limited = await server.api<any>('POST', '/api/flags', {
      body: {
        installId: id,
        itemId: 'word-51',
        reason: 'translation',
        appVersion: '0.1.0',
        at: 1_700_000_000_000,
      },
    });
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(typeof limited.body.retryAfter).toBe('number');
    expect(limited.body.retryAfter).toBeGreaterThan(0);

    // A different install is untouched by the first one's cap.
    const other = await server.api<any>('POST', '/api/flags', {
      body: {
        installId: installId(),
        itemId: 'word-1',
        reason: 'translation',
        appVersion: '0.1.0',
        at: 1_700_000_000_000,
      },
    });
    expect(other.status).toBe(200);
  });
});

// =============================================================================== POST /api/beacon

describe('POST /api/beacon', () => {
  it('accepts a batch of known beacon names', async () => {
    const id = installId();
    const response = await server.api<any>('POST', '/api/beacon', {
      body: {
        installId: id,
        events: [
          { name: 'first_open', at: 1_700_000_000_000, appVersion: '0.1.0' },
          { name: 'onboarding_done', at: 1_700_000_001_000, appVersion: '0.1.0' },
        ],
      },
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });

    const list = await server.asSuperuser<any>(
      'GET',
      `/api/collections/beacons/records?filter=${encodeURIComponent(`installId='${id}'`)}`,
    );
    expect(list.body.items).toHaveLength(2);
  });

  it('rejects the whole call on one unknown name, naming its index, and stores nothing', async () => {
    const id = installId();
    const response = await server.api<any>('POST', '/api/beacon', {
      body: {
        installId: id,
        events: [
          { name: 'first_open', at: 1_700_000_000_000, appVersion: '0.1.0' },
          { name: 'not_a_real_beacon', at: 1_700_000_000_000, appVersion: '0.1.0' },
        ],
      },
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('BAD_INPUT');
    expect(response.body.error.message).toContain('events[1]');

    const list = await server.asSuperuser<any>(
      'GET',
      `/api/collections/beacons/records?filter=${encodeURIComponent(`installId='${id}'`)}`,
    );
    expect(list.body.items).toHaveLength(0);
  });

  it('rejects more than 20 events in one call', async () => {
    const id = installId();
    const events = Array.from({ length: 21 }, (_, i) => ({
      name: 'first_open',
      at: 1_700_000_000_000 + i,
      appVersion: '0.1.0',
    }));

    const response = await server.api<any>('POST', '/api/beacon', {
      body: { installId: id, events },
    });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('BAD_INPUT');
  });

  it('caps an install at 200 beacons per day', async () => {
    const id = installId();
    for (let batch = 0; batch < 10; batch++) {
      const events = Array.from({ length: 20 }, (_, i) => ({
        name: 'first_open',
        at: 1_700_000_000_000 + batch * 20 + i,
        appVersion: '0.1.0',
      }));
      const response = await server.api<any>('POST', '/api/beacon', {
        body: { installId: id, events },
      });
      expect(response.status).toBe(200);
    }

    const limited = await server.api<any>('POST', '/api/beacon', {
      body: {
        installId: id,
        events: [{ name: 'first_open', at: 1_700_000_000_000, appVersion: '0.1.0' }],
      },
    });
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
  });
});

// ========================================================================= POST /api/client-errors

function errorRecord(id: string, fingerprint: string, overrides: Record<string, unknown> = {}) {
  return {
    installId: id,
    kind: 'error',
    fingerprint,
    message: 'boom',
    stack: 'Error: boom\n  at f (app.js:1:1)',
    appVersion: '0.1.0',
    buildSha: 'abc1234',
    route: '/study',
    at: 1_700_000_000_000,
    online: true,
    device: {
      ua: 'test',
      platform: 'test',
      screen: '',
      memory: null,
      standalone: false,
      twa: false,
    },
    breadcrumbs: [],
    snapshot: { eventCount: 0 },
    ...overrides,
  };
}

describe('POST /api/client-errors', () => {
  it('stores a first occurrence with count 1', async () => {
    const id = installId();
    const response = await server.api<any>('POST', '/api/client-errors', {
      body: errorRecord(id, 'fp-first'),
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, deduped: false });

    const list = await server.asSuperuser<any>(
      'GET',
      `/api/collections/client_errors/records?filter=${encodeURIComponent(`installId='${id}'`)}`,
    );
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].count).toBe(1);
  });

  it('dedupes the same fingerprint from the same install within the hour: count++, one row', async () => {
    const id = installId();
    await server.api('POST', '/api/client-errors', { body: errorRecord(id, 'fp-dup') });
    const second = await server.api<any>('POST', '/api/client-errors', {
      body: errorRecord(id, 'fp-dup', { message: 'boom again' }),
    });
    const third = await server.api<any>('POST', '/api/client-errors', {
      body: errorRecord(id, 'fp-dup', { message: 'boom a third time' }),
    });

    expect(second.body).toEqual({ ok: true, deduped: true });
    expect(third.body).toEqual({ ok: true, deduped: true });

    const list = await server.asSuperuser<any>(
      'GET',
      `/api/collections/client_errors/records?filter=${encodeURIComponent(`installId='${id}' && fingerprint='fp-dup'`)}`,
    );
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].count).toBe(3);
    expect(list.body.items[0].message).toBe('boom a third time');
  });

  it('a different install with the same fingerprint gets its own row', async () => {
    const a = installId();
    const b = installId();
    await server.api('POST', '/api/client-errors', { body: errorRecord(a, 'fp-shared') });
    await server.api('POST', '/api/client-errors', { body: errorRecord(b, 'fp-shared') });

    const list = await server.asSuperuser<any>(
      'GET',
      `/api/collections/client_errors/records?filter=${encodeURIComponent(`fingerprint='fp-shared'`)}`,
    );
    expect(list.body.items).toHaveLength(2);
  });

  it('rejects an unknown kind with BAD_INPUT', async () => {
    const id = installId();
    const response = await server.api<any>('POST', '/api/client-errors', {
      body: errorRecord(id, 'fp-bad-kind', { kind: 'not-a-real-kind' }),
    });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('BAD_INPUT');
  });

  it('refuses a body over 32 KB', async () => {
    const id = installId();
    const response = await server.api<any>('POST', '/api/client-errors', {
      body: errorRecord(id, 'fp-huge', { snapshot: { filler: 'x'.repeat(40_000) } }),
    });
    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('BAD_INPUT');
  });

  it('caps an install at 30 new client-errors rows per day (dedupes do not count against it)', async () => {
    const id = installId();
    for (let i = 0; i < 30; i++) {
      const response = await server.api<any>('POST', '/api/client-errors', {
        body: errorRecord(id, `fp-cap-${i}`),
      });
      expect(response.status).toBe(200);
    }

    // A duplicate of an already-stored fingerprint is never gated by the cap.
    const dup = await server.api<any>('POST', '/api/client-errors', {
      body: errorRecord(id, 'fp-cap-0', { message: 'again' }),
    });
    expect(dup.status).toBe(200);
    expect(dup.body.deduped).toBe(true);

    // A genuinely new fingerprint is gated.
    const limited = await server.api<any>('POST', '/api/client-errors', {
      body: errorRecord(id, 'fp-cap-new'),
    });
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
  });
});

// ================================================================ GET /api/admin/sourcemap/:sha/:file

describe('GET /api/admin/sourcemap/:sha/:file', () => {
  it('is 401 with no auth at all', async () => {
    const response = await server.api('GET', '/api/admin/sourcemap/abc1234/app.js.map');
    expect(response.status).toBe(401);
  });

  it('is 403 for a logged-in user who is not a superuser', async () => {
    const user = await server.createUser('+989123330002');
    const response = await server.api('GET', '/api/admin/sourcemap/abc1234/app.js.map', {
      token: user.token,
    });
    expect(response.status).toBe(403);
  });

  it('serves the file for a superuser', async () => {
    const sha = 'deadbee';
    await mkdir(path.join(sourcemapDir, sha), { recursive: true });
    await writeFile(
      path.join(sourcemapDir, sha, 'app.js.map'),
      JSON.stringify({ version: 3, sources: ['app.ts'], mappings: 'AAAA' }),
    );

    const response = await server.asSuperuser<any>('GET', `/api/admin/sourcemap/${sha}/app.js.map`);
    expect(response.status).toBe(200);
    expect(response.body.version).toBe(3);
  });

  it('is 404 for a well-formed path that does not exist', async () => {
    const response = await server.asSuperuser<any>(
      'GET',
      '/api/admin/sourcemap/1234567/missing.js.map',
    );
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('rejects a sha that is not a hex commit hash', async () => {
    const response = await server.asSuperuser<any>(
      'GET',
      '/api/admin/sourcemap/not-a-sha/app.js.map',
    );
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('BAD_INPUT');
  });

  it('rejects a file name that is not a plain *.map', async () => {
    const response = await server.asSuperuser<any>('GET', '/api/admin/sourcemap/1234567/app.js');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('BAD_INPUT');
  });

  it('rejects a percent-encoded slash reaching for a path outside SOURCEMAP_DIR', async () => {
    const response = await server.asSuperuser<any>(
      'GET',
      '/api/admin/sourcemap/1234567/..%2f..%2f..%2fetc%2fpasswd',
    );
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('BAD_INPUT');
  });

  it('rejects a literal ".." filename', async () => {
    const response = await server.asSuperuser<any>('GET', '/api/admin/sourcemap/1234567/..map');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('BAD_INPUT');
  });

  it('does not route a path with an extra literal segment (falls through to 404)', async () => {
    const response = await server.asSuperuser<any>(
      'GET',
      '/api/admin/sourcemap/1234567/sub/dir.map',
    );
    expect(response.status).toBe(404);
  });
});
