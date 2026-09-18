// GET /api/config, GET /api/health, GET /api/me, PATCH /api/me/profile (what.md §8.2).

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Server, startServer } from './harness.ts';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let server: Server;

beforeAll(async () => {
  server = await startServer();
});

afterAll(async () => {
  await server?.stop();
});

describe('GET /api/config', () => {
  it('serves the seeded prices to anyone', async () => {
    const response = await server.api('GET', '/api/config');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      listPrice: 450_000,
      salePrice: 290_000,
      freePresentationLimit: 100,
      minAppVersion: '0.1.0',
      supportUrl: '',
      notice: '',
    });
  });
});

describe('GET /api/health', () => {
  it('answers ok with the running version and the time', async () => {
    const response = await server.api<{ ok: boolean; version: string; time: string }>(
      'GET',
      '/api/health',
    );

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.version).toMatch(/^\d+\.\d+\.\d+\+hooks\.\d+$/);
    expect(Number.isNaN(Date.parse(response.body.time))).toBe(false);
  });

  it('reports the pinned PocketBase version', async () => {
    // lib/version.js repeats the pinned tag because the JSVM exposes no runtime accessor for it.
    // This is the guard that keeps the repetition honest.
    const pinned = (await readFile(path.join(serverDir, 'POCKETBASE_VERSION'), 'utf8')).trim();
    const response = await server.api<{ version: string }>('GET', '/api/health');

    expect(response.body.version.split('+')[0]).toBe(pinned);
  });
});

describe('GET /api/me', () => {
  it('is 401 for an anonymous caller', async () => {
    const response = await server.api('GET', '/api/me');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'authentication required' },
    });
  });

  it('is 403 for a superuser token — /api/me is a user route', async () => {
    const response = await server.asSuperuser('GET', '/api/me');

    expect(response.status).toBe(403);
    expect((response.body as any).error.code).toBe('FORBIDDEN');
  });

  it('returns the user, no entitlement, and refreshes lastSeenAt', async () => {
    const user = await server.createUser('+989121110001');

    const before = await server.asSuperuser<{ lastSeenAt: string }>(
      'GET',
      `/api/collections/users/records/${user.id}`,
    );
    expect(before.body.lastSeenAt).toBe('');

    const response = await server.api<any>('GET', '/api/me', { token: user.token });

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({ id: user.id, phone: '+989121110001' });
    expect(response.body.user.profile).toBeNull();
    expect(response.body.entitlement).toEqual({ status: 'none', source: null, grantedAt: null });
    expect(response.body.profileUpdatedAt).toBeNull();

    const after = await server.asSuperuser<{ lastSeenAt: string }>(
      'GET',
      `/api/collections/users/records/${user.id}`,
    );
    expect(after.body.lastSeenAt).not.toBe('');
  });

  it('reports a granted entitlement as full, with its source', async () => {
    const user = await server.createUser('+989121110002');

    const granted = await server.asSuperuser('POST', '/api/collections/entitlements/records', {
      body: {
        user: user.id,
        product: 'full',
        source: 'manual',
        grantedAt: '2026-09-18 10:00:00.000Z',
        note: 'granted by the owner',
      },
    });
    expect(granted.status).toBe(200);

    const response = await server.api<any>('GET', '/api/me', { token: user.token });

    expect(response.body.entitlement.status).toBe('full');
    expect(response.body.entitlement.source).toBe('manual');
    expect(response.body.entitlement.grantedAt).toContain('2026-09-18');
  });
});

describe('PATCH /api/me/profile', () => {
  it('is 401 for an anonymous caller', async () => {
    const response = await server.api('PATCH', '/api/me/profile', {
      body: { profile: { updatedAt: 1 } },
    });

    expect(response.status).toBe(401);
  });

  it('stores a first profile and hands it back', async () => {
    const user = await server.createUser('+989121110003');

    const response = await server.api<any>('PATCH', '/api/me/profile', {
      token: user.token,
      body: { profile: { minutes: 20, goal: 40, fieldCode: '1101', updatedAt: 1000 } },
    });

    expect(response.status).toBe(200);
    expect(response.body.updated).toBe(true);
    expect(response.body.profile).toEqual({
      minutes: 20,
      goal: 40,
      fieldCode: '1101',
      updatedAt: 1000,
    });
  });

  it('newer wins, older is ignored', async () => {
    const user = await server.createUser('+989121110004');

    await server.api('PATCH', '/api/me/profile', {
      token: user.token,
      body: { profile: { goal: 40, updatedAt: 2000 } },
    });

    // An offline device that syncs late must not undo a newer setting.
    const older = await server.api<any>('PATCH', '/api/me/profile', {
      token: user.token,
      body: { profile: { goal: 10, updatedAt: 500 } },
    });
    expect(older.status).toBe(200);
    expect(older.body.updated).toBe(false);
    expect(older.body.profile).toEqual({ goal: 40, updatedAt: 2000 });

    // Same timestamp is not newer either.
    const same = await server.api<any>('PATCH', '/api/me/profile', {
      token: user.token,
      body: { profile: { goal: 99, updatedAt: 2000 } },
    });
    expect(same.body.updated).toBe(false);

    const newer = await server.api<any>('PATCH', '/api/me/profile', {
      token: user.token,
      body: { profile: { goal: 60, updatedAt: 3000 } },
    });
    expect(newer.body.updated).toBe(true);
    expect(newer.body.profile).toEqual({ goal: 60, updatedAt: 3000 });

    const me = await server.api<any>('GET', '/api/me', { token: user.token });
    expect(me.body.user.profile).toEqual({ goal: 60, updatedAt: 3000 });
    expect(me.body.profileUpdatedAt).toBe(3000);
  });

  it('rejects a profile with no updatedAt', async () => {
    const user = await server.createUser('+989121110005');

    const response = await server.api<any>('PATCH', '/api/me/profile', {
      token: user.token,
      body: { profile: { goal: 40 } },
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('BAD_INPUT');
  });

  it('keeps two users apart — the token decides whose profile is written', async () => {
    const one = await server.createUser('+989121110006');
    const two = await server.createUser('+989121110007');

    await server.api('PATCH', '/api/me/profile', {
      token: one.token,
      body: { profile: { goal: 11, updatedAt: 1000 } },
    });
    await server.api('PATCH', '/api/me/profile', {
      token: two.token,
      body: { profile: { goal: 22, updatedAt: 1000 } },
    });

    // The user is taken from the token and from nothing else (§15).
    const first = await server.api<any>('GET', '/api/me', { token: one.token });
    expect(first.body.user.profile.goal).toBe(11);
  });
});
