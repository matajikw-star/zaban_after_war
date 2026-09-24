#!/usr/bin/env node
// Builds, ships and health-checks a release on the VPS (what.md §14.4). Run as `pnpm run deploy`
// — bare `pnpm deploy` is one of pnpm's own subcommands and shadows this script. No `--` before
// the arguments: this repo's pinned pnpm (12.3.4) does not strip it (pnpm/pnpm#13295), and it
// would reach parseDeployArgs as a literal "--" token, rejected as an unknown flag.
//
//   pnpm run deploy <web|server|content|landing|admin|all> [--dry-run] [--allow-branch <b>]
//
// Refuses unless the working tree is clean and HEAD equals origin/main; `--allow-branch <branch>`
// swaps that for HEAD equals origin/<branch> (never lifting the dirty-tree check) for a staging
// deploy, and prints a loud warning when it does. `--dry-run` prints every command this would run
// and executes none: on any branch and any tree it prints the plan — when a real run would be
// refused, it says so loudly first, and the refusal still stops every real run.
//
// Credentials: DEPLOY_HOST / DEPLOY_USER / DEPLOY_SSH_KEY_FILE, from .env.local or the
// environment (what.md §18). The one-time server install is a separate command, `pnpm run
// provision` (provision.ts), because it runs as root.

import { loadDotEnvLocal, optionalEnv } from '../lib/env.ts';
import { parseDeployArgs } from './args.ts';
import { readGitStatus } from './git.ts';
import { buildPlan, type DeployContext } from './plan.ts';
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

async function main(): Promise<void> {
  await loadDotEnvLocal();
  const args = parseDeployArgs(process.argv.slice(2));

  const status = readGitStatus(args.allowBranch);
  const verdict = gate(checkRefusal(status, args.allowBranch), args.dryRun);
  if (!announceGate('deploy', verdict)) {
    process.exitCode = 1;
    return;
  }

  if (args.allowBranch !== null) {
    console.warn(
      `\n⚠️  DEPLOYING FROM "${status.branch}", NOT origin/main — --allow-branch is for staging only.\n`,
    );
  }

  const sha = status.head.slice(0, 7);
  const ctx: DeployContext = {
    sha,
    host: deployHost(args.dryRun),
    user: optionalEnv('DEPLOY_USER', 'kl'),
    keyFile: deployKeyFile(),
    who: whoAmI(),
  };

  const steps = buildPlan(args.targets, ctx);

  console.log(
    `deploy: ${args.targets.join(', ')} @ ${sha} (branch ${status.branch}) → ${ctx.user}@${ctx.host}`,
  );

  if (verdict.kind === 'preview') {
    console.log('(--dry-run: printing every command, running none)');
    printPlan(steps);
    return;
  }

  runPlan(steps);

  const line = `deploy | ${args.targets.join(',')} | ${sha} | ${ctx.who} | ${new Date().toISOString()}`;
  await appendWikiLog(line);
  console.log(`\nappended to wiki/log.md: ${line}`);
}

try {
  await main();
} catch (error) {
  console.error(`deploy: ${(error as Error).message}`);
  process.exit(1);
}
