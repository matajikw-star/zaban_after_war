import { describe, expect, it } from 'vitest';
import { ALL_TARGETS } from './args.ts';
import { buildPlan, type DeployContext } from './plan.ts';

const ctx: DeployContext = { sha: 'abc1234', host: '1.2.3.4', user: 'kl', who: 'tester' };

describe('buildPlan', () => {
  it('never uses rsync — this machine has ssh and tar but no rsync (ticket dev-server/04)', () => {
    const steps = buildPlan(ALL_TARGETS, ctx);
    for (const step of steps) expect(step.command).not.toMatch(/rsync/);
  });

  it('every remote write to a live directory goes through a .new sibling first', () => {
    const steps = buildPlan(['web'], ctx);
    const ship = steps.find((s) => s.description === 'web: site: ship');
    const swap = steps.find((s) => s.description === 'web: site: swap in');
    expect(ship?.command).toContain('/opt/kl/pb_public.new');
    expect(swap?.command).toContain('mv /opt/kl/pb_public.new /opt/kl/pb_public');
  });

  it('web excludes *.map from the site tarball and ships them to /opt/kl/sourcemaps/<sha> separately', () => {
    const steps = buildPlan(['web'], ctx);
    const ship = steps.find((s) => s.description === 'web: site: ship');
    const maps = steps.find((s) => s.description === 'web: ship source maps');
    expect(ship?.command).toContain("--exclude='*.map'");
    expect(maps?.command).toContain('/opt/kl/sourcemaps/abc1234');
  });

  it('server restarts kl-pocketbase and health-checks after both directories are swapped in', () => {
    const steps = buildPlan(['server'], ctx);
    const order = steps.map((s) => s.description);
    expect(order.indexOf('server: pb_hooks: swap in')).toBeLessThan(
      order.indexOf('server: restart kl-pocketbase'),
    );
    expect(order.indexOf('server: pb_migrations: swap in')).toBeLessThan(
      order.indexOf('server: restart kl-pocketbase'),
    );
    expect(order.indexOf('server: restart kl-pocketbase')).toBeLessThan(
      order.indexOf('server: health check'),
    );
  });

  it('server health check polls /api/health with a timeout instead of a single racy curl', () => {
    const steps = buildPlan(['server'], ctx);
    const health = steps.find((s) => s.description === 'server: health check');
    expect(health?.command).toContain('until curl -sf http://127.0.0.1:8090/api/health');
    expect(health?.command).toContain('sleep 1');
    // failure exits non-zero with a distinct, greppable message
    expect(health?.command).toContain('DEPLOY_HEALTH_TIMEOUT');
    expect(health?.command).toContain('exit 1');
    // the timeout arithmetic must be escaped so it runs on the remote shell, not the local one
    // building this command string
    expect(health?.command).toContain('\\$((n +');
  });

  it('content builds before it ships', () => {
    const steps = buildPlan(['content'], ctx);
    const order = steps.map((s) => s.description);
    expect(order[0]).toBe('content: build free.json / paid.json / manifest.json');
  });

  it('always ends with the deploy-log line, naming every requested target and the sha', () => {
    const steps = buildPlan(['web', 'landing'], ctx);
    const last = steps[steps.length - 1];
    expect(last?.description).toBe('record: append /opt/kl/deploys.log');
    expect(last?.command).toContain('web,landing');
    expect(last?.command).toContain('abc1234');
    expect(last?.command).toContain('/opt/kl/deploys.log');
  });

  it('targets ssh as user@host from the context, for every remote step', () => {
    const steps = buildPlan(['admin'], ctx);
    const remoteSteps = steps.filter((s) => s.command.includes('ssh '));
    expect(remoteSteps.length).toBeGreaterThan(0);
    for (const step of remoteSteps) expect(step.command).toContain('ssh kl@1.2.3.4');
  });
});
