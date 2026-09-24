// `.env.local` reading for the server-facing tools (`tools/errors`, `tools/logs`, `tools/flags`,
// `tools/deploy`; what.md §10.3, §18). No dependency: KEY=VALUE lines, `#` comments, blank lines —
// boring enough that a tiny parser is less risk than a new dependency (what.md §17.9).
//
// A value already in `process.env` always wins: an operator's shell (or CI's own secrets) beats
// whatever the file says, so the same tool behaves the same way locally and in CI.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

function unquote(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

/** Reads `.env.local` at the repo root into `process.env`, if the file exists. Never throws. */
export async function loadDotEnvLocal(): Promise<void> {
  let text: string;
  try {
    text = await readFile(path.join(repoRoot, '.env.local'), 'utf8');
  } catch {
    return; // no .env.local: the environment alone (CI, an operator's own shell) is fine
  }

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = unquote(line.slice(eq + 1).trim());
    if (key !== '' && process.env[key] === undefined) process.env[key] = value;
  }
}

/** Throws a message naming `.env.example` when `name` is unset — what an operator needs to fix it. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(
      `${name} is not set — add it to .env.local or the environment (see .env.example)`,
    );
  }
  return value;
}

export function optionalEnv(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}
