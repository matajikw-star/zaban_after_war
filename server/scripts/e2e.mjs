// The PocketBase the Playwright suite talks to: `pnpm --filter @kl/server pb:e2e`.
//
// Started by apps/web/playwright.config.ts as its second webServer, on 127.0.0.1:8091, behind
// `vite preview`'s /api proxy — so the built app calls its API same-origin, as it will behind
// Caddy. Every run gets a throwaway pb_data in the OS temp dir, deleted when the process exits.
//
// SMS_PROVIDER=mock: the code is always 123456 and nothing is ever sent (what.md §8.2).
//
// A fixed superuser is upserted before `serve` starts (same CLI call `server/test/harness.ts`
// uses) — `errors.spec.ts` needs one to call the superuser-only sourcemap route and to prove
// `tools/errors` symbolicates against this same throwaway PocketBase (ticket dev-server/04).

import { execFile, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { ensurePocketBase, serverDir } from './download-pocketbase.mjs';

const execFileAsync = promisify(execFile);

const HOST = process.env.KL_E2E_PB_HOST ?? '127.0.0.1:8091';

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
    env: {
      ...process.env,
      SMS_PROVIDER: 'mock',
      PUBLIC_APP_ORIGIN: 'http://127.0.0.1:4173',
    },
    stdio: 'inherit',
  },
);

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
