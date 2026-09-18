import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setClockForTests } from '../engine/clock.ts';
import { type AppError, isAppError } from '../errors.ts';
import { breadcrumbs, clearBreadcrumbs } from '../log/breadcrumbs.ts';
import { useAuthStore } from '../stores/auth.ts';
import { contentPaid, health, me, otpRequest, syncPush } from './api.ts';

const T0 = 1_760_000_000_000;

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

/**
 * A `fetch` double whose call signature is declared, so the test can read back the `init` the
 * caller passed. `vi.fn(async () => …)` infers an empty parameter tuple and the headers become
 * unreachable.
 */
function fetchDouble(handler: (input: string, init?: RequestInit) => Promise<Response>) {
  return vi.fn(handler);
}

function headersOf(mock: ReturnType<typeof fetchDouble>): Record<string, string> {
  return (mock.mock.calls[0]?.[1]?.headers ?? {}) as Record<string, string>;
}

/** Asserts the call rejected, and hands the error back typed. */
async function rejection(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (err) {
    if (isAppError(err)) return err;
    throw err;
  }
  throw new Error('expected the call to reject');
}

beforeEach(() => {
  setClockForTests(() => T0);
  clearBreadcrumbs();
  useAuthStore.setState({ token: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
  setClockForTests(null);
  clearBreadcrumbs();
});

describe('request', () => {
  it('parses a successful JSON body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(200, { ok: true, version: '1.0.0', time: T0 })),
    );

    await expect(health()).resolves.toEqual({ ok: true, version: '1.0.0', time: T0 });
  });

  it('logs a net breadcrumb with the method, route, status and duration', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(200, { ok: true })),
    );

    await health();

    const crumb = breadcrumbs().find((entry) => entry.type === 'net');
    expect(crumb?.msg).toBe('request');
    expect(crumb?.data).toEqual({ method: 'GET', route: '/api/health', status: 200, ms: 0 });
  });

  it('attaches the bearer token from the auth store', async () => {
    const fetchMock = fetchDouble(async () => jsonResponse(200, {}));
    vi.stubGlobal('fetch', fetchMock);
    useAuthStore.setState({ token: 'tok-123' });

    await me();

    expect(headersOf(fetchMock).authorization).toBe('Bearer tok-123');
  });

  it('sends no authorization header on a public route', async () => {
    const fetchMock = fetchDouble(async () => jsonResponse(200, { ok: true, retryAfter: 0 }));
    vi.stubGlobal('fetch', fetchMock);
    useAuthStore.setState({ token: 'tok-123' });

    await otpRequest('09120000000');

    expect(headersOf(fetchMock).authorization).toBeUndefined();
    expect(headersOf(fetchMock)['content-type']).toBe('application/json');
  });

  it('hands back the raw Response for the streamed paid package', async () => {
    const response = new Response('{}', { status: 206 });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response),
    );

    await expect(contentPaid(100)).resolves.toBe(response);
  });

  it('sets a Range header when resuming', async () => {
    const fetchMock = fetchDouble(async () => new Response('{}', { status: 206 }));
    vi.stubGlobal('fetch', fetchMock);

    await contentPaid(4096);

    expect(headersOf(fetchMock).range).toBe('bytes=4096-');
  });
});

describe('AppError mapping', () => {
  it('maps a rejected fetch to NETWORK', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    const err = await rejection(health());
    expect(err.code).toBe('NETWORK');
    // A status of 0 is what distinguishes "never left the device" in the breadcrumb trail.
    expect(breadcrumbs().find((c) => c.type === 'net')?.data).toMatchObject({ status: 0 });
  });

  it('maps 401 to UNAUTHORIZED', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(401, { error: { code: 'bad_token' } })),
    );

    const err = await rejection(me());
    // UNAUTHORIZED wins over the body's code: the caller's response is to re-login, whatever
    // the server called it.
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('maps 429 to RATE_LIMITED with retryAfter from the header', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(429, {}, { 'retry-after': '120' })),
    );

    const err = await rejection(otpRequest('09120000000'));
    expect(err.code).toBe('RATE_LIMITED');
    expect(err.data).toMatchObject({ retryAfter: 120 });
  });

  it('falls back to retryAfter in the body when the header is absent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(429, { retryAfter: 45 })),
    );

    const err = await rejection(otpRequest('09120000000'));
    expect(err.code).toBe('RATE_LIMITED');
    expect(err.data).toMatchObject({ retryAfter: 45 });
  });

  it('reports a null retryAfter rather than guessing one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(429, {})),
    );

    const err = await rejection(otpRequest('09120000000'));
    expect(err.data).toMatchObject({ retryAfter: null });
  });

  it('maps a {error:{code}} body to SERVER_<CODE>', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(400, { error: { code: 'invalid_phone', message: 'شمارهٔ نامعتبر' } }),
      ),
    );

    const err = await rejection(otpRequest('nope'));
    expect(err.code).toBe('SERVER_INVALID_PHONE');
    expect(err.message).toBe('شمارهٔ نامعتبر');
  });

  it('maps a coded error on a 500 too', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(500, { error: { code: 'zarinpal_down' } })),
    );

    expect((await rejection(syncPush([]))).code).toBe('SERVER_ZARINPAL_DOWN');
  });

  it('maps an uncoded failure to HTTP_<status>', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(503, {})),
    );

    expect((await rejection(health())).code).toBe('HTTP_503');
  });

  it('maps a non-JSON error body to HTTP_<status> without throwing on the parse', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>502</html>', { status: 502 })),
    );

    const err = await rejection(health());
    expect(err.code).toBe('HTTP_502');
  });

  it('carries the route and the status as data on every mapped error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(404, {})),
    );

    const err = await rejection(me());
    expect(err.data).toMatchObject({ route: '/api/me', status: 404 });
  });
});
