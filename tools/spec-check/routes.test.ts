import { describe, expect, it } from 'vitest';
import { normalizeRoutePath, parseHookRoutes, parseWhatRoutes, routeKey } from './routes.ts';

describe('normalizeRoutePath', () => {
  it('drops a query string', () => {
    expect(normalizeRoutePath('/api/sync/pull?since=&limit=')).toBe('/api/sync/pull');
  });

  it('normalizes both :param and {param} spellings to the same token', () => {
    expect(normalizeRoutePath('/api/pay/status/:id')).toBe('/api/pay/status/:param');
    expect(normalizeRoutePath('/api/pay/status/{id}')).toBe('/api/pay/status/:param');
    expect(normalizeRoutePath('/api/admin/sourcemap/:sha/:file')).toBe(
      '/api/admin/sourcemap/:param/:param',
    );
    expect(normalizeRoutePath('/api/admin/sourcemap/{sha}/{file}')).toBe(
      '/api/admin/sourcemap/:param/:param',
    );
  });
});

describe('parseWhatRoutes', () => {
  const section = [
    'prose above the table',
    '',
    '| Route | Auth | Body → Response | |',
    '|---|---|---|---|',
    '| `GET /api/config` | none | stuff | `[live]` |',
    '| `GET /api/admin/stats?range=` | superuser | stuff | `[planned]` |',
    '| `GET /api/pay/status/:id` | user | stuff | `[live]` |',
    '',
    '| Rule label | Limit per IP | Why |',
    '|---|---|---|',
    '| `POST /api/beacon` | 300 / hour | reason |',
  ].join('\n');

  it('reads method and path from the Route table only, not the rate-limit table', () => {
    const routes = parseWhatRoutes(section);
    expect(routes.map((r) => routeKey(r))).toEqual([
      'GET /api/config',
      'GET /api/admin/stats',
      'GET /api/pay/status/:param',
    ]);
  });

  it('marks a [planned] row as skip, and a [live] row as not skip', () => {
    const routes = parseWhatRoutes(section);
    expect(routes.find((r) => r.path === '/api/config')?.skip).toBe(false);
    expect(routes.find((r) => r.path === '/api/admin/stats')?.skip).toBe(true);
  });
});

describe('parseHookRoutes', () => {
  it('reads a routerAdd call', () => {
    const files = [
      {
        name: 'otp.pb.js',
        content: `routerAdd('POST', '/api/otp/request', (e) => {});`,
      },
    ];
    expect(parseHookRoutes(files).map(routeKey)).toEqual(['POST /api/otp/request']);
  });

  it('reads the health route from its routerUse method/path guard', () => {
    const files = [
      {
        name: 'core.pb.js',
        content: `
routerUse((e) => {
  if (e.request.method !== 'GET' || e.request.url.path !== '/api/health') {
    return e.next();
  }
  return withRoute('health', () => ({ ok: true }), { auth: 'none' })(e);
});
`,
      },
    ];
    expect(parseHookRoutes(files).map(routeKey)).toEqual(['GET /api/health']);
  });

  it('normalizes a {param} path the same way as the what.md side', () => {
    const files = [
      {
        name: 'pay.pb.js',
        content: `routerAdd('GET', '/api/pay/status/{id}', (e) => {});`,
      },
    ];
    expect(parseHookRoutes(files).map(routeKey)).toEqual(['GET /api/pay/status/:param']);
  });
});
