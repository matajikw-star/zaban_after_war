// The flag set shared by `tools/errors`, `tools/logs` and `tools/flags` (what.md §10.3): each
// tool reads only the flags it has a filter for, so one parser is honest about the whole set
// without forcing every tool to accept every flag silently.

export interface CommonFlags {
  readonly group: boolean;
  /** Raw `--since` value, e.g. `24h`, `7d`, `30m`, or an ISO date. Undefined = no lower bound. */
  readonly since: string | undefined;
  readonly kind: string | undefined;
  readonly fingerprint: string | undefined;
  /** A phone number for `--user` (client_errors/word_flags key on the phone, not an id). */
  readonly user: string | undefined;
  readonly route: string | undefined;
  readonly level: string | undefined;
}

const FLAGS_WITH_VALUES = new Set(['since', 'kind', 'fingerprint', 'user', 'route', 'level']);

/** `--flag value` and `--flag=value` both work; unknown flags are a hard error (typo guard). */
export function parseCommonFlags(argv: readonly string[]): CommonFlags {
  const values: Record<string, string> = {};
  let group = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined || !arg.startsWith('--')) {
      throw new Error(`unexpected argument "${arg}"`);
    }
    const body = arg.slice(2);
    const eq = body.indexOf('=');
    const name = eq === -1 ? body : body.slice(0, eq);

    if (name === 'group') {
      group = true;
      continue;
    }
    if (!FLAGS_WITH_VALUES.has(name)) {
      throw new Error(
        `unknown flag --${name} (known: --group, --since, --kind, --fingerprint, --user, --route, --level)`,
      );
    }
    if (eq !== -1) {
      values[name] = body.slice(eq + 1);
      continue;
    }
    const next = argv[i + 1];
    if (next === undefined) throw new Error(`--${name} needs a value`);
    values[name] = next;
    i++;
  }

  return {
    group,
    since: values.since,
    kind: values.kind,
    fingerprint: values.fingerprint,
    user: values.user,
    route: values.route,
    level: values.level,
  };
}

/** PocketBase compares dates as text in its own format (how-why §5.7): `YYYY-MM-DD HH:MM:SS.sssZ`. */
export function pbDate(ms: number): string {
  return new Date(ms).toISOString().replace('T', ' ');
}

/**
 * `24h` / `7d` / `30m` relative to now, or a plain date PocketBase's format or `Date.parse` can
 * read. Throws on anything else — a silently-ignored `--since` would be worse than an error.
 */
export function sinceToPbDate(raw: string | undefined, nowMs: number): string | undefined {
  if (raw === undefined) return undefined;

  const relative = /^(\d+)(m|h|d)$/.exec(raw);
  if (relative) {
    const amount = Number(relative[1]);
    const unitMs = relative[2] === 'm' ? 60_000 : relative[2] === 'h' ? 3_600_000 : 86_400_000;
    return pbDate(nowMs - amount * unitMs);
  }

  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) {
    throw new Error(`--since "${raw}" is not "24h", "7d", "30m", or a date`);
  }
  return pbDate(parsed);
}
