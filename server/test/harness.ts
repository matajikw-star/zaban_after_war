// Start a real PocketBase on a random port, against an empty temp pb_data, with this repo's
// hooks and migrations. what.md §16.3: the API suite exercises the routes over HTTP, because the
// things that break — API rules, goja semantics, the error envelope — do not exist in a mock.

import { type ChildProcess, execFile, spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { ensurePocketBase, serverDir } from '../scripts/download-pocketbase.mjs';

const execFileAsync = promisify(execFile);

const SUPERUSER_EMAIL = 'test@konkurleitner.local';
// PocketBase requires ≥ 10 characters; what.md §15 wants ≥ 20 in production.
const SUPERUSER_PASSWORD = 'test-superuser-password-1234567890';

export interface ApiResponse<T = any> {
  status: number;
  body: T;
}

export interface LogLine {
  level: number;
  message: string;
  data: any;
}

export interface Server {
  url: string;
  dataDir: string;
  superuserEmail: string;
  superuserPassword: string;
  superuserToken: string;
  /** Raw call. `token` is sent as the Authorization header verbatim, as PocketBase expects. */
  api<T = any>(
    method: string,
    routePath: string,
    init?: { body?: unknown; token?: string; headers?: Record<string, string> },
  ): Promise<ApiResponse<T>>;
  /** Same, already authenticated as the superuser. */
  asSuperuser<T = any>(
    method: string,
    routePath: string,
    init?: { body?: unknown; headers?: Record<string, string> },
  ): Promise<ApiResponse<T>>;
  /** Create a `users` record and return its id plus an impersonation token. */
  createUser(phone: string): Promise<{ id: string; token: string }>;
  /**
   * Poll _logs until a row for `route` satisfying `match` has been flushed, and return the rows.
   * Without `match` any row for the route will do — which is only safe when no earlier test in
   * the file has logged that route.
   */
  logsFor(route: string, match?: (line: LogLine) => boolean): Promise<LogLine[]>;
  /** Everything the process has written to stdout/stderr so far (the console SMS provider). */
  output(): string;
  stop(): Promise<void>;
}

export interface StartOptions {
  /** Overrides for the child's environment, e.g. `{ SMS_PROVIDER: 'mock' }`. */
  readonly env?: Record<string, string>;
}

function randomPort(): number {
  // 20000-29999: above the ephemeral range Windows hands out by default.
  return 20000 + Math.floor(Math.random() * 10000);
}

async function waitForHealth(url: string, child: ChildProcess, output: () => string) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`pocketbase exited with ${child.exitCode}:\n${output()}`);
    }
    try {
      const response = await fetch(`${url}/api/health`);
      if (response.ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`pocketbase did not become healthy in 30s:\n${output()}`);
}

