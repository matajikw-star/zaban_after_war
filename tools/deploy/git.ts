// The IO side of the refusal rules: reads real git state. `refusal.ts` decides what to do with
// it; this file is a thin wrapper so that decision stays testable without a real repository.

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { GitStatus } from './refusal.ts';

export const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

function git(args: readonly string[]): string {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
}

/**
 * `allowBranch` is passed through from `--allow-branch <branch>` (or `null` without it): when
 * given, `origin/<allowBranch>` is resolved too, so `checkRefusal` can compare HEAD against it.
 */
export function readGitStatus(allowBranch: string | null = null): GitStatus {
  const dirty = git(['status', '--porcelain']) !== '';
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const head = git(['rev-parse', 'HEAD']);
  // `git fetch` is deliberately not run here: a deploy checks against whatever origin/main (or
  // origin/<allowBranch>) this machine already knows, exactly the way CI's checkout does, and a
  // stale local knowledge of it is caught the same way a stale local branch is — the push/PR
  // merge before this runs is what moves it.
  let originMain: string;
  try {
    originMain = git(['rev-parse', 'origin/main']);
  } catch {
    throw new Error('could not resolve origin/main — is a remote named "origin" configured?');
  }
  let originAllowBranch: string | null = null;
  if (allowBranch !== null) {
    try {
      originAllowBranch = git(['rev-parse', `origin/${allowBranch}`]);
    } catch {
      originAllowBranch = null; // checkRefusal turns this into its own refusal reason
    }
  }
  return { dirty, branch, head, originMain, originAllowBranch };
}
