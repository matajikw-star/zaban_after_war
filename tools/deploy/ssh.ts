// How every remote command reaches the VPS (what.md §14.4). Pure — the home directory is a
// parameter — so the exact `ssh` prefix is unit-tested as a string.
//
// `-o BatchMode=yes` always: a deploy must fail, not sit waiting, when a key is refused, a
// passphrase is asked, or the host key is unknown (the first connection to a host is made by hand,
// once, so that its key is in known_hosts — docs/runbooks/deploy.md).
// `-i <file>` only when DEPLOY_SSH_KEY_FILE is set; otherwise ssh's own defaults and agent apply.

export interface SshTarget {
  readonly user: string;
  readonly host: string;
  /** Private key file, already `~`-expanded; `null` = let ssh pick (agent, ~/.ssh/id_*). */
  readonly keyFile: string | null;
}

/**
 * `~` or `~/…` → the home directory. Backslashes become forward slashes: Git Bash's ssh (the one
 * on the machines this runs from) accepts `C:/Users/…`, and a backslash inside the `bash -c`
 * command line is a quoting hazard for no benefit.
 */
export function expandHome(file: string, home: string): string {
  let expanded = file;
  if (file === '~') expanded = home;
  else if (file.startsWith('~/') || file.startsWith('~\\')) expanded = home + file.slice(1);
  return expanded.replace(/\\/g, '/');
}

/** Single-quotes a value for a POSIX shell. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** `ssh -o BatchMode=yes [-i '<key>'] user@host` — every remote step starts with this. */
export function sshPrefix(target: SshTarget): string {
  const key = target.keyFile === null ? '' : ` -i ${shellQuote(target.keyFile)}`;
  return `ssh -o BatchMode=yes${key} ${target.user}@${target.host}`;
}
