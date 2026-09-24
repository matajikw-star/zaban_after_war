#!/usr/bin/env node
// Reads client_errors from the server, symbolicates each stack against the source maps for its
// build, and prints readable reports — or, with --group, a ranked list by fingerprint (what.md
// §10.3, §16.3). Run as `pnpm errors`.
//
//   pnpm errors --since 24h [--kind payment] [--fingerprint X] [--user PHONE] [--route R]
//   pnpm errors --group [--since 7d]
//
// Credentials: KL_API_ORIGIN / KL_ADMIN_EMAIL / KL_ADMIN_PASSWORD, from .env.local or the
// environment (what.md §18) — never hardcoded, never against a server other than the one those
// three variables name.

import { parseCommonFlags, sinceToPbDate } from '../lib/args.ts';
import { loadDotEnvLocal, requireEnv } from '../lib/env.ts';
import { loginSuperuser, type PbClient } from '../lib/pb.ts';
import { symbolicateStack } from '../lib/symbolicate.ts';

interface ClientErrorRecord {
  readonly id: string;
  readonly kind: string;
  readonly fingerprint: string;
  readonly message: string;
  readonly stack: string;
  readonly appVersion: string;
  readonly buildSha: string;
  readonly route: string;
  readonly installId: string;
  readonly user: string;
  readonly at: number;
  readonly online: boolean;
  readonly device: Record<string, unknown>;
  readonly breadcrumbs: ReadonlyArray<{ at: number; type: string; msg: string; data?: unknown }>;
  readonly snapshot: Record<string, unknown>;
  readonly userNote: string | null;
  readonly count: number;
  readonly created: string;
}

async function userIdForPhone(pb: PbClient, phone: string): Promise<string> {
  const found = await pb.list<{ id: string }>('users', {
    filter: `phone = "${phone}"`,
    perPage: '1',
  });
  const first = found.items[0];
  if (!first) throw new Error(`no user with phone ${phone}`);
  return first.id;
}

async function buildFilter(
  pb: PbClient,
  flags: ReturnType<typeof parseCommonFlags>,
): Promise<string> {
  const clauses: string[] = [];
  const since = sinceToPbDate(flags.since, Date.now());
  if (since !== undefined) clauses.push(`created >= "${since}"`);
  if (flags.kind !== undefined) clauses.push(`kind = "${flags.kind}"`);
  if (flags.fingerprint !== undefined) clauses.push(`fingerprint = "${flags.fingerprint}"`);
  if (flags.route !== undefined) clauses.push(`route = "${flags.route}"`);
  if (flags.user !== undefined) {
    const userId = await userIdForPhone(pb, flags.user);
    clauses.push(`user = "${userId}"`);
  }
  return clauses.join(' && ');
}

function printGrouped(records: readonly ClientErrorRecord[]): void {
  const byFingerprint = new Map<
    string,
    { count: number; lastSeen: string; kind: string; message: string; route: string }
  >();
  for (const record of records) {
    const existing = byFingerprint.get(record.fingerprint);
    const entryCount = existing === undefined ? record.count : existing.count + record.count;
    const lastSeen =
      existing === undefined || record.created > existing.lastSeen
        ? record.created
        : existing.lastSeen;
    byFingerprint.set(record.fingerprint, {
      count: entryCount,
      lastSeen,
      kind: record.kind,
      message: record.message,
      route: record.route,
    });
  }

  const rows = [...byFingerprint.entries()].sort((a, b) => b[1].count - a[1].count);
  if (rows.length === 0) {
    console.log('no matching client_errors');
    return;
  }
  console.log(
    `${'count'.padStart(6)}  ${'last seen'.padEnd(24)}  ${'kind'.padEnd(18)}  fingerprint  message`,
  );
  for (const [fingerprint, row] of rows) {
    console.log(
      `${String(row.count).padStart(6)}  ${row.lastSeen.padEnd(24)}  ${row.kind.padEnd(18)}  ${fingerprint.slice(0, 12)}  ${row.message}`,
    );
  }
}

function printReport(
  record: ClientErrorRecord,
  frames: Awaited<ReturnType<typeof symbolicateStack>>,
): void {
  console.log('─'.repeat(72));
  console.log(
    `${record.kind}  ${record.created}  ×${record.count}${record.online ? '' : '  (offline)'}`,
  );
  console.log(record.message);
  console.log(`fingerprint ${record.fingerprint}`);
  console.log(
    `route ${record.route || '(none)'}  appVersion ${record.appVersion}  buildSha ${record.buildSha || '(none)'}`,
  );
  console.log(`installId ${record.installId}  user ${record.user || '(anonymous)'}`);
  if (record.userNote) console.log(`note: ${record.userNote}`);

  if (frames.length > 0) {
    console.log('stack:');
    for (const frame of frames) {
      if (frame.file === null) {
        console.log(`  ${frame.raw.trim()}`);
        continue;
      }
      const fn = frame.functionName ?? '(anonymous)';
      if (frame.resolved) {
        console.log(
          `  ${fn} — ${frame.resolved.source}:${frame.resolved.line}:${frame.resolved.column}` +
            (frame.resolved.name ? ` (${frame.resolved.name})` : ''),
        );
      } else {
        console.log(`  ${fn} — ${frame.file}:${frame.line}:${frame.column}  [${frame.note}]`);
      }
    }
  }

  const crumbs = record.breadcrumbs.slice(-10);
  if (crumbs.length > 0) {
    console.log('last breadcrumbs:');
    for (const crumb of crumbs) {
      console.log(`  ${new Date(crumb.at).toISOString()}  ${crumb.type}  ${crumb.msg}`);
    }
  }

  const snapshotKeys = Object.keys(record.snapshot);
  if (snapshotKeys.length > 0) {
    console.log(`snapshot: ${JSON.stringify(record.snapshot)}`);
  }
}

async function main(): Promise<void> {
  await loadDotEnvLocal();
  const flags = parseCommonFlags(process.argv.slice(2));

  const origin = requireEnv('KL_API_ORIGIN');
  const email = requireEnv('KL_ADMIN_EMAIL');
  const password = requireEnv('KL_ADMIN_PASSWORD');
  const pb = await loginSuperuser(origin, email, password);

  const filter = await buildFilter(pb, flags);
  const records = await pb.listAll<ClientErrorRecord>('client_errors', {
    ...(filter ? { filter } : {}),
    sort: '-created',
  });

  if (flags.group) {
    printGrouped(records);
    return;
  }

  if (records.length === 0) {
    console.log('no matching client_errors');
    return;
  }

  // Newest first, capped so a broad query does not scroll forever — --fingerprint narrows it
  // to one bug's own history instead.
  const shown = flags.fingerprint !== undefined ? records : records.slice(0, 50);
  for (const record of shown) {
    const frames = await symbolicateStack(pb, record.buildSha, record.stack || null);
    printReport(record, frames);
  }
  if (shown.length < records.length) {
    console.log('─'.repeat(72));
    console.log(
      `${records.length - shown.length} more not shown — narrow with --fingerprint, --kind or --since`,
    );
  }
}

try {
  await main();
} catch (error) {
  console.error(`errors: ${(error as Error).message}`);
  process.exit(1);
}
