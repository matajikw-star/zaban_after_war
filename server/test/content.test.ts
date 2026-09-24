// GET /api/content/manifest and GET /api/content/paid (what.md §7.5, §8.2, §15; ticket
// dev-payment/01), against a CONTENT_DIR of this test's own: a paid.json with multi-byte Persian
// text in it, so a Range that were cut on characters instead of bytes would show.

import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Server, startServer } from './harness.ts';

let server: Server;
let contentDir: string;
let paid: Buffer;

const MANIFEST = {
  free: { version: '2026-09-24.1', hash: 'f'.repeat(64), bytes: 1234 },
  paid: { version: '2026-09-24.1', hash: '', bytes: 0 },
};

beforeAll(async () => {
  contentDir = await mkdtemp(path.join(tmpdir(), 'kl-content-'));
  const items = Array.from({ length: 400 }, (_, i) => ({
    id: `word-${i}`,
    lemma: `word${i}`,
    translations: ['واژه', 'کلمه‌ی آزمایشی'],
  }));
  paid = Buffer.from(JSON.stringify({ packageId: 'paid', items }), 'utf8');
  MANIFEST.paid.hash = createHash('sha256').update(paid).digest('hex');
  MANIFEST.paid.bytes = paid.length;
  await writeFile(path.join(contentDir, 'paid.json'), paid);
  await writeFile(path.join(contentDir, 'manifest.json'), JSON.stringify(MANIFEST));

  server = await startServer({ env: { CONTENT_DIR: contentDir } });
});

afterAll(async () => {
  await server?.stop();
  await rm(contentDir, { recursive: true, force: true });
});

function fetchPaid(token: string | null, headers: Record<string, string> = {}) {
  const all: Record<string, string> = { ...headers };
  if (token) all.Authorization = token;
  return fetch(`${server.url}/api/content/paid`, { headers: all });
}

async function entitledUser(phone: string) {
  const user = await server.createUser(phone);
  const granted = await server.asSuperuser('POST', '/api/admin/grant', { body: { phone } });
  expect(granted.status).toBe(200);
  return user;
}

describe('GET /api/content/manifest', () => {
  it('answers both packages without auth', async () => {
    const response = await server.api<any>('GET', '/api/content/manifest');
    expect(response.status).toBe(200);
    expect(response.body).toEqual(MANIFEST);
  });
});

describe('GET /api/content/paid', () => {
  it('needs a user token', async () => {
    const response = await fetchPaid(null);
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('UNAUTHORIZED');
  });

  it('refuses an unentitled user with NOT_ENTITLED', async () => {
    const user = await server.createUser('+989124000001');
    const response = await fetchPaid(user.token);
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('NOT_ENTITLED');
  });

  it('serves the whole file to an entitled user', async () => {
    const user = await entitledUser('+989124000002');
    const response = await fetchPaid(user.token);
    expect(response.status).toBe(200);
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(response.headers.get('etag')).toBe(`"${MANIFEST.paid.hash}"`);
    expect(response.headers.get('x-content-version')).toBe(MANIFEST.paid.version);
    const body = Buffer.from(await response.arrayBuffer());
    expect(body.equals(paid)).toBe(true);
    expect(createHash('sha256').update(body).digest('hex')).toBe(MANIFEST.paid.hash);
  });

  it('answers a Range with 206, Content-Range and exactly those bytes', async () => {
    const user = await entitledUser('+989124000003');

    const middle = await fetchPaid(user.token, { Range: 'bytes=100-1099' });
    expect(middle.status).toBe(206);
    expect(middle.headers.get('content-range')).toBe(`bytes 100-1099/${paid.length}`);
    expect(Buffer.from(await middle.arrayBuffer()).equals(paid.subarray(100, 1100))).toBe(true);

    // The resume the download machine sends: `bytes=<received>-`.
    const received = 5003; // deliberately not on a character boundary
    const rest = await fetchPaid(user.token, { Range: `bytes=${received}-` });
    expect(rest.status).toBe(206);
    expect(rest.headers.get('content-range')).toBe(
      `bytes ${received}-${paid.length - 1}/${paid.length}`,
    );
    const tail = Buffer.from(await rest.arrayBuffer());
    expect(Buffer.concat([paid.subarray(0, received), tail]).equals(paid)).toBe(true);
  });

  it('a stale If-Range restarts from byte 0 with a 200', async () => {
    const user = await entitledUser('+989124000004');
    const response = await fetchPaid(user.token, {
      Range: 'bytes=100-',
      'If-Range': '"an-older-hash"',
    });
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer()).equals(paid)).toBe(true);
  });

  it('an unsatisfiable range is 416', async () => {
    const user = await entitledUser('+989124000005');
    const response = await fetchPaid(user.token, { Range: `bytes=${paid.length + 10}-` });
    expect(response.status).toBe(416);
    expect(response.headers.get('content-range')).toBe(`bytes */${paid.length}`);
  });

  it('20 fetches a day; the 21st is RATE_LIMITED with retryAfter', async () => {
    const user = await entitledUser('+989124000006');
    for (let i = 0; i < 20; i++) {
      const ok = await fetchPaid(user.token, { Range: `bytes=${i}-${i + 9}` });
      expect(ok.status, `fetch ${i + 1}`).toBe(206);
      await ok.arrayBuffer();
    }
    const refused = await fetchPaid(user.token);
    expect(refused.status).toBe(429);
    const body = await refused.json();
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(body.retryAfter).toBeGreaterThan(86_000);
    expect(body.retryAfter).toBeLessThanOrEqual(86_400);
    expect(refused.headers.get('retry-after')).toBe(String(body.retryAfter));

    // Per user: another entitled user is unaffected.
    const other = await entitledUser('+989124000007');
    expect((await fetchPaid(other.token)).status).toBe(200);
  });
});

describe('a missing CONTENT_DIR', () => {
  let bare: Server;

  beforeAll(async () => {
    bare = await startServer({ env: { CONTENT_DIR: path.join(tmpdir(), 'kl-no-such-dir') } });
  });

  afterAll(async () => {
    await bare?.stop();
  });

  it('is INTERNAL on both routes, never a partial answer', async () => {
    const manifest = await bare.api<any>('GET', '/api/content/manifest');
    expect(manifest.status).toBe(500);
    expect(manifest.body.error.code).toBe('INTERNAL');

    const phone = '+989124000008';
    const user = await bare.createUser(phone);
    await bare.asSuperuser('POST', '/api/admin/grant', { body: { phone } });
    const response = await fetch(`${bare.url}/api/content/paid`, {
      headers: { Authorization: user.token },
    });
    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe('INTERNAL');
  });
});
