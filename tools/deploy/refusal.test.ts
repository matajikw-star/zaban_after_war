import { describe, expect, it } from 'vitest';
import { checkRefusal, type GitStatus } from './refusal.ts';

const clean: GitStatus = {
  dirty: false,
  branch: 'main',
  head: 'aaa111',
  originMain: 'aaa111',
  originAllowBranch: null,
};

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

  it('--allow-branch <branch> allows a clean tree whose HEAD equals origin/<branch>', () => {
    const atOriginDevelop: GitStatus = {
      dirty: false,
      branch: 'develop',
      head: 'ccc333',
      originMain: 'aaa111',
      originAllowBranch: 'ccc333',
    };
    expect(checkRefusal(atOriginDevelop, 'develop')).toEqual({ refuse: false, reason: null });
  });

  it('--allow-branch <branch> allows it from a differently-named local branch, as long as HEAD equals origin/<branch>', () => {
    // The local branch name proves nothing — what matters is that this exact commit is the one
    // that was pushed and reviewed as origin/<branch>.
    const sameCommitOtherName: GitStatus = {
      dirty: false,
      branch: 'feat/whatever',
      head: 'ccc333',
      originMain: 'aaa111',
      originAllowBranch: 'ccc333',
    };
    expect(checkRefusal(sameCommitOtherName, 'develop')).toEqual({ refuse: false, reason: null });
  });

  it('--allow-branch <branch> refuses when HEAD is a local branch literally named that but not equal to origin/<branch> — unpushed commits must not slip through', () => {
    const localDevelopAheadOfOrigin: GitStatus = {
      dirty: false,
      branch: 'develop',
      head: 'ddd444', // has commits origin/develop does not
      originMain: 'aaa111',
      originAllowBranch: 'ccc333',
    };
    const result = checkRefusal(localDevelopAheadOfOrigin, 'develop');
    expect(result.refuse).toBe(true);
    expect(result.reason).toMatch(
      /--allow-branch develop was given but HEAD \(ddd444\) is not origin\/develop \(ccc333\)/,
    );
  });

  it('--allow-branch <branch> refuses when origin/<branch> could not be resolved (never pushed, or origin not fetched)', () => {
    const unresolved: GitStatus = {
      dirty: false,
      branch: 'develop',
      head: 'ccc333',
      originMain: 'aaa111',
      originAllowBranch: null,
    };
    const result = checkRefusal(unresolved, 'develop');
    expect(result.refuse).toBe(true);
    expect(result.reason).toMatch(/could not resolve origin\/develop/);
  });
});
