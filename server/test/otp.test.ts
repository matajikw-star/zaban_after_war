// POST /api/otp/request and /api/otp/verify against a real PocketBase (what.md §8.2, §15; ticket
// dev-server/02). Every test uses its own phone and its own client IP (X-Forwarded-For, which the
// trustedProxy migration makes PocketBase believe), so the rate limits of one test never leak
// into another.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Server, startServer } from './harness.ts';

let server: Server;

beforeAll(async () => {
  server = await startServer();
});

afterAll(async () => {
  await server?.stop();
});

function request(s: Server, phone: string, ip: string) {
  return s.api<any>('POST', '/api/otp/request', {
    body: { phone },
    headers: { 'X-Forwarded-For': ip },
  });
}

function verify(s: Server, phone: string, code: string, ip: string) {
  return s.api<any>('POST', '/api/otp/verify', {
    body: { phone, code },
    headers: { 'X-Forwarded-For': ip },
  });
}

/**
 * The console provider prints `sms.console phone=+98…1234 code=12345`. Each test's phone has its
 * own last four digits, so the masked form is enough to find its line; the last one wins.
 */
async function codeFor(s: Server, e164: string): Promise<string> {
  const masked = `${e164.slice(0, 3)}…${e164.slice(-4)}`;
  const pattern = new RegExp(`sms\\.console phone=${masked.replace('+', '\\+')} code=(\\d+)`, 'g');
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const matches = [...s.output().matchAll(pattern)];
    const last = matches.at(-1);
    if (last?.[1]) return last[1];
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`no console code for ${masked}`);
}

describe('happy path with the console provider', () => {
  it('requests, verifies, and returns a working 365-day token', async () => {
    const ip = '10.1.0.1';
    const requested = await request(server, '09121110001', ip);
    expect(requested.status).toBe(200);
    expect(requested.body).toEqual({ ok: true, retryAfter: 0 });

    const code = await codeFor(server, '+989121110001');
    expect(code).toMatch(/^\d{5}$/);

    // Persian digits on the way back in: the same phone, normalised the same way.
    const verified = await verify(server, '۰۹۱۲۱۱۱۰۰۰۱', code, ip);
    expect(verified.status).toBe(200);
    expect(typeof verified.body.token).toBe('string');
    expect(verified.body.record.phone).toBe('+989121110001');
    expect(verified.body.record.collectionName).toBe('users');
    // Public fields only.
    expect(verified.body.record.password).toBeUndefined();
    expect(verified.body.record.tokenKey).toBeUndefined();

    const payload = JSON.parse(
      Buffer.from(verified.body.token.split('.')[1], 'base64url').toString('utf8'),
    );
    const lifetime = payload.exp - Math.floor(Date.now() / 1000);
    expect(lifetime).toBeGreaterThan(365 * 86400 - 120);
    expect(lifetime).toBeLessThanOrEqual(365 * 86400);

    const me = await server.api<any>('GET', '/api/me', { token: verified.body.token });
    expect(me.status).toBe(200);
    expect(me.body.user.id).toBe(verified.body.record.id);
  });

  it('stores the code hashed, never in the clear', async () => {
    const ip = '10.1.0.2';
    await request(server, '09121110002', ip);
    const code = await codeFor(server, '+989121110002');

    const filter = encodeURIComponent("phone='+989121110002'");
    const rows = await server.asSuperuser<any>(
      'GET',
      `/api/collections/otp_codes/records?filter=${filter}`,
    );
    expect(rows.body.items).toHaveLength(1);
    const stored: string = rows.body.items[0].codeHash;
    expect(stored).toMatch(/^[A-Za-z0-9]+\$[0-9a-f]{64}$/);
    expect(stored).not.toContain(code);
    expect(rows.body.items[0].ip).toBe(ip);
  });

  it('a code works once', async () => {
    const ip = '10.1.0.3';
    await request(server, '09121110003', ip);
    const code = await codeFor(server, '+989121110003');

    expect((await verify(server, '09121110003', code, ip)).status).toBe(200);
    const replay = await verify(server, '09121110003', code, ip);
    expect(replay.status).toBe(400);
    expect(replay.body.error.code).toBe('OTP_EXPIRED');
  });

  it('a second login finds the same user', async () => {
    const ip = '10.1.0.4';
    await request(server, '09121110004', ip);
    const first = await verify(server, '09121110004', await codeFor(server, '+989121110004'), ip);
    expect(first.status).toBe(200);

    await request(server, '+989121110004', ip);
    const second = await verify(
      server,
      '+989121110004',
      await codeFor(server, '+989121110004'),
      ip,
    );
    expect(second.status).toBe(200);
    expect(second.body.record.id).toBe(first.body.record.id);

    const filter = encodeURIComponent("phone='+989121110004'");
    const users = await server.asSuperuser<any>(
      'GET',
      `/api/collections/users/records?filter=${filter}`,
    );
    expect(users.body.items).toHaveLength(1);
  });

  it('only the latest code is accepted', async () => {
    const ip = '10.1.0.5';
    await request(server, '09121110005', ip);
    const older = await codeFor(server, '+989121110005');
    await request(server, '09121110005', ip);
    const newer = await codeFor(server, '+989121110005');

    if (older !== newer) {
      const stale = await verify(server, '09121110005', older, ip);
      expect(stale.body.error.code).toBe('OTP_WRONG');
    }
    expect((await verify(server, '09121110005', newer, ip)).status).toBe(200);
  });
});

