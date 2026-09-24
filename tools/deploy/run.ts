// The IO shared by `pnpm run deploy` (index.ts) and `pnpm run provision` (provision.ts): who is
// running it, where the VPS is, and printing or running a plan. The decisions live in the pure
// modules (args, refusal, plan, provision-plan, server-env, ssh); this file only carries them out.

import { execFileSync } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { optionalEnv, requireEnv } from '../lib/env.ts';
import { repoRoot } from './git.ts';
import type { StdinSource, Step } from './plan.ts';
import type { Gate } from './refusal.ts';
import { expandHome } from './ssh.ts';

export function whoAmI(): string {
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

/** DEPLOY_HOST — required for a real run; a dry run prints a placeholder instead of failing. */
export function deployHost(dryRun: boolean): string {
  return dryRun ? optionalEnv('DEPLOY_HOST', '<DEPLOY_HOST unset>') : requireEnv('DEPLOY_HOST');
}

/** DEPLOY_SSH_KEY_FILE (optional), `~`-expanded — e.g. `~/.ssh/kl_root.pem`. */
export function deployKeyFile(): string | null {
  const raw = optionalEnv('DEPLOY_SSH_KEY_FILE', '');
  return raw === '' ? null : expandHome(raw, homedir());
}

/**
 * Prints the gate's verdict. Returns false when the run must stop here (a real run, refused).
 * A dry run that a real run would refuse says so loudly, then goes on to print the plan.
 */
export function announceGate(tool: string, result: Gate): boolean {
  if (result.kind === 'refuse') {
    console.error(`${tool}: refused — ${result.reason}`);
    return false;
  }
  if (result.kind === 'preview' && result.wouldRefuse !== null) {
    console.warn(
      `\n⚠️  ${tool.toUpperCase()} WOULD BE REFUSED: ${result.wouldRefuse}\n` +
        '⚠️  --dry-run prints the plan anyway and runs none of it; a real run stops here.\n',
    );
  }
  return true;
}

export function printPlan(steps: readonly Step[]): void {
  for (const step of steps) {
    console.log(`\n# ${step.description}`);
    if (step.stdin !== undefined) {
      console.log(`# stdin: ${step.stdin} — secret, built in memory at run time, never printed`);
    }
    console.log(step.command);
  }
}

/**
 * Runs each step through `bash -c`, stopping at the first failure. A step with `stdin` gets that
 * secret piped in from `secrets` — the only place a secret meets a child process, and never argv.
 */
export function runPlan(
  steps: readonly Step[],
  secrets: (source: StdinSource) => string = (source) => {
    throw new Error(`no secret provider for ${source}`);
  },
): void {
  for (const step of steps) {
    console.log(`\n▶ ${step.description}`);
    if (step.stdin === undefined) {
      execFileSync('bash', ['-c', step.command], { cwd: repoRoot, stdio: 'inherit' });
    } else {
      execFileSync('bash', ['-c', step.command], {
        cwd: repoRoot,
        input: secrets(step.stdin),
        stdio: ['pipe', 'inherit', 'inherit'],
      });
    }
  }
}

/** what.md §10.5: every deploy (and the provision) also leaves a line in this repo's wiki log. */
export async function appendWikiLog(line: string): Promise<void> {
  await appendFile(path.join(repoRoot, 'wiki', 'log.md'), `${line}\n`, 'utf8');
}
