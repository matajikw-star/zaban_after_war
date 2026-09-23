// The migrations apply to an empty pb_data and produce exactly the collections and API rules of
// what.md §8.1. The rules are the security boundary, so they are asserted literally: a rule that
// silently becomes "" instead of null is the difference between "superuser only" and "anyone".

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Server, startServer } from './harness.ts';

let server: Server;

beforeAll(async () => {
  server = await startServer();
});

afterAll(async () => {
  await server?.stop();
});

interface CollectionInfo {
  name: string;
  type: string;
  listRule: string | null;
  viewRule: string | null;
  createRule: string | null;
  updateRule: string | null;
  deleteRule: string | null;
  indexes: string[];
  fields: Array<Record<string, unknown>>;
  passwordAuth?: { enabled: boolean };
  authToken?: { duration: number };
}

async function collection(name: string): Promise<CollectionInfo> {
  const response = await server.asSuperuser<CollectionInfo>('GET', `/api/collections/${name}`);
  expect(response.status, `GET /api/collections/${name}`).toBe(200);
  return response.body;
}

function rules(c: CollectionInfo) {
  return [c.listRule, c.viewRule, c.createRule, c.updateRule, c.deleteRule];
}

function fieldNames(c: CollectionInfo) {
  return c.fields.map((f) => f.name as string);
}

describe('migrations', () => {
  it('creates every collection of §8.1', async () => {
    const response = await server.asSuperuser<{ items: Array<{ name: string }> }>(
      'GET',
      '/api/collections?perPage=200',
    );
    const names = response.body.items.map((item) => item.name);

    for (const expected of [
      'users',
      'review_events',
      'entitlements',
      'payments',
      'discount_codes',
      'otp_codes',
      'word_flags',
      'beacons',
      'client_errors',
      'app_config',
    ]) {
      expect(names, expected).toContain(expected);
    }
  });

  it('makes users a phone-identified auth collection with no password login', async () => {
    const users = await collection('users');

    expect(users.type).toBe('auth');
    expect(rules(users)).toEqual([
      '@request.auth.id = id',
      '@request.auth.id = id',
      null,
      null,
      null,
    ]);
    expect(users.passwordAuth?.enabled).toBe(false);
    // 365 days: a student should not be logged out between two exam seasons.
    expect(users.authToken?.duration).toBe(31_536_000);
    expect(fieldNames(users)).toEqual(expect.arrayContaining(['phone', 'profile', 'lastSeenAt']));
    expect(users.indexes).toContain('CREATE UNIQUE INDEX `idx_users_phone` ON `users` (`phone`)');

    const phone = users.fields.find((f) => f.name === 'phone');
    expect(phone?.required).toBe(true);
    expect(phone?.pattern).toBe('^\\+[1-9]\\d{7,14}$');

    // The OTP flow creates a user from a phone alone, so email must not be required.
    expect(users.fields.find((f) => f.name === 'email')?.required).toBe(false);
  });

  it('widens review_events.id to a 36-char device-minted UUIDv7', async () => {
    const events = await collection('review_events');

    const id = events.fields.find((f) => f.name === 'id');
    expect(id?.type).toBe('text');
    expect(id?.primaryKey).toBe(true);
    expect(id?.min).toBe(36);
    expect(id?.max).toBe(36);
    expect(id?.pattern).toBe('^[0-9a-f-]{36}$');
    // Never server-generated: an event without a device id is not an event.
    expect(id?.autogeneratePattern).toBe('');

    // No direct API access — only the sync routes.
    expect(rules(events)).toEqual([null, null, null, null, null]);
    expect(events.indexes).toContain(
      'CREATE INDEX `idx_review_events_user_created` ON `review_events` (`user`, `created`)',
    );
  });

  it('gives each collection the rules §8.1 specifies', async () => {
    // view-own, write-by-hook.
    for (const name of ['entitlements', 'payments']) {
      const c = await collection(name);
      expect(rules(c), name).toEqual([
        '@request.auth.id = user',
        '@request.auth.id = user',
        null,
        null,
        null,
      ]);
    }

    // Nothing through the REST API at all.
    for (const name of ['discount_codes', 'otp_codes', 'word_flags', 'beacons', 'client_errors']) {
      const c = await collection(name);
      expect(rules(c), name).toEqual([null, null, null, null, null]);
    }

    // Public read, superuser write.
    const config = await collection('app_config');
    expect(rules(config)).toEqual(['', '', null, null, null]);
  });

  it('indexes the lookups the routes will do', async () => {
    const codes = await collection('discount_codes');
    expect(codes.indexes).toContain(
      'CREATE UNIQUE INDEX `idx_discount_codes_code` ON `discount_codes` (`code`)',
    );

    const otp = await collection('otp_codes');
    expect(otp.indexes).toContain('CREATE INDEX `idx_otp_codes_phone` ON `otp_codes` (`phone`)');
  });

  it('seeds one app_config record', async () => {
    const records = await server.asSuperuser<{ totalItems: number; items: any[] }>(
      'GET',
      '/api/collections/app_config/records',
    );

    expect(records.body.totalItems).toBe(1);
    expect(records.body.items[0]).toMatchObject({
      listPrice: 450_000,
      salePrice: 290_000,
      freePresentationLimit: 100,
      minAppVersion: '0.1.0',
    });
  });

  it('refuses an anonymous read of a hooks-only collection', async () => {
    // The rules, not the routes, are the boundary — so check them from outside. A null list rule
    // makes PocketBase answer 403 ("only superusers can perform this action"), not 404: the
    // collection exists, it is simply not reachable this way.
    for (const name of ['review_events', 'otp_codes', 'discount_codes', 'client_errors']) {
      const response = await server.api('GET', `/api/collections/${name}/records`);
      expect(response.status, name).toBe(403);
    }
  });

  it('lets anyone read app_config through the collection API', async () => {
    const response = await server.api<{ totalItems: number }>(
      'GET',
      '/api/collections/app_config/records',
    );
    expect(response.status).toBe(200);
    expect(response.body.totalItems).toBe(1);
  });
});
