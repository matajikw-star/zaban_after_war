// Builds /opt/kl/.env — the server's secrets and settings (what.md §18) — for `pnpm run
// provision`. Pure: the example file's text and the values are parameters, so the rules are
// unit-tested without a real `.env.local`. The result lives only in memory: provision.ts streams it
// over ssh into `install -m 600 -o kl -g kl /dev/stdin …` and never writes or prints it.
//
// Which names: exactly those under the "VPS / PocketBase" heading of `.env.example`, the list of
// record — so a local-tool secret (`KL_ADMIN_PASSWORD`, `DEPLOY_*`, `VPS_ROOT_PASSWORD`) can never
// reach the server file, and a name added to that section is picked up without touching this.
//
// Where each value comes from, first match wins:
//   1. a STAGING_OVERRIDES entry — fixed in code, not configurable, not overridable;
//   2. `.env.local` / the environment, when non-empty;
//   3. the default `.env.example` documents for it, when non-empty (all non-secret: paths, URLs);
//   4. otherwise the name is left out, and the hooks' `env.check` warns about it at boot, as
//      designed (server/pb_hooks/lib/env.js: a missing secret is a warning, never a crash).

export interface ExampleEntry {
  readonly name: string;
  /** What `.env.example` documents after the `=`, inline comment removed; may be ''. */
  readonly defaultValue: string;
}

export type ValueSource = 'override' | 'environment' | 'example-default' | 'unset';

export interface ResolvedEntry {
  readonly name: string;
  readonly source: ValueSource;
}

export interface ServerEnv {
  /** The file's text. Secret — never logged, never written to a local file. */
  readonly content: string;
  /** Name and source for every server name, in `.env.example` order — safe to print. */
  readonly entries: readonly ResolvedEntry[];
}

/**
 * Staging, until the owner says otherwise (what.md §14.4, §18). Not a flag and not read from the
 * environment: shipping `SMS_PROVIDER=kavenegar` from this step must be impossible, not merely
 * unlikely. `mock` = no SMS is sent and every phone signs in with 123456 (the server says so at
 * every boot). `ZARINPAL_SANDBOX=1` because under mock SMS anyone can be anyone, so no real money
 * may move (the payment ticket's hard gate, `.scratch/dev-payment/issues/01-…`).
 */
export const STAGING_OVERRIDES: Readonly<Record<string, string>> = {
  SMS_PROVIDER: 'mock',
  ZARINPAL_SANDBOX: '1',
};

/** Without these the server cannot serve its own origin, content or source maps: refuse. */
export const REQUIRED_SERVER_NAMES: readonly string[] = [
  'SMS_PROVIDER',
  'PUBLIC_APP_ORIGIN',
  'CONTENT_DIR',
  'SOURCEMAP_DIR',
];

const SECTION_HEADING = /^#\s*---\s*VPS \/ PocketBase/;
const ANY_HEADING = /^#\s*---/;
const NAME = /^[A-Z][A-Z0-9_]*$/;

