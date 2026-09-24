#!/usr/bin/env node
// Lists user-submitted word flags, grouped by word and reason, sorted by count (what.md §8.1,
// §10.3, §11.2 — the same grouping the admin dashboard's Reports page shows). Run as `pnpm flags`.
//
//   pnpm flags [--since 7d]
//
// Credentials: KL_API_ORIGIN / KL_ADMIN_EMAIL / KL_ADMIN_PASSWORD, from .env.local or the
// environment (what.md §18).

import { parseCommonFlags, sinceToPbDate } from '../lib/args.ts';
import { loadDotEnvLocal, requireEnv } from '../lib/env.ts';
import { loginSuperuser } from '../lib/pb.ts';

interface WordFlagRecord {
  readonly id: string;
  readonly installId: string;
  readonly itemId: string;
  readonly reason: string;
  readonly appVersion: string;
  readonly at: number;
  readonly created: string;
}

function buildFilter(flags: ReturnType<typeof parseCommonFlags>): string {
  const since = sinceToPbDate(flags.since, Date.now());
  return since === undefined ? '' : `created >= "${since}"`;
}

async function main(): Promise<void> {
  await loadDotEnvLocal();
  const flags = parseCommonFlags(process.argv.slice(2));

  const origin = requireEnv('KL_API_ORIGIN');
  const email = requireEnv('KL_ADMIN_EMAIL');
  const password = requireEnv('KL_ADMIN_PASSWORD');
  const pb = await loginSuperuser(origin, email, password);

  const filter = buildFilter(flags);
  const records = await pb.listAll<WordFlagRecord>('word_flags', {
    ...(filter ? { filter } : {}),
    sort: '-created',
  });

  if (records.length === 0) {
    console.log('no matching word_flags');
    return;
  }

  const groups = new Map<
    string,
    { itemId: string; reason: string; count: number; lastSeen: string }
  >();
  for (const record of records) {
    const key = `${record.itemId}\u0000${record.reason}`;
    const existing = groups.get(key);
    if (existing === undefined) {
      groups.set(key, {
        itemId: record.itemId,
        reason: record.reason,
        count: 1,
        lastSeen: record.created,
      });
    } else {
      existing.count += 1;
      if (record.created > existing.lastSeen) existing.lastSeen = record.created;
    }
  }

  const rows = [...groups.values()].sort((a, b) => b.count - a.count);
  console.log(
    `${'count'.padStart(6)}  ${'word'.padEnd(24)}  ${'reason'.padEnd(12)}  last seen                lexicon file`,
  );
  for (const row of rows) {
    console.log(
      `${String(row.count).padStart(6)}  ${row.itemId.padEnd(24)}  ${row.reason.padEnd(12)}  ${row.lastSeen.padEnd(24)}  content/lexicon/${row.itemId}.json`,
    );
  }
}

try {
  await main();
} catch (error) {
  console.error(`flags: ${(error as Error).message}`);
  process.exit(1);
}
