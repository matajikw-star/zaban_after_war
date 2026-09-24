// The IO side of the refusal rules: reads real git state. `refusal.ts` decides what to do with
// it; this file is a thin wrapper so that decision stays testable without a real repository.

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { GitStatus } from './refusal.ts';

export const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

function git(args: readonly string[]): string {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
}

export function readGitStatus(): GitStatus {
  const dirty = git(['status', '--porcelain']) !== '';
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const head = git(['rev-parse', 'HEAD']);
  // `git fetch` is deliberately not run here: a deploy checks against whatever origin/main this
  // machine already knows, exactly the way CI's checkout does, and a stale local knowledge of
  // origin/main is caught the same way a stale local branch is — the push/PR merge before this
  // runs is what moves it.
  let originMain: string;
  try {
    originMain = git(['rev-parse', 'origin/main']);
  } catch {
    throw new Error('could not resolve origin/main — is a remote named "origin" configured?');
  }
  return { dirty, branch, head, originMain };
}
