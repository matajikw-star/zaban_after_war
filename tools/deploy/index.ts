#!/usr/bin/env node
// Builds, ships and health-checks a release on the VPS (what.md §14.4). Run as `pnpm run deploy`
// — bare `pnpm deploy` is one of pnpm's own subcommands and shadows this script. No `--` before
// the arguments: this repo's pinned pnpm (12.3.4) does not strip it (pnpm/pnpm#13295), and it
// would reach parseDeployArgs as a literal "--" token, rejected as an unknown flag.
//
//   pnpm run deploy <web|server|content|landing|admin|all> [--dry-run] [--allow-branch <b>]
//
// Refuses unless the working tree is clean and HEAD equals origin/main; `--allow-branch <branch>`
// lifts the branch check (never the dirty-tree one) for a staging deploy from that branch, and
// prints a loud warning when it does. `--dry-run` prints every command this would run and
// executes none — always safe, on any branch, on any tree.
//
// Credentials: DEPLOY_HOST / DEPLOY_USER, from .env.local or the environment (what.md §18).

import { execFileSync } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import path from 'node:path';
import { loadDotEnvLocal, optionalEnv, requireEnv } from '../lib/env.ts';
import { parseDeployArgs } from './args.ts';
import { readGitStatus, repoRoot } from './git.ts';
import { buildPlan, type DeployContext, type Step } from './plan.ts';
import { checkRefusal } from './refusal.ts';

function whoAmI(): string {
  try {
    const name = execFileSync('git', ['config', 'user.name'], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim();
    if (name !== '') return name;
  } catch {
    // fall through
  }
  return process.env.USER ?? process.env.USERNAME ?? 'unknown';
}

function printPlan(steps: readonly Step[]): void {
  for (const step of steps) {
    console.log(`\n# ${step.description}`);
    console.log(step.command);
  }
}

function runPlan(steps: readonly Step[]): void {
  for (const step of steps) {
    console.log(`\n▶ ${step.description}`);
    execFileSync('bash', ['-c', step.command], { cwd: repoRoot, stdio: 'inherit' });
  }
}

async function appendWikiLog(line: string): Promise<void> {
  const wikiLog = path.join(repoRoot, 'wiki', 'log.md');
  await appendFile(wikiLog, `${line}\n`, 'utf8');
}

async function main(): Promise<void> {
  await loadDotEnvLocal();
  const args = parseDeployArgs(process.argv.slice(2));

  const status = readGitStatus(args.allowBranch);
  const refusal = checkRefusal(status, args.allowBranch);

  if (args.allowBranch !== null && !refusal.refuse) {
    console.warn(
      `\n⚠️  DEPLOYING FROM "${status.branch}", NOT origin/main — --allow-branch is for staging only.\n`,
    );
  }

  if (refusal.refuse) {
    console.error(`deploy: refused — ${refusal.reason}`);
    process.exitCode = 1;
    return;
  }

  const sha = status.head.slice(0, 7);
  const ctx: DeployContext = {
    sha,
    host: requireEnv('DEPLOY_HOST'),
    user: optionalEnv('DEPLOY_USER', 'kl'),
    who: whoAmI(),
  };

  const steps = buildPlan(args.targets, ctx);

  console.log(
    `deploy: ${args.targets.join(', ')} @ ${sha} (branch ${status.branch}) → ${ctx.user}@${ctx.host}`,
  );

  if (args.dryRun) {
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
