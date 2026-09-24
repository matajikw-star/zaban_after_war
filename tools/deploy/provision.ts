#!/usr/bin/env node
// The one-time PocketBase install on the bootstrapped VPS (what.md §14.4; docs/runbooks/deploy.md
// → "First deploy (one time)"). Idempotent: re-running it changes only what differs.
//
//   pnpm run provision [--dry-run] [--allow-branch <branch>]
//
// As root, over ssh (DEPLOY_HOST, DEPLOY_SSH_KEY_FILE — e.g. ~/.ssh/kl_root.pem): ships the
// verified PocketBase binary, the systemd unit, the real Caddyfile and server/deploy/install.sh +
// superuser.sh; streams /opt/kl/.env from memory; creates the superuser from KL_ADMIN_EMAIL /
// KL_ADMIN_PASSWORD. Refuses exactly as `pnpm run deploy` does (clean tree, HEAD at origin/main
// or origin/<allow-branch>). `--dry-run` downloads nothing, connects nowhere and prints the plan
// and the env's names — every value from .env.local masked.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadDotEnvLocal, optionalEnv } from '../lib/env.ts';
import { parseProvisionArgs } from './args.ts';
import { readGitStatus, repoRoot } from './git.ts';
import type { StdinSource } from './plan.ts';
import { linuxAssetName, prepareLinuxBinary } from './pocketbase-release.ts';
import { buildProvisionPlan, PROVISION_USER, type ProvisionContext } from './provision-plan.ts';
import { checkRefusal, gate } from './refusal.ts';
import {
  announceGate,
  appendWikiLog,
  deployHost,
  deployKeyFile,
  printPlan,
  runPlan,
  whoAmI,
} from './run.ts';
import {
  buildServerEnv,
  describeServerEnv,
  parseServerSection,
  superuserStdin,
} from './server-env.ts';

const BINARY_DIR = 'server/.pb/linux_amd64';

async function main(): Promise<void> {
  await loadDotEnvLocal();
  const args = parseProvisionArgs(process.argv.slice(2));

  const status = readGitStatus(args.allowBranch);
  const verdict = gate(checkRefusal(status, args.allowBranch), args.dryRun);
  if (!announceGate('provision', verdict)) {
    process.exitCode = 1;
    return;
  }

  // Both secrets are built — and so validated — before anything connects anywhere: a missing or
  // malformed value refuses the whole run up front, dry or not.
  const example = parseServerSection(await readFile(path.join(repoRoot, '.env.example'), 'utf8'));
  const serverEnv = buildServerEnv(example, (name) => process.env[name]);
  const superuser = superuserStdin({
    email: optionalEnv('KL_ADMIN_EMAIL', ''),
    password: optionalEnv('KL_ADMIN_PASSWORD', ''),
  });

  const sha = status.head.slice(0, 7);
  const ctx: ProvisionContext = {
    sha,
    host: deployHost(args.dryRun),
    keyFile: deployKeyFile(),
    who: whoAmI(),
    binaryDir: BINARY_DIR,
  };
  const steps = buildProvisionPlan(ctx);
  const version = (
    await readFile(path.join(repoRoot, 'server', 'POCKETBASE_VERSION'), 'utf8')
  ).trim();

  console.log(`provision @ ${sha} (branch ${status.branch}) → ${PROVISION_USER}@${ctx.host}`);

  if (verdict.kind === 'preview') {
    console.log('(--dry-run: printing every command, running none, downloading nothing)');
    console.log(
      `\n# before the steps: download ${linuxAssetName(version)} + checksums.txt (unless cached ` +
        `in ${BINARY_DIR}), accept it only if its sha256 matches both and server/POCKETBASE_SHA256, ` +
        `extract pocketbase, write pocketbase.sha256`,
    );
    console.log('\n# /opt/kl/.env that would be written (values from .env.local masked):');
    for (const line of describeServerEnv(example, serverEnv.entries)) console.log(`#   ${line}`);
    console.log('# superuser: KL_ADMIN_EMAIL / KL_ADMIN_PASSWORD present and valid (not shown)');
    printPlan(steps);
    return;
  }

  const binary = await prepareLinuxBinary(repoRoot);
  console.log(
    `pocketbase ${version} linux_amd64: sha256 ${binary.zipSha256} verified` +
      (binary.downloaded ? ' (downloaded)' : ' (cached)'),
  );

  const secrets = (source: StdinSource): string =>
    source === 'server-env' ? serverEnv.content : superuser;
  runPlan(steps, secrets);

  const line = `deploy | provision | ${sha} | ${ctx.who} | ${new Date().toISOString()}`;
  await appendWikiLog(line);
  console.log(`\nappended to wiki/log.md: ${line}`);

  console.log(
    '\nprovisioned. Next: `pnpm run deploy all` (its server step starts PocketBase), then the ' +
      'checks in docs/runbooks/deploy.md → "First deploy (one time)".',
  );
}

try {
  await main();
} catch (error) {
  console.error(`provision: ${(error as Error).message}`);
  process.exit(1);
}
