// Empirical proof for ticket dev-server/05 #1: `/opt/kl/deploys.log` recorded the literal text
// `$(date -u +%Y-%m-%dT%H:%M:%SZ)` instead of a timestamp, because the date sat inside a single
// quote on the *remote* shell (it never expands there). These tests never touch a VPS — `ssh` is
// shadowed by a shell function in the exact same `bash -c` invocation run.ts's `runPlan` uses
// (`execFileSync('bash', ['-c', step.command], …)`), which captures the literal string the real
// `ssh` binary would have sent to the VPS, then runs *that* through a second, separate `bash -c`
// (standing in for the remote shell) against a throwaway file instead of `/opt/kl/deploys.log`.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { logAppendRemoteCommand } from './plan.ts';
import { shellQuote } from './ssh.ts';

/** Mirrors logStep/buildProvisionPlan: `ssh <prefix> <shellQuote(remote command)>`. */
function buildLocalCommand(fields: string): string {
  return `ssh -o BatchMode=yes kl@example ${shellQuote(logAppendRemoteCommand(fields))}`;
}

/** Runs `localCommand` exactly as run.ts's runPlan would (`bash -c`), with `ssh` shadowed by a
 *  function that prints its own last argument instead of connecting anywhere — i.e. exactly the
 *  string the real ssh binary would hand to the VPS's shell. */
function captureWhatSshWouldSend(localCommand: string): string {
  const script = `ssh() { printf '%s' "\${@: -1}"; }\n${localCommand}\n`;
  return execFileSync('bash', ['-c', script], { encoding: 'utf8' });
}

let tmpDir: string | undefined;

afterEach(() => {
  if (tmpDir !== undefined) rmSync(tmpDir, { recursive: true, force: true });
  tmpDir = undefined;
});

/** Runs the captured remote command against a throwaway file standing in for the real
 *  `/opt/kl/deploys.log`, simulating the remote shell, and returns what it wrote (if anything). */
function runAsRemoteShell(remoteCommand: string): { logged: string | null; dir: string } {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'kl-deploy-log-'));
  const logFile = path.join(tmpDir, 'deploys.log').replace(/\\/g, '/');
  execFileSync('bash', ['-c', remoteCommand.replace('/opt/kl/deploys.log', logFile)], {
    cwd: tmpDir,
  });
  return { logged: existsSync(logFile) ? readFileSync(logFile, 'utf8') : null, dir: tmpDir };
}

describe('logAppendRemoteCommand — date expansion and injection safety', () => {
  it('the $(date …) survives the local bash -c unexpanded, as real quote/dollar text', () => {
    const remoteCommand = captureWhatSshWouldSend(buildLocalCommand('abc1234 web,server tester'));
    // it must not have expanded already, locally — that would mean it ran on the wrong clock
    // (and, for this fields value, prove it never even reached the "remote" step below)
    expect(remoteCommand).toContain('$(date -u +%Y-%m-%dT%H:%M:%SZ)');
    expect(remoteCommand).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/);
  });

  it('the date expands on the remote shell — the actual bug this ticket fixes', () => {
    const remoteCommand = captureWhatSshWouldSend(buildLocalCommand('abc1234 web,server tester'));
    const { logged } = runAsRemoteShell(remoteCommand);
    expect(logged?.trim()).toMatch(
      /^abc1234 web,server tester \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/,
    );
  });

  it('a who containing $(…), backticks and quotes cannot execute, only ever gets logged as text', () => {
    const payload = 'abc1234 web $(touch pwned)evil\'; touch pwned2; echo \'`id`"x"';
    const remoteCommand = captureWhatSshWouldSend(buildLocalCommand(payload));
    const { logged, dir } = runAsRemoteShell(remoteCommand);

    expect(existsSync(path.join(dir, 'pwned'))).toBe(false);
    expect(existsSync(path.join(dir, 'pwned2'))).toBe(false);
    expect(logged).toContain('$(touch pwned)');
    expect(logged).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/);
  });

  it('a plain apostrophe in who (a real git user.name) round-trips intact', () => {
    const remoteCommand = captureWhatSshWouldSend(buildLocalCommand("abc1234 web O'Brien"));
    const { logged } = runAsRemoteShell(remoteCommand);
    expect(logged?.trim()).toMatch(/^abc1234 web O'Brien \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });
});
