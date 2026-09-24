// Third of what.md §16.2's planned specs: "an error is captured and symbolicates" (ticket
// dev-server/04). A deliberate throw in the real built app is captured by `log/errors.ts`,
// queued in the outbox, and reaches the local e2e PocketBase without any login — the anonymous
// outbox drain this ticket added (backup.ts, §19). Then the real `tools/errors` CLI is run
// against that same PocketBase and must print a resolved (un-minified) source location, proving
// it fetched the sourcemap through `/api/admin/sourcemap` and used it correctly. Never against
// the real server: KL_API_ORIGIN below always points at 127.0.0.1:8091, this spec's own e2e
// PocketBase.

import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect, test } from '@playwright/test';
import { seedProfile } from './helpers.ts';

const execFileAsync = promisify(execFile);

const PB_URL = 'http://127.0.0.1:8091';
// Must match server/scripts/e2e.mjs's E2E_SUPERUSER_EMAIL / E2E_SUPERUSER_PASSWORD. Not imported
// from there: that file's top level spawns a PocketBase process as a side effect of being loaded.
const SUPERUSER_EMAIL = 'e2e@konkurleitner.local';
const SUPERUSER_PASSWORD = 'e2e-superuser-password-1234567890';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

const MESSAGE = 'kl-deliberate-e2e-error';

interface ClientErrorRow {
  readonly id: string;
  readonly fingerprint: string;
  readonly message: string;
  readonly stack: string;
  readonly buildSha: string;
}

async function superuserToken(): Promise<string> {
  const response = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identity: SUPERUSER_EMAIL, password: SUPERUSER_PASSWORD }),
  });
  if (!response.ok) {
    throw new Error(`e2e superuser login failed: ${response.status} ${await response.text()}`);
  }
  const body = (await response.json()) as { token: string };
  return body.token;
}

async function waitForRecord(token: string): Promise<ClientErrorRow> {
  const filter = encodeURIComponent(`message = '${MESSAGE}'`);
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const response = await fetch(
      `${PB_URL}/api/collections/client_errors/records?filter=${filter}`,
      { headers: { Authorization: token } },
    );
    if (response.ok) {
      const body = (await response.json()) as { items: ClientErrorRow[] };
      const first = body.items[0];
      if (first !== undefined) return first;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`no client_errors row for "${MESSAGE}" within 20s`);
}

test('a thrown error is captured, reported anonymously, and tools/errors symbolicates it', async ({
  page,
}) => {
  await page.goto('/');
  await seedProfile(page);

  // `?__e2eThrow=1` is main.tsx's own e2e-only hook (ticket dev-server/04): it throws for real,
  // from the real built bundle, after bootstrap finishes — a `page.evaluate` injected script has
  // no position in `assets/index-*.js` for a sourcemap to resolve, but this does.
  await page.goto('/?__e2eThrow=1');
  const appName = process.env.VITE_APP_NAME || 'کنکور لایتنر';
  await expect(page.getByRole('heading', { name: appName })).toBeVisible();

  // log/errors.ts's fingerprintOf() awaits Web Crypto before the outboxEnqueue lands.
  await page.waitForTimeout(500);

  // A fresh 'start' trigger (ticket dev-server/04: the outbox now drains for an anonymous
  // install too, no login needed) is the simplest reliable way to force the drain in a test.
  await page.reload();
  await expect(page.getByRole('heading', { name: appName })).toBeVisible();

  const token = await superuserToken();
  const record = await waitForRecord(token);
  expect(record.stack).toBeTruthy();
  expect(record.buildSha).toBeTruthy();

  const result = await execFileAsync(
    'node',
    ['--experimental-strip-types', 'tools/errors/index.ts', '--fingerprint', record.fingerprint],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        KL_API_ORIGIN: PB_URL,
        KL_ADMIN_EMAIL: SUPERUSER_EMAIL,
        KL_ADMIN_PASSWORD: SUPERUSER_PASSWORD,
      },
    },
  );

  expect(result.stdout).toContain(MESSAGE);
  // A symbolicated frame cites the original TypeScript source (Vite's sourcemap "source" entries
  // are relative to dist/assets, so `../../src/main.tsx` is apps/web/src/main.tsx) — the whole
  // point of the sourcemap — never the minified apps/web/dist/assets/*.js position it started at.
  expect(result.stdout).toMatch(/src[\\/]main\.tsx:\d+:\d+/);
  expect(result.stdout).not.toContain(path.join('dist', 'assets'));
});
