// An /api/ path no route owns answers the JSON error envelope with 404 NOT_FOUND (what.md §8.2).
//
// Found on staging: with `--publicDir` (as systemd runs it) PocketBase serves pb_public on
// `GET /{path...}` with an index.html fallback, so `GET /api/content/paid` against a server that
// did not have the route yet answered `200 text/html` — a client talking to an older server, or a
// typo'd path, saw success and then failed parsing JSON. This server runs with a publicDir holding
// an index.html, exactly that setup, and checks that the real routes — ours and PocketBase's own —
// are untouched while the unknown ones are refused.

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Server, startServer } from './harness.ts';

const INDEX = '<!doctype html><title>app shell</title>';

let server: Server;
let publicDir: string;

beforeAll(async () => {
  publicDir = await mkdtemp(path.join(tmpdir(), 'kl-public-'));
  await writeFile(path.join(publicDir, 'index.html'), INDEX);
  server = await startServer({ publicDir });
});

afterAll(async () => {
  await server?.stop();
  await rm(publicDir, { recursive: true, force: true });
});

async function raw(method: string, route: string, body?: string, token?: string) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = token;
  const response = await fetch(`${server.url}${route}`, { method, headers, body });
  return {
    status: response.status,
    type: response.headers.get('content-type') ?? '',
    text: await response.text(),
  };
}

function expectJson404(r: { status: number; type: string; text: string }, what: string) {
  expect(r.status, what).toBe(404);
  expect(r.type, what).toContain('application/json');
  const body = JSON.parse(r.text);
  expect(body.error?.code, what).toBe('NOT_FOUND');
  expect(typeof body.error?.message, what).toBe('string');
}

describe('an unknown /api/ path', () => {
  it('GET answers the JSON 404 envelope, not the app shell', async () => {
    expectJson404(await raw('GET', '/api/no-such-route'), 'GET /api/no-such-route');
    expectJson404(await raw('GET', '/api/content/nope/deeper?x=1'), 'nested GET');
    // What staging showed: a route this server does not (yet) have.
    expectJson404(await raw('GET', '/api/pay/not-a-route'), 'GET /api/pay/not-a-route');
  });

  it('POST, PUT, PATCH and DELETE answer the same', async () => {
    expectJson404(await raw('POST', '/api/no-such-route', '{"a":1}'), 'POST');
    expectJson404(await raw('PUT', '/api/no-such-route', '{"a":1}'), 'PUT');
    expectJson404(await raw('PATCH', '/api/no-such-route', '{"a":1}'), 'PATCH');
    expectJson404(await raw('DELETE', '/api/no-such-route'), 'DELETE');
  });

  it('a HEAD gets a 404 too', async () => {
    const r = await raw('HEAD', '/api/no-such-route');
    expect(r.status).toBe(404);
  });

  it('logs one api line with the NOT_FOUND code', async () => {
    await raw('GET', '/api/logged-unknown');
    const lines = await server.logsFor('api.not_found', (l) => l.data.code === 'NOT_FOUND');
    expect(lines.some((l) => l.data.code === 'NOT_FOUND' && l.data.status === 404)).toBe(true);
  });
});

describe('real routes are untouched', () => {
  it('our health middleware and custom GET and POST routes still answer', async () => {
    const health = await raw('GET', '/api/health');
    expect(health.status).toBe(200);
    expect(JSON.parse(health.text).ok).toBe(true);

    const config = await raw('GET', '/api/config');
    expect(config.status).toBe(200);
    expect(JSON.parse(config.text).salePrice).toBe(290000);

    const manifest = await raw('GET', '/api/content/manifest');
    // CONTENT_DIR is the VPS default here, so the route is reached and reports the missing file.
    expect(manifest.status).toBe(500);
    expect(JSON.parse(manifest.text).error.code).toBe('INTERNAL');

    const otp = await raw('POST', '/api/otp/request', '{"phone":"12"}');
    expect(otp.status).toBe(400);
    expect(JSON.parse(otp.text).error.code).toBe('PHONE_INVALID');

    const user = await server.createUser('+989126000001');
    const me = await raw('GET', '/api/me', undefined, user.token);
    expect(me.status).toBe(200);
    const status = await raw('GET', '/api/pay/status/aaaaaaaaaaaaaaa', undefined, user.token);
    expect(JSON.parse(status.text).error.code).toBe('NOT_FOUND'); // the route's own 404
  });

  it('a CORS preflight for a real route still passes (the web app is another origin)', async () => {
    const response = await fetch(`${server.url}/api/sync/push`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://127.0.0.1:4173',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    });
    expect(response.status).toBeLessThan(300);
    expect(response.headers.get('access-control-allow-origin')).toBeTruthy();
  });

  it("PocketBase's own API still answers", async () => {
    const records = await server.asSuperuser<any>('GET', '/api/collections/app_config/records');
    expect(records.status).toBe(200);
    expect(records.body.totalItems).toBe(1);

    const collections = await server.asSuperuser<any>('GET', '/api/collections?perPage=1');
    expect(collections.status).toBe(200);

    // A PocketBase-owned path that does not exist keeps PocketBase's own answer shape for its
    // record API: the collection is unknown, so 404 from PocketBase, not from us.
    const missing = await server.asSuperuser<any>('GET', '/api/collections/nope/records');
    expect(missing.status).toBe(404);

    // Realtime (SSE) connects: the first event names the client id.
    const controller = new AbortController();
    const sse = await fetch(`${server.url}/api/realtime`, { signal: controller.signal });
    expect(sse.status).toBe(200);
    expect(sse.headers.get('content-type')).toContain('text/event-stream');
    controller.abort();
  });

  it('the app shell is still served for every non-/api path', async () => {
    for (const route of ['/', '/review', '/purchase/result?status=ok', '/apix/not-api']) {
      const r = await raw('GET', route);
      expect(r.status, route).toBe(200);
      expect(r.type, route).toContain('text/html');
      expect(r.text, route).toBe(INDEX);
    }
  });
});
