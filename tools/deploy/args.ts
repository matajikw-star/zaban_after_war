// Argument parsing for `pnpm run deploy` (what.md §14.4). Pure — no filesystem, no process — so
// it is unit-tested without a real git repo or a real VPS.
//
// Bare `pnpm deploy` is shadowed by one of pnpm's own subcommands, so this only ever runs as
// `pnpm run deploy <target...> [--dry-run] [--allow-branch <branch>]` (tools/README.md) — with
// no `--` separator: this repo's pinned pnpm (12.3.4) passes it through as a literal argument
// instead of stripping it, which is exactly the "unknown flag" this file would then reject.

export type Target = 'web' | 'server' | 'content' | 'landing' | 'admin';

export const TARGET_NAMES = ['web', 'server', 'content', 'landing', 'admin', 'all'] as const;

/** `all` expands to this order: the app's own data and code before its static assets. */
export const ALL_TARGETS: readonly Target[] = ['content', 'server', 'web', 'landing', 'admin'];

export interface DeployArgs {
  /** Already expanded — `all` never appears here. */
  readonly targets: readonly Target[];
  /** Lifts the "HEAD equals origin/main" refusal for this one branch. Never lifts the dirty-tree
   *  refusal (what.md §14.4: "the override flag `--allow-branch develop` is for staging"). */
  readonly allowBranch: string | null;
  readonly dryRun: boolean;
}

function isTargetName(value: string): value is (typeof TARGET_NAMES)[number] {
  return (TARGET_NAMES as readonly string[]).includes(value);
}

export function parseDeployArgs(argv: readonly string[]): DeployArgs {
  const targetArgs: string[] = [];
  let allowBranch: string | null = null;
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;

    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg === '--allow-branch') {
      const next = argv[i + 1];
      if (next === undefined) throw new Error('--allow-branch needs a branch name');
      allowBranch = next;
      i++;
      continue;
    }
    if (arg.startsWith('--allow-branch=')) {
      allowBranch = arg.slice('--allow-branch='.length);
      continue;
    }
    if (arg.startsWith('--')) {
      throw new Error(`unknown flag ${arg} (known: --dry-run, --allow-branch <branch>)`);
    }
    targetArgs.push(arg);
  }

  if (targetArgs.length === 0) {
    throw new Error(`a target is required: ${TARGET_NAMES.join(', ')}`);
  }
  for (const name of targetArgs) {
    if (!isTargetName(name)) {
      throw new Error(`unknown target "${name}" (one of ${TARGET_NAMES.join(', ')})`);
    }
  }

  const targets = targetArgs.includes('all')
    ? ALL_TARGETS
    : // De-duplicated, in ALL_TARGETS' order, regardless of the order given on the command line —
      // so `deploy web server` and `deploy server web` run identically.
      ALL_TARGETS.filter((t) => targetArgs.includes(t));

  return { targets, allowBranch, dryRun };
}
