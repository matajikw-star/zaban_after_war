import { describe, expect, it } from 'vitest';
import { checkRefusal, type GitStatus, gate } from './refusal.ts';

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

describe('gate', () => {
  const refused = { refuse: true, reason: 'HEAD (bbb222) is not origin/main (aaa111)' };
  const allowed = { refuse: false, reason: null };

  it('a real run obeys a refusal', () => {
    expect(gate(refused, false)).toEqual({ kind: 'refuse', reason: refused.reason });
  });

  it('a real run with no refusal runs', () => {
    expect(gate(allowed, false)).toEqual({ kind: 'run' });
  });

  it('--dry-run never stops on a refusal: it previews and carries the reason as a warning', () => {
    expect(gate(refused, true)).toEqual({ kind: 'preview', wouldRefuse: refused.reason });
  });

  it('--dry-run with nothing to refuse previews with no warning', () => {
    expect(gate(allowed, true)).toEqual({ kind: 'preview', wouldRefuse: null });
  });

  it('a dirty tree: the dry run still previews, the real run is still refused', () => {
    const dirty = checkRefusal({ ...clean, dirty: true }, null);
    expect(gate(dirty, true).kind).toBe('preview');
    expect(gate(dirty, false).kind).toBe('refuse');
  });
});
