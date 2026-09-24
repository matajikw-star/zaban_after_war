import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildProvisionPlan, KIT_DIR, type ProvisionContext } from './provision-plan.ts';

const ctx: ProvisionContext = {
  sha: 'abc1234',
  host: '203.0.113.9',
  keyFile: 'C:/Users/me/.ssh/kl_root.pem',
  who: 'tester',
  binaryDir: 'server/.pb/linux_amd64',
};
const steps = buildProvisionPlan(ctx);
const order = steps.map((s) => s.description);
const find = (prefix: string) => steps.find((s) => s.description.startsWith(prefix));

describe('buildProvisionPlan', () => {
  it('runs every remote step as root, with the key, never prompting', () => {
    const remote = steps.filter((s) => s.command.includes('ssh '));
    expect(remote.length).toBe(steps.length);
    for (const step of remote) {
      expect(step.command).toContain(
        "ssh -o BatchMode=yes -i 'C:/Users/me/.ssh/kl_root.pem' root@203.0.113.9",
      );
    }
  });

  it('ships the kit into a root-only directory, not one kl can write', () => {
    const ship = find('provision: ship');
    expect(KIT_DIR.startsWith('/root/')).toBe(true);
    expect(ship?.command).toContain(`mkdir -m 700 ${KIT_DIR}`);
    expect(ship?.command).toContain('--no-same-owner');
  });

  it('ships every file install.sh checks for, plus superuser.sh', () => {
    const ship = find('provision: ship')?.command ?? '';
    const installSh = readFileSync(
      new URL('../../server/deploy/install.sh', import.meta.url),
      'utf8',
    );
    const expected = /for f in ([^;]+); do/.exec(installSh)?.[1]?.trim().split(/\s+/) ?? [];
    expect(expected.length).toBeGreaterThan(0);
    for (const file of [...expected, 'install.sh', 'superuser.sh']) {
      expect(ship).toMatch(new RegExp(`\\s${file.replace('.', '\\.')}(\\s|$)`));
    }
  });

  it('carries the two secrets on stdin only, and puts none in any command', () => {
    expect(find('provision: write the server env')?.stdin).toBe('server-env');
    expect(find('provision: upsert the PocketBase superuser')?.stdin).toBe('superuser-credentials');
    expect(steps.filter((s) => s.stdin !== undefined)).toHaveLength(2);
    for (const step of steps) {
      expect(step.command).not.toMatch(/KL_ADMIN|PASSWORD|SMS_API_KEY|\.env\.local/);
    }
  });

  it('writes the env mode 600 owned by kl, beside the live file, for install.sh to swap in', () => {
    expect(find('provision: write the server env')?.command).toContain(
      'install -m 600 -o kl -g kl /dev/stdin /opt/kl/.env.new',
    );
  });

  it('orders ship → env → install → superuser → clean up → log', () => {
    expect(order).toEqual([
      `provision: ship the install kit to ${KIT_DIR}`,
      'provision: write the server env to /opt/kl/.env.new (stdin, mode 600, owner kl)',
      'provision: install pocketbase, its unit, the env and the real Caddyfile',
      'provision: upsert the PocketBase superuser (credentials on stdin)',
      'provision: remove the install kit',
      'record: append /opt/kl/deploys.log',
    ]);
  });

  it('hands the deploy log back to kl after appending as root', () => {
    const log = find('record:')?.command ?? '';
    expect(log).toContain('abc1234 provision tester');
    expect(log).toContain('chown kl:kl /opt/kl/deploys.log');
    // the date is read on the VPS, not here
    expect(log).toContain('\\$(date -u');
  });

  it('never starts PocketBase itself — the first deploy server does', () => {
    for (const step of steps) expect(step.command).not.toMatch(/systemctl (start|restart)/);
  });
});
