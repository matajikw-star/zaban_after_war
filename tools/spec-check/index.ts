#!/usr/bin/env node
// Checks that docs/spec/what.md agrees with the code, in both directions, for the five places
// ADR-0014 calls out as mechanically checkable (ticket dev-foundation/04). One line per
// mismatch, exit 1 on any. No network, no LLM — see tools/spec-check/*.ts for how each side is
// read; this file only wires them together and reports.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseClientBeacons, parseServerBeacons, parseWhatBeacons } from './beacons.ts';
import { collectionsFromMigrations, parseWhatCollections, type SourceFile } from './collections.ts';
import { diffSides, formatMismatch, type Mismatch, type Side } from './compare.ts';
import { parseEnvExample, parseWhatEnvVars } from './env-vars.ts';
import { parseServerErrorCodes, parseWhatServerErrorCodes } from './error-codes.ts';
import { extractSection } from './markdown.ts';
import { parseHookRoutes, parseWhatRoutes, routeKey } from './routes.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const path = (rel: string) => join(root, rel);
const read = (rel: string) => readFileSync(path(rel), 'utf8');

function readDir(rel: string, filter: (name: string) => boolean): SourceFile[] {
  return readdirSync(path(rel))
    .filter(filter)
    .map((name) => ({ name, content: read(join(rel, name)) }));
}

const whatMd = read('docs/spec/what.md');
const section8_1 = extractSection(whatMd, /^### 8\.1 /);
const section8_2 = extractSection(whatMd, /^### 8\.2 /);
const section8_4 = extractSection(whatMd, /^### 8\.4 /);
const section18 = extractSection(whatMd, /^## 18\. /);

const migrationFiles = readDir('server/pb_migrations', (n) => n.endsWith('.js'));
const hookFiles = readDir('server/pb_hooks', (n) => n.endsWith('.pb.js'));
const apiTs = read('apps/web/src/net/api.ts');
const telemetryJs = read('server/pb_hooks/lib/telemetry.js');
const errorsJs = read('server/pb_hooks/lib/errors.js');
const envExample = read('.env.example');

const mismatches: Mismatch[] = [];

// 1. Collections: what.md §8.1 vs. server/pb_migrations/*.js.
mismatches.push(
  ...diffSides(
    'collections',
    { names: parseWhatCollections(section8_1), label: 'docs/spec/what.md §8.1' },
    { names: collectionsFromMigrations(migrationFiles), label: 'server/pb_migrations/' },
  ),
);

// 2. Routes: what.md §8.2 vs. server/pb_hooks/*.pb.js ([planned]/[deferred] rows skipped).
const whatRoutes = parseWhatRoutes(section8_2)
  .filter((r) => !r.skip)
  .map(routeKey);
const codeRoutes = parseHookRoutes(hookFiles).map(routeKey);
mismatches.push(
  ...diffSides(
    'routes',
    { names: whatRoutes, label: 'docs/spec/what.md §8.2' },
    { names: codeRoutes, label: 'server/pb_hooks/' },
  ),
);

// 3. Beacon names: what.md §8.4 vs. the client union and the server's allow-list, independently.
const whatBeacons: Side = { names: parseWhatBeacons(section8_4), label: 'docs/spec/what.md §8.4' };
mismatches.push(
  ...diffSides('beacons (client)', whatBeacons, {
    names: parseClientBeacons(apiTs),
    label: 'apps/web/src/net/api.ts',
  }),
);
mismatches.push(
  ...diffSides('beacons (server)', whatBeacons, {
    names: parseServerBeacons(telemetryJs),
    label: 'server/pb_hooks/lib/telemetry.js',
  }),
);

// 4. Error codes: what.md §8.2's code list vs. server/pb_hooks/lib/errors.js's CODES (see
// tools/spec-check/error-codes.ts for why this is §8.2 and only the server side).
mismatches.push(
  ...diffSides(
    'error codes',
    { names: parseWhatServerErrorCodes(section8_2), label: 'docs/spec/what.md §8.2' },
    { names: parseServerErrorCodes(errorsJs), label: 'server/pb_hooks/lib/errors.js' },
  ),
);

// 5. Env vars: what.md §18 vs. .env.example.
mismatches.push(
  ...diffSides(
    'env vars',
    { names: parseWhatEnvVars(section18), label: 'docs/spec/what.md §18' },
    { names: parseEnvExample(envExample), label: '.env.example' },
  ),
);

if (mismatches.length === 0) {
  console.log('spec:check: ok — what.md agrees with the code on all 5 tables');
  process.exit(0);
}

for (const m of mismatches) console.error(formatMismatch(m));
console.error(`spec:check: ${mismatches.length} mismatch(es)`);
process.exit(1);
