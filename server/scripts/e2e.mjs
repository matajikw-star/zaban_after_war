// The PocketBase the Playwright suite talks to: `pnpm --filter @kl/server pb:e2e`.
//
// Started by apps/web/playwright.config.ts as a `webServer`, twice, each on its own port, its own
// throwaway pb_data (OS temp dir, deleted when the process exits) and behind its own
// `vite preview`, whose /api proxy makes the built app call its API same-origin, as behind Caddy:
//
// - **Gated** (the default; 127.0.0.1:8091 behind preview :4173). SMS_PROVIDER=mock: the code is
//   always 123456 and nothing is sent, so every /api/pay/* route and the paid download answer 503
//   PAYMENT_DISABLED_MOCK_SMS (what.md §8.2) — exactly what staging runs.
// - **Payment** (`KL_E2E_PAYMENT=1`; 127.0.0.1:8092 behind preview :4174, ticket dev-payment/01
//   part B). SMS_PROVIDER=console: the OTP is printed to stdout as `sms.console phone=… code=…`,
//   and this script copies stdout to `KL_E2E_PB_LOG` so the spec can read it (e2e/pay-server.ts).
//   ZARINPAL_PROVIDER=mock: `pay/request`'s gateway URL is our own callback. CONTENT_DIR is
//   server/content, which `pnpm content:build` fills. Once PocketBase answers, the prices and
//   discount codes in `KL_E2E_PAY_SEED` are written through the superuser API, and only then is
//   `kl-e2e payment server ready` printed — the line Playwright waits for, so no spec ever sees
//   an unseeded server. Nothing here is reachable from production code.
//
// A fixed superuser is upserted before `serve` starts (same CLI call `server/test/harness.ts`
// uses) — `errors.spec.ts` needs one to call the superuser-only sourcemap route and to prove
// `tools/errors` symbolicates against this same throwaway PocketBase (ticket dev-server/04).

import { execFile, spawn } from 'node:child_process';
import { createWriteStream, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { ensurePocketBase, serverDir } from './download-pocketbase.mjs';

const execFileAsync = promisify(execFile);

const HOST = process.env.KL_E2E_PB_HOST ?? '127.0.0.1:8091';
const APP_ORIGIN = process.env.KL_E2E_APP_ORIGIN ?? 'http://127.0.0.1:4173';
const PAYMENT = process.env.KL_E2E_PAYMENT === '1';

/** Also used by `apps/web/e2e/errors.spec.ts` and `tools/errors`' own local-build proof. */
export const E2E_SUPERUSER_EMAIL = 'e2e@konkurleitner.local';
export const E2E_SUPERUSER_PASSWORD = 'e2e-superuser-password-1234567890';

const binary = await ensurePocketBase();
const dataDir = mkdtempSync(path.join(tmpdir(), 'kl-pb-e2e-'));
const migrationsDir = path.join(serverDir, 'pb_migrations');

// Applies the migrations to the fresh dir and creates the superuser, exactly like
// `server/test/harness.ts` — so a failing migration fails here, not as a mystery later.
await execFileAsync(
  binary,
  [
    'superuser',
    'upsert',
    E2E_SUPERUSER_EMAIL,
    E2E_SUPERUSER_PASSWORD,
    '--dir',
    dataDir,
    '--migrationsDir',
    migrationsDir,
  ],
  { env: process.env },
);

const modeEnv = PAYMENT
  ? {
      SMS_PROVIDER: 'console',
      ZARINPAL_PROVIDER: 'mock',
      // Through the preview's proxy, as production's callback goes through Caddy: the app's own
      // origin, which hands it to this PocketBase's /api/pay/callback.
      ZARINPAL_CALLBACK_URL: `${APP_ORIGIN}/api/pay/callback`,
      // Forward slashes: lib/content.js joins with '/', which Go accepts on Windows too.
      CONTENT_DIR: path.join(serverDir, 'content').replaceAll('\\', '/'),
    }
  : { SMS_PROVIDER: 'mock' };

const child = spawn(
  binary,
  [
    'serve',
    `--http=${HOST}`,
    '--dir',
    dataDir,
    '--hooksDir',
    path.join(serverDir, 'pb_hooks'),
    '--migrationsDir',
    migrationsDir,
  ],
  {
    env: { ...process.env, ...modeEnv, PUBLIC_APP_ORIGIN: APP_ORIGIN },
    stdio: PAYMENT ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  },
);

if (PAYMENT) {
  // Truncated at every start, so a line from an earlier run can never answer this run's spec.
  const log = process.env.KL_E2E_PB_LOG ? createWriteStream(process.env.KL_E2E_PB_LOG) : null;
  child.stdout.on('data', (chunk) => {
    process.stdout.write(chunk);
    log?.write(chunk);
  });
}

function cleanup() {
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    // Windows may still hold the SQLite files for a moment; the OS temp dir is cleaned anyway.
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    child.kill();
  });
}

child.on('exit', (code) => {
  cleanup();
  process.exit(code ?? 0);
});

if (PAYMENT) {
  try {
    await seed();
    console.log('kl-e2e payment server ready');
  } catch (error) {
    console.error(`kl-e2e: seeding the payment server failed: ${error?.stack ?? error}`);
    child.kill();
  }
}

async function call(method, route, body, token) {
  const response = await fetch(`http://${HOST}${route}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: token } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${route} → ${response.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

async function waitForHealth() {
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      const response = await fetch(`http://${HOST}/api/health`);
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    if (Date.now() > deadline) throw new Error('PocketBase did not answer /api/health in 60 s');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/**
 * `KL_E2E_PAY_SEED` = `{listPrice, salePrice, codes: [{code, type, value}]}`, owned by
 * `apps/web/e2e/pay-server.ts`. One superuser login for the whole run: `_superusers:auth` is
 * limited to 3 per 10 s per IP (1758800000_rate_limits.js), which a login per spec would trip.
 */
async function seed() {
  const fixtures = JSON.parse(process.env.KL_E2E_PAY_SEED ?? '{}');
  await waitForHealth();
  const auth = await call('POST', '/api/collections/_superusers/auth-with-password', {
    identity: E2E_SUPERUSER_EMAIL,
    password: E2E_SUPERUSER_PASSWORD,
  });
  const config = await call('GET', '/api/collections/app_config/records', undefined, auth.token);
  await call(
    'PATCH',
    `/api/collections/app_config/records/${config.items[0].id}`,
    { listPrice: fixtures.listPrice, salePrice: fixtures.salePrice },
    auth.token,
  );
  for (const code of fixtures.codes ?? []) {
    await call(
      'POST',
      '/api/collections/discount_codes/records',
      {
        ...code,
        // Every test signs in as a new phone, so once per user costs nothing and is realistic;
        // the ceiling is out of reach of a --repeat-each run.
        perUserOnce: true,
        maxUses: 1_000_000,
        usedCount: 0,
        active: true,
      },
      auth.token,
    );
  }
}