export async function startServer(options: StartOptions = {}): Promise<Server> {
  const binary = await ensurePocketBase();
  const dataDir = await mkdtemp(path.join(tmpdir(), 'kl-pb-'));
  const hooksDir = path.join(serverDir, 'pb_hooks');
  const migrationsDir = path.join(serverDir, 'pb_migrations');
  const port = randomPort();
  const url = `http://127.0.0.1:${port}`;

  const env = {
    ...process.env,
    // Never a real SMS gateway from a test (what.md §16.2).
    SMS_PROVIDER: 'console',
    SMS_API_KEY: 'test-key',
    ZARINPAL_MERCHANT_ID: 'test-merchant',
    ZARINPAL_SANDBOX: '1',
    PUBLIC_APP_ORIGIN: url,
    BACKUP_S3_ENDPOINT: 'test',
    BACKUP_S3_KEY: 'test',
    BACKUP_S3_SECRET: 'test',
    ...options.env,
  };

  // The superuser is created before `serve`, which is also what first applies the migrations to
  // the empty directory — so a failing migration fails here, loudly, not as a mystery 404 later.
  await execFileAsync(
    binary,
    [
      'superuser',
      'upsert',
      SUPERUSER_EMAIL,
      SUPERUSER_PASSWORD,
      '--dir',
      dataDir,
      '--migrationsDir',
      migrationsDir,
    ],
    { env },
  );

  let output = '';
  const child = spawn(
    binary,
    [
      'serve',
      `--http=127.0.0.1:${port}`,
      '--dir',
      dataDir,
      '--hooksDir',
      hooksDir,
      '--migrationsDir',
      migrationsDir,
    ],
    { env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  child.stdout?.on('data', (chunk) => {
    output += String(chunk);
  });
  child.stderr?.on('data', (chunk) => {
    output += String(chunk);
  });

  await waitForHealth(url, child, () => output);

  const api: Server['api'] = async (method, routePath, init = {}) => {
    const headers: Record<string, string> = { ...(init.headers ?? {}) };
    if (init.body !== undefined) headers['Content-Type'] = 'application/json';
    if (init.token) headers.Authorization = init.token;

    const response = await fetch(`${url}${routePath}`, {
      method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });

    const text = await response.text();
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // leave it as text: a non-JSON answer is itself the finding
    }
    return { status: response.status, body: body as any };
  };

  const auth = await api<{ token: string }>(
    'POST',
    '/api/collections/_superusers/auth-with-password',
    { body: { identity: SUPERUSER_EMAIL, password: SUPERUSER_PASSWORD } },
  );
  if (auth.status !== 200) {
    child.kill();
    throw new Error(`could not authenticate the superuser: ${JSON.stringify(auth.body)}`);
  }
  const superuserToken = auth.body.token;

  const asSuperuser: Server['asSuperuser'] = (method, routePath, init = {}) =>
    api(method, routePath, { ...init, token: superuserToken });

  return {
    url,
    dataDir,
    superuserEmail: SUPERUSER_EMAIL,
    superuserPassword: SUPERUSER_PASSWORD,
    superuserToken,
    api,
    asSuperuser,

    async createUser(phone: string) {
      // `users` has passwordAuth disabled, so there is no auth-with-password to call. The
      // superuser-only impersonate endpoint is how a test gets a user token. The password is
      // still required by PocketBase on any auth record, and is never used.
      const created = await asSuperuser<{ id: string }>('POST', '/api/collections/users/records', {
        body: {
          phone,
          password: 'unused-password-1234',
          passwordConfirm: 'unused-password-1234',
        },
      });
      if (created.status !== 200) {
        throw new Error(`could not create ${phone}: ${JSON.stringify(created.body)}`);
      }

      const impersonated = await asSuperuser<{ token: string }>(
        'POST',
        `/api/collections/users/impersonate/${created.body.id}`,
        { body: { duration: 3600 } },
      );
      if (impersonated.status !== 200) {
        throw new Error(`could not impersonate ${phone}: ${JSON.stringify(impersonated.body)}`);
      }

      return { id: created.body.id, token: impersonated.body.token };
    },

    async logsFor(route: string, match?: (line: LogLine) => boolean) {
      // PocketBase writes _logs on a 3-second debounce (or at 200 entries), so a log assertion
      // has to wait for the flush — and polling only for "any row for this route" returns rows
      // an earlier test wrote, which is how this harness first lied to us.
      const wanted = match ?? (() => true);
      const deadline = Date.now() + 20_000;
      let last: LogLine[] = [];

      while (Date.now() < deadline) {
        const filter = encodeURIComponent(`data.route='${route}'`);
        const found = await asSuperuser<{ items: LogLine[] }>(
          'GET',
          `/api/logs?perPage=100&sort=-created&filter=${filter}`,
        );
        if (found.status === 200) {
          last = found.body.items;
          if (last.some(wanted)) return last;
        }
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
      return last;
    },

    output() {
      return output;
    },

    async stop() {
      child.kill();
      await new Promise((resolve) => {
        if (child.exitCode !== null) return resolve(undefined);
        child.once('exit', () => resolve(undefined));
        setTimeout(() => resolve(undefined), 5000);
      });
      // Windows keeps the SQLite files locked for a moment after the process goes.
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          await rm(dataDir, { recursive: true, force: true });
          return;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }
    },
  };
}