/** The "VPS / PocketBase" section of `.env.example`, in file order. */
export function parseServerSection(exampleText: string): ExampleEntry[] {
  const entries: ExampleEntry[] = [];
  let inSection = false;

  for (const raw of exampleText.split(/\r?\n/)) {
    const line = raw.trim();
    if (SECTION_HEADING.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection && ANY_HEADING.test(line)) break;
    if (!inSection || line === '' || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const name = line.slice(0, eq).trim();
    if (!NAME.test(name)) continue;
    // `NAME=value   # comment` — a `#` after whitespace starts a comment in this file.
    const defaultValue = line
      .slice(eq + 1)
      .replace(/(^|\s+)#.*$/, '')
      .trim();
    entries.push({ name, defaultValue });
  }

  if (entries.length === 0) {
    throw new Error(
      '.env.example has no "--- VPS / PocketBase" section — cannot tell which names go to the server',
    );
  }
  return entries;
}

/**
 * systemd's EnvironmentFile strips surrounding quotes and treats backslashes specially; a newline
 * would start a new assignment. A value with any of these is refused rather than escaped, so the
 * file is always the plain `NAME=value` it looks like.
 */
function checkValue(name: string, value: string): void {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what is refused
  if (/[\u0000-\u001f\u007f"'\\]/.test(value) || value !== value.trim()) {
    throw new Error(
      `${name} has a value systemd's EnvironmentFile cannot hold as-is (a quote, a backslash, a control character or surrounding whitespace) — fix it in .env.local`,
    );
  }
}

/**
 * @param example  `parseServerSection(.env.example)`
 * @param lookup   the environment after `.env.local` is loaded (`process.env` in practice)
 * @throws naming every missing required name, never a value
 */
export function buildServerEnv(
  example: readonly ExampleEntry[],
  lookup: (name: string) => string | undefined,
): ServerEnv {
  const names = example.map((e) => e.name);
  for (const name of [...Object.keys(STAGING_OVERRIDES), ...REQUIRED_SERVER_NAMES]) {
    if (!names.includes(name)) {
      throw new Error(
        `${name} is not in .env.example's VPS / PocketBase section — the two have drifted`,
      );
    }
  }

  const lines: string[] = [];
  const entries: ResolvedEntry[] = [];
  const values = new Map<string, string>();

  for (const { name, defaultValue } of example) {
    const override = STAGING_OVERRIDES[name];
    const fromEnv = lookup(name);
    let value: string | null = null;
    let source: ValueSource = 'unset';

    if (override !== undefined) {
      value = override;
      source = 'override';
    } else if (fromEnv !== undefined && fromEnv !== '') {
      value = fromEnv;
      source = 'environment';
    } else if (defaultValue !== '') {
      value = defaultValue;
      source = 'example-default';
    }

    entries.push({ name, source });
    if (value === null) continue;
    checkValue(name, value);
    values.set(name, value);
    lines.push(`${name}=${value}`);
  }

  const missing = REQUIRED_SERVER_NAMES.filter((name) => !values.has(name));
  if (missing.length > 0) {
    throw new Error(`refusing to write /opt/kl/.env: no value for ${missing.join(', ')}`);
  }
  // Belt and braces: only an edit to STAGING_OVERRIDES itself could make this fire.
  if (values.get('SMS_PROVIDER') !== 'mock') {
    throw new Error('refusing to write /opt/kl/.env: SMS_PROVIDER must be mock in this step');
  }

  const header = [
    '# /opt/kl/.env — written by `pnpm run provision` (tools/deploy/server-env.ts). Mode 600, owner kl.',
    '# Staging overrides are in force: SMS_PROVIDER=mock, ZARINPAL_SANDBOX=1 (what.md §18).',
  ];
  return { content: `${[...header, ...lines].join('\n')}\n`, entries };
}

/**
 * What `--dry-run` prints: every name and where its value comes from. A value from the
 * environment is always masked; an override or an `.env.example` default is shown, because both
 * are already public in git.
 */
export function describeServerEnv(
  example: readonly ExampleEntry[],
  resolved: readonly ResolvedEntry[],
): string[] {
  return resolved.map(({ name, source }) => {
    switch (source) {
      case 'override':
        return `${name}=${STAGING_OVERRIDES[name]}   (staging override, fixed in code)`;
      case 'environment':
        return `${name}=********   (from .env.local / the environment)`;
      case 'example-default':
        return `${name}=${example.find((e) => e.name === name)?.defaultValue}   (.env.example default)`;
      default:
        return `${name} — left out (unset; the server warns at boot)`;
    }
  });
}

export interface SuperuserCredentials {
  readonly email: string;
  readonly password: string;
}

/** what.md §15: a superuser password of at least 20 characters. */
export const SUPERUSER_PASSWORD_MIN = 20;

/**
 * `KL_ADMIN_EMAIL` / `KL_ADMIN_PASSWORD` → the two stdin lines superuser.sh reads. Refuses rather
 * than send anything superuser.sh would misread (a newline inside either value) or a password
 * shorter than §15 allows. Error messages name the variable, never the value.
 */
export function superuserStdin(credentials: SuperuserCredentials): string {
  const { email, password } = credentials;
  if (email === '' || !/^[^\s@]+@[^\s@]+$/.test(email)) {
    throw new Error('KL_ADMIN_EMAIL is not set to an email address (see .env.example)');
  }
  if (/[\r\n]/.test(password)) {
    throw new Error('KL_ADMIN_PASSWORD contains a line break');
  }
  if (password.length < SUPERUSER_PASSWORD_MIN) {
    throw new Error(
      `KL_ADMIN_PASSWORD is shorter than ${SUPERUSER_PASSWORD_MIN} characters (what.md §15)`,
    );
  }
  return `${email}\n${password}\n`;
}
