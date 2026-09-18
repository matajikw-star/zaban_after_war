// Run the server locally: `pnpm --filter @kl/server pb:dev`.
//
// Same binary, hooks and migrations as production and as the test harness; a local pb_data under
// server/.pb/dev-data so it never touches anything real. A superuser is created on first run and
// its credentials are printed.
//
// PocketBase does not reload pb_hooks while it is running — restart this after editing a hook.

import { execFile, spawn } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { ensurePocketBase, pbDir, serverDir } from './download-pocketbase.mjs';

const execFileAsync = promisify(execFile);

const HOST = process.env.KL_DEV_HOST ?? '127.0.0.1:8090';
const EMAIL = process.env.KL_DEV_SUPERUSER ?? 'dev@konkurleitner.local';
const PASSWORD = process.env.KL_DEV_PASSWORD ?? 'dev-superuser-password-1234';

const binary = await ensurePocketBase();
const dataDir = path.join(pbDir, 'dev-data');

const env = {
  // Never a real SMS gateway from a developer machine: the OTP code goes to the log instead.
  SMS_PROVIDER: 'console',
  PUBLIC_APP_ORIGIN: `http://${HOST}`,
  ...process.env,
};

await execFileAsync(
  binary,
  [
    'superuser',
    'upsert',
    EMAIL,
    PASSWORD,
    '--dir',
    dataDir,
    '--migrationsDir',
    path.join(serverDir, 'pb_migrations'),
  ],
  { env },
);

process.stdout.write(`superuser: ${EMAIL} / ${PASSWORD}\nadmin UI:  http://${HOST}/_/\n\n`);

spawn(
  binary,
  [
    'serve',
    `--http=${HOST}`,
    '--dir',
    dataDir,
    '--hooksDir',
    path.join(serverDir, 'pb_hooks'),
    '--migrationsDir',
    path.join(serverDir, 'pb_migrations'),
  ],
  { env, stdio: 'inherit' },
).on('exit', (code) => process.exit(code ?? 0));
