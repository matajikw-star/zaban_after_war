// Per-IP rate limits (migration 1758800000_rate_limits.js; what.md §8.2, §15; how-why §5.11),
// against the real PocketBase limiter.
//
// Each test is its own client IP (X-Forwarded-For, which 1758700000_trusted_proxy.js trusts — the
// same trick otp.test.ts uses), so no test can spend another's bucket, and none of them touches
// 127.0.0.1, which the harness's own superuser login and telemetry.test.ts's calls use.
//
// No test races the clock. PocketBase 0.40.2's limiter (apis/middlewares_rate_limit.go) is a fixed
// window that opens at a key's first request and resets `duration` seconds later, counted in whole
// Unix seconds. Requests here are sequential, the first `max` from a fresh IP always pass, and a
// window can reset at most once in a run that lasts seconds — so the assertions only require the
// first 429 somewhere in (max, 2 × max], never at an exact call.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Server, startServer } from './harness.ts';

let server: Server;

beforeAll(async () => {
  server = await startServer();
});

afterAll(async () => {
  await server?.stop();
});

/** The rules the migration writes. A change to one is a change to what.md §8.2 and to this. */
const EXPECTED_RULES = [
  { label: 'POST /api/client-errors', audience: '', duration: 3600, maxRequests: 120 },
  { label: 'POST /api/beacon', audience: '', duration: 3600, maxRequests: 300 },
  { label: 'POST /api/flags', audience: '', duration: 3600, maxRequests: 300 },
  { label: '_superusers:auth', audience: '', duration: 10, maxRequests: 3 },
];

interface Outcome {
  /** Calls answered before the first 429. */
  readonly passed: number;
  /** Status of every call before the first 429, for the failure message. */
  readonly statuses: readonly number[];
  readonly limited: { status: number; body: any } | null;
}

/** Calls `send(i)` in sequence until the first 429, or `max` × 2 + 1 calls. */
async function callUntilLimited(
  max: number,
  send: (i: number) => Promise<{ status: number; body: any }>,
): Promise<Outcome> {
  const statuses: number[] = [];
  for (let i = 0; i < max * 2 + 1; i++) {
    const response = await send(i);
    if (response.status === 429) return { passed: i, statuses, limited: response };
    statuses.push(response.status);
  }
  return { passed: statuses.length, statuses, limited: null };
}

function errorRecord(installId: string) {
  return {
    installId,
    kind: 'error',
    fingerprint: 'fp-rate-limit',
    message: 'boom',
    appVersion: '0.1.0',
    at: 1_700_000_000_000,
    online: true,
  };
}

async function rowsFor(collection: string, installPrefix: string): Promise<number> {
  const filter = encodeURIComponent(`installId ~ '${installPrefix}%'`);
  const list = await server.asSuperuser<any>(
    'GET',
    `/api/collections/${collection}/records?perPage=1&filter=${filter}`,
  );
  expect(list.status).toBe(200);
  return list.body.totalItems;
}

describe('rate limits', () => {
  it('turns the limiter on with exactly the rules of what.md §8.2 — no /api/ catch-all', async () => {
    const settings = await server.asSuperuser<any>('GET', '/api/settings');
    expect(settings.status).toBe(200);
    expect(settings.body.rateLimits.enabled).toBe(true);
    expect(settings.body.rateLimits.excludedIPs).toEqual([]);
    expect(settings.body.rateLimits.rules).toEqual(EXPECTED_RULES);
  });

  const telemetry = [
    {
      route: '/api/client-errors',
      collection: 'client_errors',
      max: 120,
      body: (id: string) => errorRecord(id),
      ip: '198.51.100.11',
    },
    {
      route: '/api/beacon',
      collection: 'beacons',
      max: 300,
      body: (id: string) => ({
        installId: id,
        events: [{ name: 'first_open', at: 1_700_000_000_000, appVersion: '0.1.0' }],
      }),
      ip: '198.51.100.12',
    },
    {
      route: '/api/flags',
      collection: 'word_flags',
      max: 300,
      body: (id: string) => ({
        installId: id,
        itemId: 'attribute',
        reason: 'translation',
        appVersion: '0.1.0',
        at: 1_700_000_000_000,
      }),
      ip: '198.51.100.13',
    },
  ];

  for (const { route, collection, max, body, ip } of telemetry) {
    it(`POST ${route}: one IP rotating installIds is refused past ${max} calls, and writes nothing more`, async () => {
      // A fresh installId on every call: the per-install daily cap never engages, so the only
      // thing that can stop this caller is the per-IP rule.
      const prefix = `rl-${collection}-`;
      const outcome = await callUntilLimited(max, (i) =>
        server.api('POST', route, {
          body: body(`${prefix}${i}`),
          headers: { 'X-Forwarded-For': ip },
        }),
      );

      expect(outcome.statuses.every((s) => s === 200)).toBe(true);
      expect(outcome.limited, `no 429 within ${max * 2 + 1} calls`).not.toBeNull();
      expect(outcome.passed).toBeGreaterThanOrEqual(max);
      expect(outcome.passed).toBeLessThanOrEqual(max * 2);
      // PocketBase's own envelope, not withRoute's: the limiter answers before the hook runs.
      expect(outcome.limited?.body).toMatchObject({ status: 429 });

      // The refused call stored nothing: one row per call that passed.
      expect(await rowsFor(collection, prefix)).toBe(outcome.passed);

      // Per IP, not global: another address is still served.
      const other = await server.api<any>('POST', route, {
        body: body(`${prefix}other-ip`),
        headers: { 'X-Forwarded-For': '198.51.100.99' },
      });
      expect(other.status).toBe(200);
    }, 120_000);
  }

  it('limits superuser login per IP, before the password is even checked', async () => {
    const ip = '198.51.100.21';
    const login = (password: string, from: string) =>
      server.api<any>('POST', '/api/collections/_superusers/auth-with-password', {
        body: { identity: server.superuserEmail, password },
        headers: { 'X-Forwarded-For': from },
      });

    const outcome = await callUntilLimited(3, () => login('wrong-password-1234567890', ip));
    expect(outcome.statuses.every((s) => s === 400)).toBe(true);
    expect(outcome.limited, 'no 429 within 7 attempts').not.toBeNull();
    expect(outcome.passed).toBeGreaterThanOrEqual(3);
    expect(outcome.passed).toBeLessThanOrEqual(6);

    // The right password from the limited IP is refused too: guessing is what is being counted.
    const right = await login(server.superuserPassword, ip);
    expect(right.status).toBe(429);

    // And from anywhere else it still works.
    const elsewhere = await login(server.superuserPassword, '198.51.100.22');
    expect(elsewhere.status).toBe(200);
    expect(typeof elsewhere.body.token).toBe('string');
  });
});
