// The one-time server install, as data (what.md §14.4; docs/runbooks/deploy.md → "First deploy
// (one time)"). Pure, like plan.ts: `provision.ts` prints these steps (`--dry-run`) or runs them.
//
// Runs as root — the only step in this repo that does — because it writes /etc/systemd and
// /etc/caddy, which the `kl` user's narrow sudo (bootstrap.sh) deliberately cannot. Order:
//
//   1. ship the install kit to /root/kl-provision (root-only: a script root runs must not sit in a
//      directory `kl` can write, or `kl` could rewrite it first)
//   2. stream the server env into /opt/kl/.env.new, mode 600, owner kl — from memory, via stdin
//   3. install.sh: binary, unit (enabled, not started), env swap, real Caddyfile (validated first)
//   4. superuser.sh: the PocketBase superuser, credentials via stdin
//   5. remove the kit; append the deploy log
//
// PocketBase is started afterwards by the first `pnpm run deploy server`, not here.

import type { Step } from './plan.ts';
import { sshPrefix } from './ssh.ts';

export const PROVISION_USER = 'root';
export const KIT_DIR = '/root/kl-provision';

export interface ProvisionContext {
  readonly sha: string;
  readonly host: string;
  readonly keyFile: string | null;
  readonly who: string;
  /** Repo-relative directory holding the verified `pocketbase` + `pocketbase.sha256`. */
  readonly binaryDir: string;
}

function ssh(ctx: ProvisionContext): string {
  return sshPrefix({ user: PROVISION_USER, host: ctx.host, keyFile: ctx.keyFile });
}

export function buildProvisionPlan(ctx: ProvisionContext): Step[] {
  const line = `${ctx.sha} provision ${ctx.who} \\$(date -u +%Y-%m-%dT%H:%M:%SZ)`;
  return [
    {
      target: 'provision',
      description: `provision: ship the install kit to ${KIT_DIR}`,
      command:
        // GNU tar resolves each -C against the previous one, so every -C is anchored on the
        // repo root ($PWD: the runner always starts in it), never chained.
        `tar czf - -C "$PWD/${ctx.binaryDir}" pocketbase pocketbase.sha256 ` +
        '-C "$PWD/server" POCKETBASE_VERSION Caddyfile ' +
        '-C "$PWD/server/systemd" kl-pocketbase.service ' +
        '-C "$PWD/server/deploy" install.sh superuser.sh | ' +
        `${ssh(ctx)} "rm -rf ${KIT_DIR} && mkdir -m 700 ${KIT_DIR} && tar xzf - --no-same-owner -C ${KIT_DIR}"`,
    },
    {
      target: 'provision',
      description:
        'provision: write the server env to /opt/kl/.env.new (stdin, mode 600, owner kl)',
      command: `${ssh(ctx)} "install -m 600 -o kl -g kl /dev/stdin /opt/kl/.env.new"`,
      stdin: 'server-env',
    },
    {
      target: 'provision',
      description: 'provision: install pocketbase, its unit, the env and the real Caddyfile',
      command: `${ssh(ctx)} "bash ${KIT_DIR}/install.sh ${KIT_DIR}"`,
    },
    {
      target: 'provision',
      description: 'provision: upsert the PocketBase superuser (credentials on stdin)',
      command: `${ssh(ctx)} "bash ${KIT_DIR}/superuser.sh"`,
      stdin: 'superuser-credentials',
    },
    {
      target: 'provision',
      description: 'provision: remove the install kit',
      command: `${ssh(ctx)} "rm -rf ${KIT_DIR}"`,
    },
    {
      target: 'log',
      description: 'record: append /opt/kl/deploys.log',
      // Appended as root, so the file is handed back to kl — `pnpm run deploy` appends as kl.
      command: `${ssh(ctx)} "echo '${line}' >> /opt/kl/deploys.log && chown kl:kl /opt/kl/deploys.log"`,
    },
  ];
}
