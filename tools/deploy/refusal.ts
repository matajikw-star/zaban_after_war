// The refusal rules (what.md §14.4). Pure — takes the git facts as data, so the decision is
// unit-tested without a real repository.

export interface GitStatus {
  readonly dirty: boolean;
  readonly branch: string;
  readonly head: string;
  readonly originMain: string;
}

export interface RefusalCheck {
  readonly refuse: boolean;
  readonly reason: string | null;
}

const OK: RefusalCheck = { refuse: false, reason: null };

/**
 * Refuses on a dirty tree, always. Off `--allow-branch`, also refuses unless HEAD is exactly
 * origin/main. With `--allow-branch <branch>`, the main-branch check is replaced by "HEAD is on
 * exactly that branch" instead — loud, and for staging only, never dropped silently.
 */
export function checkRefusal(status: GitStatus, allowBranch: string | null): RefusalCheck {
  if (status.dirty) {
    return { refuse: true, reason: 'the working tree is dirty — commit or stash before deploying' };
  }

  if (allowBranch !== null) {
    if (status.branch !== allowBranch) {
      return {
        refuse: true,
        reason: `--allow-branch ${allowBranch} was given but HEAD is on "${status.branch}"`,
      };
    }
    return OK;
  }

  if (status.head !== status.originMain) {
    return {
      refuse: true,
      reason:
        `HEAD (${status.head.slice(0, 7)}) is not origin/main (${status.originMain.slice(0, 7)}) — ` +
        'pull/push first, or use --allow-branch <branch> for a staging deploy',
    };
  }

  return OK;
}
