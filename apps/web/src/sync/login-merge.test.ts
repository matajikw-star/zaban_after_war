import { describe, expect, it } from 'vitest';
import { AppError } from '../errors.ts';
import type { Profile } from '../stores/settings.ts';
import type { BackupTrigger } from './backup.ts';
import { asProfile, type LoginMergeDeps, loginMerge, mergeProfile } from './login-merge.ts';

const LOCAL: Profile = {
  minutesPerDay: 20,
  dailyGoal: 200,
  examDate: null,
  fieldCode: null,
  updatedAt: 1000,
};

interface Recorder {
  requeued: number;
  adopted: Profile[];
  pushed: Profile[];
  backups: BackupTrigger[];
}

function deps(
  server: unknown,
  local: { profile: Profile; hasProfile: boolean },
  overrides: Partial<LoginMergeDeps> = {},
): { deps: LoginMergeDeps; rec: Recorder } {
  const rec: Recorder = { requeued: 0, adopted: [], pushed: [], backups: [] };
  return {
    rec,
    deps: {
      markAllUnsynced: async () => {
        rec.requeued += 1;
        return 7;
      },
      fetchServerProfile: async () => server,
      pushProfile: async (p) => {
        rec.pushed.push(p);
      },
      localProfile: () => local,
      adoptProfile: async (p) => {
        rec.adopted.push(p);
      },
      requestBackup: async (trigger) => {
        rec.backups.push(trigger);
      },
      ...overrides,
    },
  };
}

describe('loginMerge', () => {
  it('re-queues every local event, then fires a login backup', async () => {
    const { deps: d, rec } = deps(null, { profile: LOCAL, hasProfile: true });
    await loginMerge(d, 'user-a');
    expect(rec.requeued).toBe(1);
    expect(rec.backups).toEqual(['login']);
  });

  it('does not wait for the backup: a slow network never holds the login screen', async () => {
    let settled = false;
    const { deps: d } = deps(
      null,
      { profile: LOCAL, hasProfile: true },
      {
        requestBackup: () => new Promise<void>(() => {}), // never resolves
      },
    );
    await loginMerge(d, 'user-a').then(() => {
      settled = true;
    });
    expect(settled).toBe(true);
  });

  it('a profile failure is not a login failure, and the backup still runs', async () => {
    const { deps: d, rec } = deps(
      null,
      { profile: LOCAL, hasProfile: true },
      {
        fetchServerProfile: async () => {
          throw new AppError('NETWORK', 'offline');
        },
      },
    );
    await loginMerge(d, 'user-a');
    expect(rec.backups).toEqual(['login']);
  });
});

describe('mergeProfile: newer updatedAt wins (§7.4)', () => {
  it('a fresh device adopts the server profile', async () => {
    const server = { ...LOCAL, minutesPerDay: 30, dailyGoal: 300, updatedAt: 500 };
    const { deps: d, rec } = deps(server, { profile: LOCAL, hasProfile: false });
    expect(await mergeProfile(d)).toBe('adopted');
    expect(rec.adopted).toEqual([server]);
  });

  it('a newer server profile replaces the local one', async () => {
    const server = { ...LOCAL, examDate: 5, updatedAt: 2000 };
    const { deps: d, rec } = deps(server, { profile: LOCAL, hasProfile: true });
    expect(await mergeProfile(d)).toBe('adopted');
    expect(rec.adopted[0]?.examDate).toBe(5);
  });

  it('a newer local profile is pushed', async () => {
    const server = { ...LOCAL, updatedAt: 10 };
    const { deps: d, rec } = deps(server, { profile: LOCAL, hasProfile: true });
    expect(await mergeProfile(d)).toBe('pushed');
    expect(rec.pushed).toEqual([LOCAL]);
  });

  it('a local profile is pushed when the server has none', async () => {
    const { deps: d, rec } = deps(null, { profile: LOCAL, hasProfile: true });
    expect(await mergeProfile(d)).toBe('pushed');
    expect(rec.pushed).toHaveLength(1);
  });

  it('equal is not newer: nothing moves', async () => {
    const { deps: d, rec } = deps({ ...LOCAL }, { profile: LOCAL, hasProfile: true });
    expect(await mergeProfile(d)).toBe('unchanged');
    expect(rec.adopted).toEqual([]);
    expect(rec.pushed).toEqual([]);
  });

  it('neither side has one: nothing moves', async () => {
    const { deps: d } = deps(null, { profile: LOCAL, hasProfile: false });
    expect(await mergeProfile(d)).toBe('unchanged');
  });

  it('a malformed server profile is ignored, never adopted', async () => {
    const { deps: d, rec } = deps(
      { minutesPerDay: 'twenty', updatedAt: 9e12 },
      { profile: LOCAL, hasProfile: true },
    );
    expect(await mergeProfile(d)).toBe('pushed');
    expect(rec.adopted).toEqual([]);
  });
});

describe('asProfile', () => {
  it('accepts a complete profile and drops extra fields', () => {
    expect(asProfile({ ...LOCAL, extra: 1 })).toEqual(LOCAL);
  });

  it('rejects anything incomplete', () => {
    expect(asProfile(null)).toBeNull();
    expect(asProfile('x')).toBeNull();
    expect(asProfile({ ...LOCAL, updatedAt: '1' })).toBeNull();
    expect(asProfile({ ...LOCAL, examDate: '1405' })).toBeNull();
    expect(asProfile({ ...LOCAL, fieldCode: 12 })).toBeNull();
  });
});
