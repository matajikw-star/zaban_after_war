#!/usr/bin/env node
// Reads PocketBase's own structured logs (`_logs`, written by `withRoute` — what.md §10.2, §10.3)
// through `/api/logs` as superuser, and prints them filtered and readable. Run as `pnpm logs`.
//
//   pnpm logs --since 24h [--route sync.push] [--level error]
//
// Credentials: KL_API_ORIGIN / KL_ADMIN_EMAIL / KL_ADMIN_PASSWORD, from .env.local or the
// environment (what.md §18).

import { parseCommonFlags, sinceToPbDate } from '../lib/args.ts';
import { loadDotEnvLocal, requireEnv } from '../lib/env.ts';
import { loginSuperuser } from '../lib/pb.ts';

interface LogRecord {
  readonly id: string;
  readonly created: string;
  readonly level: number;
  readonly message: string;
  readonly data: Record<string, unknown>;
}

/** Go's slog levels, what PocketBase's own logger uses (what.md §10.2). */
const LEVEL_NAMES: Record<number, string> = {
  [-4]: 'debug',
  0: 'info',
  4: 'warn',
  8: 'error',
};
const LEVEL_VALUES: Record<string, number> = { debug: -4, info: 0, warn: 4, error: 8 };

function levelName(level: number): string {
  return LEVEL_NAMES[level] ?? String(level);
}

function buildFilter(flags: ReturnType<typeof parseCommonFlags>): string {
  const clauses: string[] = [];
  const since = sinceToPbDate(flags.since, Date.now());
  if (since !== undefined) clauses.push(`created >= "${since}"`);
  if (flags.route !== undefined) clauses.push(`data.route = "${flags.route}"`);
  if (flags.level !== undefined) {
    const min = LEVEL_VALUES[flags.level];
    if (min === undefined) {
      throw new Error(`--level must be one of debug, info, warn, error (got "${flags.level}")`);
    }
    clauses.push(`level >= ${min}`);
  }
  return clauses.join(' && ');
}

function printLine(record: LogRecord): void {
  const data = record.data;
  const bits = [
    data.route !== undefined ? `route=${data.route}` : null,
    data.userId ? `userId=${data.userId}` : null,
    data.installId ? `installId=${data.installId}` : null,
    data.status !== undefined ? `status=${data.status}` : null,
    data.ms !== undefined ? `ms=${data.ms}` : null,
    data.code ? `code=${data.code}` : null,
  ].filter((bit) => bit !== null);

  console.log(
    `${record.created}  ${levelName(record.level).padEnd(5)}  ${record.message}  ${bits.join(' ')}`,
  );
  if (typeof data.err === 'string' && data.err !== '') console.log(`  err: ${data.err}`);
  if (typeof data.input === 'string' && data.input !== '') console.log(`  input: ${data.input}`);
}

async function main(): Promise<void> {
  await loadDotEnvLocal();
  const flags = parseCommonFlags(process.argv.slice(2));

  const origin = requireEnv('KL_API_ORIGIN');
  const email = requireEnv('KL_ADMIN_EMAIL');
  const password = requireEnv('KL_ADMIN_PASSWORD');
  const pb = await loginSuperuser(origin, email, password);

  // `/api/logs` is PocketBase's own system endpoint, not a collection under
  // `/api/collections/*/records` — same shape `server/test/harness.ts`'s `logsFor` reads.
  const filter = buildFilter(flags);
  const search = new URLSearchParams({ sort: '-created', perPage: '200' });
  if (filter) search.set('filter', filter);
  const response = await pb.getJson<{ items: LogRecord[] }>(`/api/logs?${search.toString()}`);

  if (response.items.length === 0) {
    console.log('no matching log lines');
    return;
  }
  // Oldest first on the screen, like `tail`.
  for (const record of [...response.items].reverse()) printLine(record);
}

try {
  await main();
} catch (error) {
  console.error(`logs: ${(error as Error).message}`);
  process.exit(1);
}
