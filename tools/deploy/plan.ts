// Builds the ordered list of shell commands a deploy runs (what.md §14.4). Pure — a `Step` is
// just `{target, description, command}`, so the plan is unit-tested as data without ever
// touching a real VPS. `index.ts` either prints each command (`--dry-run`) or runs it.
//
// This machine has `ssh` and `tar` but no `rsync` (ticket dev-server/04), so every transfer is
// `tar | ssh … tar x` into a `.new` sibling directory, then a same-host `mv` swap — the atomic
// step what.md originally wrote as an rsync-to-`.new`-then-`mv` (corrected in the same commit).
// A `mv` of a populated directory onto another populated directory does not replace it on Linux
// (`rename()` fails on a non-empty target), so the swap is two renames — move the old directory
// aside, then move the new one into place — each individually atomic, with the gap between them
// measured in milliseconds.

import type { Target } from './args.ts';
import { sshPrefix } from './ssh.ts';

export interface DeployContext {
  readonly sha: string;
  readonly host: string;
  readonly user: string;
  /** DEPLOY_SSH_KEY_FILE, `~`-expanded; `null` = ssh's own defaults (see ssh.ts). */
  readonly keyFile: string | null;
  /** Who ran it — goes on the `/opt/kl/deploys.log` line (what.md §10.5). */
  readonly who: string;
}

/** A secret the runner pipes into a step's stdin — named here, supplied only at run time. */
export type StdinSource = 'server-env' | 'superuser-credentials';

export interface Step {
  readonly target: Target | 'log' | 'provision';
  readonly description: string;
  /** One line, run through `bash -c` — pipes and `ssh … "…"` are expected. Never a secret. */
  readonly command: string;
  /** Set only by provision-plan.ts: the step reads that secret on stdin. The plan names it; the
   *  value never enters a Step, so printing a plan cannot print a secret. */
  readonly stdin?: StdinSource;
}

/** `ssh -o BatchMode=yes [-i key] user@host` — see ssh.ts. */
function ssh(ctx: DeployContext): string {
  return sshPrefix({ user: ctx.user, host: ctx.host, keyFile: ctx.keyFile });
}

/** what.md §14.4: the server target polls before declaring success, since a restart is not
 *  instant. `HEALTH_TIMEOUT_S` is a budget, not a promise the server is up by then. */
const HEALTH_TIMEOUT_S = 30;

/** Must match bootstrap.sh's sudoers line character for character — sudo compares the path. */
export const RESTART_POCKETBASE = '/bin/systemctl restart kl-pocketbase';
const HEALTH_POLL_INTERVAL_S = 1;

/** DEPLOY_HEALTH_TIMEOUT: a distinct, greppable string so a failed deploy's exit is diagnosable
 *  from its output alone (what.md §17.4's "errors carry codes", applied to a CLI exit instead of
 *  an AppError). All `$`-arithmetic is backslash-escaped so it runs on the remote shell, not the
 *  local one that builds this command (the same trick `logStep` already uses for `\$(date …)`). */
function healthCheckCommand(ctx: DeployContext): string {
  const remoteScript =
    `n=0; until curl -sf http://127.0.0.1:8090/api/health >/dev/null; do ` +
    `n=\\$((n + ${HEALTH_POLL_INTERVAL_S})); ` +
    `if [ \\$n -ge ${HEALTH_TIMEOUT_S} ]; then ` +
    `echo 'DEPLOY_HEALTH_TIMEOUT: kl-pocketbase did not answer /api/health within ${HEALTH_TIMEOUT_S}s' >&2; ` +
    `exit 1; ` +
    `fi; ` +
    `sleep ${HEALTH_POLL_INTERVAL_S}; ` +
    `done`;
  return `${ssh(ctx)} "${remoteScript}"`;
}

/** `local/dir/` → `remoteDir.new` → swapped into `remoteDir`. Two steps, always in this order. */
function shipAndSwap(
  target: Target,
  label: string,
  localDir: string,
  remoteDir: string,
  ctx: DeployContext,
  excludeMaps = false,
): Step[] {
  const exclude = excludeMaps ? " --exclude='*.map'" : '';
  return [
    {
      target,
      description: `${label}: ship`,
      command:
        `tar czf -${exclude} -C ${localDir} . | ` +
        `${ssh(ctx)} "rm -rf ${remoteDir}.new && mkdir -p ${remoteDir}.new && tar xzf - -C ${remoteDir}.new"`,
    },
    {
      target,
      description: `${label}: swap in`,
      command:
        `${ssh(ctx)} "` +
        `[ -d ${remoteDir} ] && mv ${remoteDir} ${remoteDir}.prev; ` +
        `mv ${remoteDir}.new ${remoteDir}; ` +
        `rm -rf ${remoteDir}.prev"`,
    },
  ];
}

function contentSteps(ctx: DeployContext): Step[] {
  return [
    {
      target: 'content',
      description: 'content: build free.json / paid.json / manifest.json',
      command: 'pnpm content:build',
    },
    ...shipAndSwap('content', 'content: package', 'server/content', '/opt/kl/content', ctx),
  ];
}

