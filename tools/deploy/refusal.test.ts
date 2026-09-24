import { describe, expect, it } from 'vitest';
import { checkRefusal, type GitStatus } from './refusal.ts';

const clean: GitStatus = { dirty: false, branch: 'main', head: 'aaa111', originMain: 'aaa111' };

describe('checkRefusal', () => {
  it('allows a clean tree on main, at origin/main', () => {
    expect(checkRefusal(clean, null)).toEqual({ refuse: false, reason: null });
  });

  it('refuses a dirty tree even on main at origin/main', () => {
    const result = checkRefusal({ ...clean, dirty: true }, null);
    expect(result.refuse).toBe(true);
    expect(result.reason).toMatch(/dirty/);
  });

  it('refuses a dirty tree even with --allow-branch', () => {
    const result = checkRefusal({ ...clean, dirty: true, branch: 'develop' }, 'develop');
    expect(result.refuse).toBe(true);
    expect(result.reason).toMatch(/dirty/);
  });

  it('refuses when HEAD is not origin/main and no --allow-branch was given', () => {
    const result = checkRefusal({ ...clean, head: 'bbb222' }, null);
    expect(result.refuse).toBe(true);
    expect(result.reason).toMatch(/is not origin\/main/);
  });

  it('refuses on a feature branch with a clean tree and no --allow-branch', () => {
    const result = checkRefusal({ ...clean, branch: 'feat/x', head: 'bbb222' }, null);
    expect(result.refuse).toBe(true);
  });

  it('--allow-branch <branch> allows a clean tree on exactly that branch, HEAD mismatch or not', () => {
    const onDevelop: GitStatus = {
      dirty: false,
      branch: 'develop',
      head: 'ccc333',
      originMain: 'aaa111',
    };
    expect(checkRefusal(onDevelop, 'develop')).toEqual({ refuse: false, reason: null });
  });

  it('--allow-branch <branch> still refuses when HEAD is on a different branch', () => {
    const onMain: GitStatus = {
      dirty: false,
      branch: 'main',
      head: 'aaa111',
      originMain: 'aaa111',
    };
    const result = checkRefusal(onMain, 'develop');
    expect(result.refuse).toBe(true);
    expect(result.reason).toMatch(/--allow-branch develop was given but HEAD is on "main"/);
  });
});
