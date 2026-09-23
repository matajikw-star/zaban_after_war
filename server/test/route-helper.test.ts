// withRoute is the contract every later route inherits: one error envelope, stable codes, and
// one structured log line per request with the input redacted (what.md §8.2, §10.2, §15).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Server, startServer } from './harness.ts';

let server: Server;

beforeAll(async () => {
  server = await startServer();
});

afterAll(async () => {
  await server?.stop();
});

describe('the error envelope', () => {
  it('answers BAD_INPUT on a malformed body', async () => {
    const user = await server.createUser('+989122220001');

    const missing = await server.api<any>('PATCH', '/api/me/profile', {
      token: user.token,
      body: {},
    });
    expect(missing.status).toBe(400);
    expect(missing.body).toEqual({
      error: { code: 'BAD_INPUT', message: 'field profile is required' },
    });

    const wrongType = await server.api<any>('PATCH', '/api/me/profile', {
      token: user.token,
      body: { profile: 'not-an-object' },
    });
    expect(wrongType.status).toBe(400);
    expect(wrongType.body.error.code).toBe('BAD_INPUT');
    expect(wrongType.body.error.message).toContain('must be of type object');
  });

  it('is the same shape for every failure', async () => {
    const anonymous = await server.api<any>('GET', '/api/me');
    const forbidden = await server.asSuperuser<any>('GET', '/api/me');

    for (const response of [anonymous, forbidden]) {
      expect(Object.keys(response.body)).toEqual(['error']);
      expect(Object.keys(response.body.error).sort()).toEqual(['code', 'message']);
      expect(typeof response.body.error.code).toBe('string');
    }
    expect(anonymous.body.error.code).toBe('UNAUTHORIZED');
    expect(forbidden.body.error.code).toBe('FORBIDDEN');
  });

  it('refuses a body larger than 32 KB', async () => {
    const user = await server.createUser('+989122220002');

    const response = await server.api<any>('PATCH', '/api/me/profile', {
      token: user.token,
      body: { profile: { updatedAt: 1, filler: 'x'.repeat(40_000) } },
    });

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('BAD_INPUT');
  });
});

describe('the structured log line', () => {
  it('records route, userId, installId, ms and status for a success', async () => {
    const user = await server.createUser('+989122220003');

    await server.api('PATCH', '/api/me/profile', {
      token: user.token,
      headers: { 'X-Install-Id': 'install-success' },
      body: { profile: { goal: 40, updatedAt: 1000 } },
    });

    const lines = await server.logsFor('me.profile', (l) => l.data.installId === 'install-success');
    const line = lines.find((l) => l.data.installId === 'install-success');

    expect(line, JSON.stringify(lines)).toBeDefined();
    expect(line?.message).toBe('api');
    expect(line?.level).toBe(0); // info
    expect(line?.data).toMatchObject({
      route: 'me.profile',
      userId: user.id,
      installId: 'install-success',
      status: 200,
    });
    expect(typeof line?.data.ms).toBe('number');
    // A successful request's body says nothing a fix needs, so it is not logged.
    expect(line?.data.input).toBeUndefined();
  });

  it('records the code, the error and the redacted input for a failure', async () => {
    const user = await server.createUser('+989122220004');

    await server.api('PATCH', '/api/me/profile', {
      token: user.token,
      headers: { 'X-Install-Id': 'install-failure' },
      body: {
        profile: 'not-an-object',
        phone: '+989121234567',
        code: '12345',
        token: 'a-secret-token',
      },
    });

    const lines = await server.logsFor('me.profile', (l) => l.data.installId === 'install-failure');
    const line = lines.find((l) => l.data.installId === 'install-failure');

    expect(line, JSON.stringify(lines)).toBeDefined();
    expect(line?.level).toBe(4); // warn — a 4xx is the client's problem, not the server's
    expect(line?.data).toMatchObject({
      route: 'me.profile',
      installId: 'install-failure',
      status: 400,
      code: 'BAD_INPUT',
    });
    expect(line?.data.err).toContain('must be of type object');

    // §10.2: the input is logged, redacted. The phone is masked and the secrets are hashed.
    const input = JSON.parse(line?.data.input as string);
    expect(input.phone).toBe('+98…4567');
    expect(input.code).toMatch(/^sha256:[0-9a-f]{12}$/);
    expect(input.token).toMatch(/^sha256:[0-9a-f]{12}$/);
    expect(input.code).not.toContain('12345');

    // Nothing anywhere in the line is the phone number or a secret in the clear.
    const whole = JSON.stringify(line?.data);
    expect(whole).not.toContain('+989121234567');
    expect(whole).not.toContain('a-secret-token');
  });

  it('logs the anonymous 401 with an empty userId rather than dropping it', async () => {
    await server.api('GET', '/api/me', { headers: { 'X-Install-Id': 'install-anon' } });

    const lines = await server.logsFor('me', (l) => l.data.installId === 'install-anon');
    const line = lines.find((l) => l.data.installId === 'install-anon');

    expect(line, JSON.stringify(lines)).toBeDefined();
    expect(line?.data).toMatchObject({
      route: 'me',
      userId: '',
      installId: 'install-anon',
      status: 401,
      code: 'UNAUTHORIZED',
    });
  });

  it('logs the public routes too', async () => {
    await server.api('GET', '/api/config');
    await server.api('GET', '/api/health');

    expect((await server.logsFor('config')).length).toBeGreaterThan(0);
    expect((await server.logsFor('health')).length).toBeGreaterThan(0);
  });
});

describe('the startup environment check', () => {
  it('says in the log what the process was configured with', async () => {
    // The harness starts the server with SMS_PROVIDER=console and every secret set, so the check
    // should have found nothing wrong.
    const found = await server.asSuperuser<{ items: Array<{ message: string; data: any }> }>(
      'GET',
      `/api/logs?perPage=20&filter=${encodeURIComponent("message='env.ok'")}`,
    );

    expect(found.status).toBe(200);
    expect(found.body.items.length).toBeGreaterThan(0);
    expect(found.body.items[0]?.data.provider).toBe('console');
  });
});