function serverSteps(ctx: DeployContext): Step[] {
  return [
    ...shipAndSwap('server', 'server: pb_hooks', 'server/pb_hooks', '/opt/kl/pb_hooks', ctx),
    ...shipAndSwap(
      'server',
      'server: pb_migrations',
      'server/pb_migrations',
      '/opt/kl/pb_migrations',
      ctx,
    ),
    // Migrations run on start (what.md §14.4): the restart is what applies them. `kl` is not
    // root: bootstrap.sh grants it NOPASSWD sudo for exactly `/bin/systemctl restart
    // kl-pocketbase` (and caddy's restart/reload/status), so the full path must match that
    // sudoers line, and `-n` makes sudo fail instead of prompting. A restart also *starts* a
    // stopped unit — this is how the first deploy after `pnpm run provision` brings PocketBase
    // up — so it refuses while /opt/kl/.env is missing rather than start without secrets.
    {
      target: 'server',
      description: 'server: restart kl-pocketbase',
      command:
        `${ssh(ctx)} "` +
        `test -f /opt/kl/.env || { echo 'DEPLOY_NO_ENV: /opt/kl/.env is missing - run pnpm run provision first' >&2; exit 1; }; ` +
        `sudo -n ${RESTART_POCKETBASE}"`,
    },
    {
      target: 'server',
      description: 'server: health check',
      command: healthCheckCommand(ctx),
    },
  ];
}

/**
 * The free package (`free.json`) is not in git: `pnpm content:build` writes it to
 * `apps/web/public/content/`, Vite copies it to `dist/content/`, and PocketBase serves it from
 * pb_public with the site (what.md §6). A web build without it ships a site with no words — and
 * the swap would delete the copy already live. So `web` builds the content first unless the
 * `content` target already did in this run, and refuses to ship a dist without the file.
 */
function webSteps(ctx: DeployContext, contentBuiltEarlier: boolean): Step[] {
  const build: Step[] = contentBuiltEarlier
    ? []
    : [
        {
          target: 'web',
          description: 'web: build the free package',
          command: 'pnpm content:build',
        },
      ];
  return [
    ...build,
    { target: 'web', description: 'web: build', command: 'pnpm --filter @kl/web build' },
    {
      target: 'web',
      description: 'web: check the free package is in the build',
      command:
        'test -s apps/web/dist/content/free.json || ' +
        "{ echo 'DEPLOY_NO_FREE_PACKAGE: apps/web/dist/content/free.json is missing' >&2; exit 1; }",
    },
    ...shipAndSwap('web', 'web: site', 'apps/web/dist', '/opt/kl/pb_public', ctx, true),
    {
      target: 'web',
      description: 'web: ship source maps',
      command:
        `cd apps/web/dist && find . -name '*.map' | tar czf - -T - | ` +
        `${ssh(ctx)} "mkdir -p /opt/kl/sourcemaps/${ctx.sha} && tar xzf - -C /opt/kl/sourcemaps/${ctx.sha}"`,
    },
  ];
}

function landingSteps(ctx: DeployContext): Step[] {
  return [
    {
      target: 'landing',
      description: 'landing: build',
      command: 'pnpm --filter @kl/landing build',
    },
    ...shipAndSwap('landing', 'landing: site', 'apps/landing/dist', '/opt/kl/landing', ctx),
  ];
}

function adminSteps(ctx: DeployContext): Step[] {
  return [
    { target: 'admin', description: 'admin: build', command: 'pnpm --filter @kl/admin build' },
    ...shipAndSwap('admin', 'admin: site', 'apps/admin/dist', '/opt/kl/admin', ctx),
  ];
}

const BUILDERS: Record<Target, (ctx: DeployContext, targets: readonly Target[]) => Step[]> = {
  content: contentSteps,
  server: serverSteps,
  // args.ts orders `content` before `web`, so when both are asked for the content is built once.
  web: (ctx, targets) => webSteps(ctx, targets.includes('content')),
  landing: landingSteps,
  admin: adminSteps,
};

/** what.md §10.5: one line per deploy, appended on the VPS, and echoed for `wiki/log.md`. */
export function deployLogLine(ctx: DeployContext, targets: readonly Target[]): string {
  return `${ctx.sha} ${targets.join(',')} ${ctx.who} <deployed-at>`;
}

function logStep(ctx: DeployContext, targets: readonly Target[]): Step {
  // `\$(...)` so the date is read on the VPS, not on whichever machine runs this script.
  const line = `${ctx.sha} ${targets.join(',')} ${ctx.who} \\$(date -u +%Y-%m-%dT%H:%M:%SZ)`;
  return {
    target: 'log',
    description: 'record: append /opt/kl/deploys.log',
    command: `${ssh(ctx)} "echo '${line}' >> /opt/kl/deploys.log"`,
  };
}

export function buildPlan(targets: readonly Target[], ctx: DeployContext): Step[] {
  const steps = targets.flatMap((target) => BUILDERS[target](ctx, targets));
  return [...steps, logStep(ctx, targets)];
}
