/**
 * CLI argument parsing for `pnpm simulate`. No fs, no engine — just `argv` in, a typed config
 * out, so `index.ts` and a future test can both exercise it without spawning a process.
 */

export type AccuracyProfile = number | readonly [number, number, number, number, number];

export interface SimulateArgs {
  /** Minutes per study session; feeds `goalFromMinutes`. */
  readonly minutes: number;
  /** Days simulated. */
  readonly days: number;
  /** One constant, or five comma-separated values for boxes 1..5 in order. */
  readonly accuracy: AccuracyProfile;
  /** Cap to the top N words by the §6.2 rank order. `undefined` = every word with `timesTested > 0`. */
  readonly words: number | undefined;
  readonly seed: number;
  /** Days until the exam, for the pace estimate. Defaults to `days`. */
  readonly examDays: number;
  readonly json: boolean;
}

const DEFAULT_MINUTES = 20;
const DEFAULT_DAYS = 90;
const DEFAULT_ACCURACY = 0.85;
const DEFAULT_SEED = 20260918;

function parseAccuracy(raw: string): AccuracyProfile {
  const parts = raw.split(',').map((part) => Number(part.trim()));
  if (parts.some((value) => Number.isNaN(value))) {
    throw new Error(`--accuracy: not a number in "${raw}"`);
  }
  if (parts.length === 1) return parts[0] as number;
  if (parts.length === 5) {
    return parts as unknown as readonly [number, number, number, number, number];
  }
  throw new Error(`--accuracy: expected 1 value or 5 (per box), got ${parts.length}`);
}

function parseNumber(name: string, raw: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`--${name}: not a number ("${raw}")`);
  return value;
}

/** Parses `--key value` pairs and the `--json` flag. Throws on anything it does not recognise. */
export function parseArgs(argv: readonly string[]): SimulateArgs {
  const values = new Map<string, string>();
  let json = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] as string;
    if (!token.startsWith('--')) throw new Error(`unexpected argument "${token}"`);
    const key = token.slice(2);
    if (key === 'json') {
      json = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`--${key}: expected a value`);
    }
    values.set(key, value);
    index += 1;
  }

  const minutes = values.has('minutes')
    ? parseNumber('minutes', values.get('minutes') as string)
    : DEFAULT_MINUTES;
  const days = values.has('days')
    ? parseNumber('days', values.get('days') as string)
    : DEFAULT_DAYS;
  const accuracy = values.has('accuracy')
    ? parseAccuracy(values.get('accuracy') as string)
    : DEFAULT_ACCURACY;
  const words = values.has('words')
    ? parseNumber('words', values.get('words') as string)
    : undefined;
  const seed = values.has('seed')
    ? parseNumber('seed', values.get('seed') as string)
    : DEFAULT_SEED;
  // Defaults to the resolved `days`, not the CLI default, so `--days 30` alone targets day 30.
  const examDays = values.has('exam-days')
    ? parseNumber('exam-days', values.get('exam-days') as string)
    : days;

  return { minutes, days, accuracy, words, seed, examDays, json };
}
