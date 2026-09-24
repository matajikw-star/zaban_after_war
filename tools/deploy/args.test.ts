import { describe, expect, it } from 'vitest';
import { ALL_TARGETS, parseDeployArgs } from './args.ts';

describe('parseDeployArgs', () => {
  it('parses one target', () => {
    expect(parseDeployArgs(['web'])).toEqual({
      targets: ['web'],
      allowBranch: null,
      dryRun: false,
    });
  });

  it('expands "all" to every target, in a fixed order', () => {
    expect(parseDeployArgs(['all']).targets).toEqual(ALL_TARGETS);
  });

  it('de-duplicates and orders multiple targets the same way regardless of input order', () => {
    expect(parseDeployArgs(['web', 'server']).targets).toEqual(['server', 'web']);
    expect(parseDeployArgs(['server', 'web']).targets).toEqual(['server', 'web']);
    expect(parseDeployArgs(['web', 'web']).targets).toEqual(['web']);
  });

  it('reads --dry-run', () => {
    expect(parseDeployArgs(['web', '--dry-run']).dryRun).toBe(true);
    expect(parseDeployArgs(['web']).dryRun).toBe(false);
  });

  it('reads --allow-branch as a separate argument or with =', () => {
    expect(parseDeployArgs(['web', '--allow-branch', 'develop']).allowBranch).toBe('develop');
    expect(parseDeployArgs(['web', '--allow-branch=develop']).allowBranch).toBe('develop');
  });

  it('accepts flags before or after the target', () => {
    expect(parseDeployArgs(['--dry-run', '--allow-branch', 'develop', 'all'])).toEqual({
      targets: ALL_TARGETS,
      allowBranch: 'develop',
      dryRun: true,
    });
  });

  it('rejects a missing target', () => {
    expect(() => parseDeployArgs([])).toThrow(/a target is required/);
    expect(() => parseDeployArgs(['--dry-run'])).toThrow(/a target is required/);
  });

  it('rejects an unknown target', () => {
    expect(() => parseDeployArgs(['staging'])).toThrow(/unknown target "staging"/);
  });

  it('rejects an unknown flag', () => {
    expect(() => parseDeployArgs(['web', '--force'])).toThrow(/unknown flag --force/);
  });

  it('rejects --allow-branch with no value', () => {
    expect(() => parseDeployArgs(['web', '--allow-branch'])).toThrow(/needs a branch name/);
  });
});