describe('wrong codes', () => {
  it('five wrong codes lock it, and then even the right code fails', async () => {
    const ip = '10.2.0.1';
    await request(server, '09121120001', ip);
    const code = await codeFor(server, '+989121120001');
    const wrong = code === '00000' ? '11111' : '00000';

    for (const left of [4, 3, 2, 1, 0]) {
      const response = await verify(server, '09121120001', wrong, ip);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('OTP_WRONG');
      expect(response.body.attemptsLeft).toBe(left);
    }

    const locked = await verify(server, '09121120001', code, ip);
    expect(locked.status).toBe(400);
    expect(locked.body.error.code).toBe('OTP_LOCKED');
  });

  it('a code that is not 5-6 digits is BAD_INPUT and spends no attempt', async () => {
    const ip = '10.2.0.2';
    await request(server, '09121120002', ip);
    const code = await codeFor(server, '+989121120002');

    for (const bad of ['abcde', '1234', '1234567']) {
      const response = await verify(server, '09121120002', bad, ip);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('BAD_INPUT');
    }
    expect((await verify(server, '09121120002', code, ip)).status).toBe(200);
  });

  it('logs the failure with the phone masked and the code hashed', async () => {
    const ip = '10.2.0.3';
    await verify(server, '09121120003', '99999', ip);

    const lines = await server.logsFor(
      'otp.verify',
      (line) => line.data.code === 'OTP_EXPIRED' && String(line.data.input).includes('0003'),
    );
    const line = lines.find((l) => String(l.data.input).includes('0003'));
    expect(line).toBeDefined();
    const input = JSON.parse(line?.data.input);
    expect(input.phone).toBe('091…0003');
    expect(input.code).toMatch(/^sha256:/);
    expect(JSON.stringify(line)).not.toContain('09121120003');
  });
});

describe('expiry', () => {
  it('an expired code is refused', async () => {
    const ip = '10.3.0.1';
    await request(server, '09121130001', ip);
    const code = await codeFor(server, '+989121130001');

    const filter = encodeURIComponent("phone='+989121130001'");
    const rows = await server.asSuperuser<any>(
      'GET',
      `/api/collections/otp_codes/records?filter=${filter}`,
    );
    const past = new Date(Date.now() - 1000).toISOString().replace('T', ' ');
    const patched = await server.asSuperuser(
      'PATCH',
      `/api/collections/otp_codes/records/${rows.body.items[0].id}`,
      { body: { expiresAt: past } },
    );
    expect(patched.status).toBe(200);

    const response = await verify(server, '09121130001', code, ip);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('OTP_EXPIRED');
  });

  it('no code requested is OTP_EXPIRED, not a hint about the account', async () => {
    const response = await verify(server, '09121130002', '12345', '10.3.0.2');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('OTP_EXPIRED');
  });
});

