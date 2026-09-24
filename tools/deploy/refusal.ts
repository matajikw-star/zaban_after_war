// The refusal rules (what.md §14.4). Pure — takes the git facts as data, so the decision is
// unit-tested without a real repository.

export interface GitStatus {
  readonly dirty: boolean;
  /** The currently checked-out branch name — display only; the refusal decision below never
   *  compares against it, because a local branch name proves nothing about what was reviewed. */
  readonly branch: string;
  readonly head: string;
  readonly originMain: string;
  /** sha of `origin/<allowBranch>`, resolved only when `--allow-branch <allowBranch>` was given;
   *  `null` when no `--allow-branch` was given, or when that ref could not be resolved (e.g. the
   *  branch was never pushed) — either way there is nothing to compare HEAD against. */
  readonly originAllowBranch: string | null;
}

export interface RefusalCheck {
  readonly refuse: boolean;
  readonly reason: string | null;
}

const OK: RefusalCheck = { refuse: false, reason: null };

/**
 * Refuses on a dirty tree, always. Off `--allow-branch`, also refuses unless HEAD is exactly
 * origin/main. With `--allow-branch <branch>`, the check is against `origin/<branch>` instead of
 * `origin/main` — but it is still a HEAD-equals-that-remote-ref check, never a "what is this
 * branch called locally" check. A local branch named `develop` with unpushed commits must refuse
 * exactly like any other unpushed branch would: what.md §14.4 says HEAD must equal origin/develop,
 * not merely be checked out under that name.
 */
export function checkRefusal(status: GitStatus, allowBranch: string | null): RefusalCheck {
  if (status.dirty) {
    return { refuse: true, reason: 'the working tree is dirty — commit or stash before deploying' };
  }

  if (allowBranch !== null) {
    if (status.originAllowBranch === null) {
      return {
        refuse: true,
        reason: `could not resolve origin/${allowBranch} — is it pushed, and is "origin" up to date?`,
      };
    }
    if (status.head !== status.originAllowBranch) {
      return {
        refuse: true,
        reason:
          `--allow-branch ${allowBranch} was given but HEAD (${status.head.slice(0, 7)}) is not ` +
          `origin/${allowBranch} (${status.originAllowBranch.slice(0, 7)}) — push first`,
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
