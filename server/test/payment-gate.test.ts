// The hard gate of ticket dev-payment/01 (added 2026-09-24): while SMS_PROVIDER=mock every phone
// signs in with 123456, so an account proves nothing. Every /api/pay/* route and the paid download
// must refuse with PAYMENT_DISABLED_MOCK_SMS (503) before doing anything else — before auth,
// before the body, before any write or gateway call.
//
// This server also runs on the real origin with ZARINPAL_PROVIDER=mock, to prove lib/env.js
// reports both mocks there.

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Server, startServer } from './harness.ts';
import { startZarinpalStub, type ZarinpalStub } from './zarinpal-stub.ts';

let server: Server;
let stub: ZarinpalStub;
let contentDir: string;

beforeAll(async () => {
  stub = await startZarinpalStub();
  contentDir = await mkdtemp(path.join(tmpdir(), 'kl-content-'));
  await writeFile(path.join(contentDir, 'paid.json'), '{"packageId":"paid","items":[]}');
  await writeFile(
    path.join(contentDir, 'manifest.json'),
    JSON.stringify({
      free: { version: 'v', hash: 'h', bytes: 1 },
      paid: { version: 'v', hash: 'h', bytes: 1 },
    }),
  );
  server = await startServer({
    env: {
      SMS_PROVIDER: 'mock',
      ZARINPAL_PROVIDER: 'mock',
      ZARINPAL_API_BASE: stub.url,
      PUBLIC_APP_ORIGIN: 'https://app.konkurleitner.com',
      CONTENT_DIR: contentDir,
    },
  });
});

afterAll(async () => {
  await server?.stop();
  await stub?.stop();
  await rm(contentDir, { recursive: true, force: true });
});

function expectGated(response: { status: number; body: any }, what: string) {
  expect(response.status, what).toBe(503);
  expect(response.body?.error?.code, what).toBe('PAYMENT_DISABLED_MOCK_SMS');
}

describe('SMS_PROVIDER=mock gates payment', () => {
  it('refuses every gated route for an entitled user holding a valid token', async () => {
    const phone = '+989125000001';
    const user = await server.createUser(phone);
    // An entitlement and a code that would otherwise work: the gate must not care.
    expect((await server.asSuperuser('POST', '/api/admin/grant', { body: { phone } })).status).toBe(
      200,
    );
    await server.asSuperuser('POST', '/api/collections/discount_codes/records', {
      body: {
        code: 'GATE100',
        type: 'percent',
        value: 100,
        maxUses: 5,
        usedCount: 0,
        active: true,
      },
    });

    const calls: Array<[string, string, unknown]> = [
      ['POST', '/api/pay/quote', { code: 'GATE100' }],
      ['POST', '/api/pay/request', { code: 'GATE100' }],
      ['GET', '/api/pay/callback?Authority=MOCK123&Status=OK', undefined],
      ['GET', '/api/pay/status/aaaaaaaaaaaaaaa', undefined],
      ['GET', '/api/content/paid', undefined],
    ];

    for (const [method, route, body] of calls) {
      expectGated(
        await server.api(method, route, { token: user.token, body }),
        `${method} ${route}`,
      );
      // Before auth: an anonymous call gets the same answer, not UNAUTHORIZED.
      expectGated(await server.api(method, route, { body }), `anonymous ${method} ${route}`);
    }

    // Nothing was written and nothing reached a gateway.
    const payments = await server.asSuperuser<any>('GET', '/api/collections/payments/records');
    expect(payments.body.items).toHaveLength(0);
    const downloads = await server.asSuperuser<any>(
      'GET',
      '/api/collections/content_downloads/records',
    );
    expect(downloads.body.items).toHaveLength(0);
    expect(stub.calls).toHaveLength(0);
  });

  it('a malformed body is still the gate, not BAD_INPUT', async () => {
    const response = await fetch(`${server.url}/api/pay/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not json',
    });
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('PAYMENT_DISABLED_MOCK_SMS');
  });

  it('leaves the ungated routes alone: manifest, me, admin grant', async () => {
    expect((await server.api('GET', '/api/content/manifest')).status).toBe(200);
    const user = await server.createUser('+989125000002');
    expect((await server.api('GET', '/api/me', { token: user.token })).status).toBe(200);
    expect(
      (await server.asSuperuser('POST', '/api/admin/grant', { body: { phone: '+989125000003' } }))
        .status,
    ).toBe(200);
  });

  it('logs both mocks as problems on the production origin', async () => {
    const deadline = Date.now() + 15_000;
    let problems: string[] = [];
    while (Date.now() < deadline) {
      const filter = encodeURIComponent("message='env.problem'");
      const found = await server.asSuperuser<any>('GET', `/api/logs?perPage=100&filter=${filter}`);
      problems = (found.body.items ?? []).map((l: any) => String(l.data.problem));
      if (problems.some((p) => p.startsWith('ZARINPAL_PROVIDER=mock'))) break;
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    expect(problems).toContain(
      'ZARINPAL_PROVIDER=mock on a production origin: purchases grant without payment',
    );
    expect(problems).toContain(
      'SMS_PROVIDER=mock on a production origin: every phone logs in with 123456',
    );
  });
});