describe('rate limits', () => {
  it('3 per phone per 10 minutes, then 429 with retryAfter', async () => {
    const ip = '10.4.0.1';
    const answers = [];
    for (let i = 0; i < 3; i++) answers.push(await request(server, '09121140001', ip));
    expect(answers.map((a) => a.status)).toEqual([200, 200, 200]);
    expect(answers[0]?.body.retryAfter).toBe(0);
    // The third fills the window: the answer already says when the next one is allowed.
    expect(answers[2]?.body.retryAfter).toBeGreaterThan(590);

    const limited = await request(server, '09121140001', '10.4.0.2');
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(limited.body.retryAfter).toBeGreaterThan(590);
    expect(limited.body.retryAfter).toBeLessThanOrEqual(600);

    // Same limit whatever spelling the phone arrives in.
    const respelled = await request(server, '+989121140001', '10.4.0.3');
    expect(respelled.status).toBe(429);
  });

  it('sends the Retry-After header with the same number', async () => {
    const ip = '10.4.0.4';
    for (let i = 0; i < 3; i++) await request(server, '09121140004', ip);

    const response = await fetch(`${server.url}/api/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
      body: JSON.stringify({ phone: '09121140004' }),
    });
    expect(response.status).toBe(429);
    const body = await response.json();
    expect(response.headers.get('retry-after')).toBe(String(body.retryAfter));
  });

  it('10 per IP per hour, then 429 with retryAfter', async () => {
    const ip = '10.4.0.5';
    const phones = [
      '09121150001',
      '09121150002',
      '09121150003',
      '09121150004',
      '09121150005',
      '09121150006',
      '09121150007',
      '09121150008',
      '09121150009',
      '09121150010',
    ];
    for (const phone of phones) {
      expect((await request(server, phone, ip)).status).toBe(200);
    }

    const limited = await request(server, '09121150011', ip);
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(limited.body.retryAfter).toBeGreaterThan(3500);
    expect(limited.body.retryAfter).toBeLessThanOrEqual(3600);

    // Another IP is not affected.
    expect((await request(server, '09121150011', '10.4.0.6')).status).toBe(200);
  });

  it('a refused request writes nothing', async () => {
    const filter = encodeURIComponent("phone='+989121150011'");
    const rows = await server.asSuperuser<any>(
      'GET',
      `/api/collections/otp_codes/records?filter=${filter}`,
    );
    // Only the one from 10.4.0.6 in the previous test.
    expect(rows.body.items).toHaveLength(1);
  });
});

describe('phone normalisation', () => {
  // verify normalises before looking anything up, so OTP_EXPIRED ("no code for this phone")
  // proves a spelling was accepted — without spending the request quota.
  const accepted = [
    '09121160001',
    '9121160001',
    '+989121160001',
    '00989121160001',
    '۰۹۱۲۱۱۶۰۰۰۱',
    '٠٩١٢١١٦٠٠٠١',
    '0912 116 0001',
    '0912-116-0001',
  ];
  for (const phone of accepted) {
    it(`accepts ${phone}`, async () => {
      const response = await verify(server, phone, '12345', '10.5.0.1');
      expect(response.body.error.code).toBe('OTP_EXPIRED');
    });
  }

  const rejected = [
    '02112345678',
    '+14155552671',
    '989121160001',
    '0912116000',
    '091211600011',
    '08121160001',
    'abc',
    '+98 21 1234 5678',
  ];
  for (const phone of rejected) {
    it(`rejects ${phone}`, async () => {
      const response = await request(server, phone, '10.5.0.2');
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('PHONE_INVALID');
    });
  }

  it('an empty phone is BAD_INPUT', async () => {
    const response = await request(server, '', '10.5.0.3');
    expect(response.body.error.code).toBe('BAD_INPUT');
  });
});

describe('the purge cron', () => {
  it('deletes rows expired over an hour ago and keeps the rest', async () => {
    const pb = (ms: number) => new Date(ms).toISOString().replace('T', ' ');
    const make = (phone: string, expiresAt: string) =>
      server.asSuperuser<any>('POST', '/api/collections/otp_codes/records', {
        body: { phone, codeHash: 'salt$hash', expiresAt, attempts: 0, ip: '10.6.0.1' },
      });

    const old = await make('+989121170001', pb(Date.now() - 2 * 3600_000));
    const recent = await make('+989121170002', pb(Date.now() - 30 * 60_000));
    expect(old.status).toBe(200);
    expect(recent.status).toBe(200);

    const run = await server.asSuperuser('POST', '/api/crons/otp_purge');
    expect(run.status).toBe(204);

    // PocketBase answers 204 and runs the job in the background, so poll until the old row is gone.
    const status = (id: string) =>
      server.asSuperuser('GET', `/api/collections/otp_codes/records/${id}`).then((r) => r.status);
    const deadline = Date.now() + 5000;
    while ((await status(old.body.id)) !== 404 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(await status(old.body.id)).toBe(404);
    expect(
      (await server.asSuperuser('GET', `/api/collections/otp_codes/records/${recent.body.id}`))
        .status,
    ).toBe(200);
  });
});

describe('the mock provider', () => {
  let mock: Server;

  beforeAll(async () => {
    mock = await startServer({ env: { SMS_PROVIDER: 'mock' } });
  });

  afterAll(async () => {
    await mock?.stop();
  });

  it('accepts 123456 and nothing else', async () => {
    const ip = '10.7.0.1';
    expect((await request(mock, '09121180001', ip)).status).toBe(200);

    const wrong = await verify(mock, '09121180001', '12345', ip);
    expect(wrong.body.error.code).toBe('OTP_WRONG');
    const wrong6 = await verify(mock, '09121180001', '654321', ip);
    expect(wrong6.body.error.code).toBe('OTP_WRONG');

    const right = await verify(mock, '09121180001', '123456', ip);
    expect(right.status).toBe(200);
    expect(right.body.record.phone).toBe('+989121180001');

    // Nothing printed: mock never reveals a code, because there is none to reveal.
    expect(mock.output()).not.toContain('sms.console');
  });

  it('says so in the log', async () => {
    const found = await mock.asSuperuser<any>(
      'GET',
      `/api/logs?perPage=50&filter=${encodeURIComponent("message='sms.send'")}`,
    );
    const deadline = Date.now() + 15_000;
    let items = found.body.items ?? [];
    while (items.length === 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      const again = await mock.asSuperuser<any>(
        'GET',
        `/api/logs?perPage=50&filter=${encodeURIComponent("message='sms.send'")}`,
      );
      items = again.body.items ?? [];
    }
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].data['sms.provider']).toBe('mock');
    expect(JSON.stringify(items)).not.toContain('09121180001');
  });
});

describe('a misconfigured provider', () => {
  let bad: Server;

  beforeAll(async () => {
    bad = await startServer({ env: { SMS_PROVIDER: 'bogus' } });
  });

  afterAll(async () => {
    await bad?.stop();
  });

  it('fails loudly with SMS_PROVIDER_UNKNOWN and writes no code', async () => {
    const response = await request(bad, '09121190001', '10.8.0.1');
    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('SMS_PROVIDER_UNKNOWN');

    const rows = await bad.asSuperuser<any>('GET', '/api/collections/otp_codes/records');
    expect(rows.body.items).toHaveLength(0);
  });
});

describe('kavenegar without a key', () => {
  // Never a real Kavenegar call from a test: with no key the provider refuses before any network.
  let kv: Server;

  beforeAll(async () => {
    kv = await startServer({ env: { SMS_PROVIDER: 'kavenegar', SMS_API_KEY: '' } });
  });

  afterAll(async () => {
    await kv?.stop();
  });

  it('answers SMS_FAILED', async () => {
    const response = await request(kv, '09121200001', '10.9.0.1');
    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe('SMS_FAILED');
  });
});

describe('kavenegar unreachable', () => {
  // A closed local port instead of Kavenegar: the transport error Go raises quotes the full URL,
  // and the URL carries the API key. None of it may reach the log or stdout.
  const KEY = 'TEST-KEY-must-never-be-logged';
  let kv: Server;

  beforeAll(async () => {
    kv = await startServer({
      env: { SMS_PROVIDER: 'kavenegar', SMS_API_KEY: KEY, SMS_API_BASE: 'http://127.0.0.1:1' },
    });
  });

  afterAll(async () => {
    await kv?.stop();
  });

  it('answers SMS_FAILED and never logs the API key', async () => {
    const response = await request(kv, '09121200002', '10.9.0.2');
    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe('SMS_FAILED');
    expect(JSON.stringify(response.body)).not.toContain(KEY);

    const lines = await kv.logsFor('otp.request');
    expect(lines.length).toBeGreaterThan(0);
    expect(JSON.stringify(lines)).not.toContain(KEY);
    expect(kv.output()).not.toContain(KEY);
  });
});
