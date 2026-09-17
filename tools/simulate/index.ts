#!/usr/bin/env node
// Schedule simulator: runs a synthetic user through the engine and prints the curve (what.md
// §5.7). Parameter tuning is a conversation about this output, never about vibes.

import type { ContentItem } from '../../packages/core/src/index.ts';
import { parseArgs, type SimulateArgs } from './args.ts';
import { loadLexiconContent } from './lexicon.ts';
import { type DayRow, median, percentile, type SimulateResult, simulate } from './run.ts';

/** A seeded PRNG, so the whole run is one deterministic number (packages/core's own approach). */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function printTable(rows: readonly DayRow[]): void {
  const header = [
    'day',
    'present',
    'new',
    'conq',
    'acc',
    'due',
    'introd',
    'conqrd',
    'daysNeeded',
    'verdict',
  ];
  console.log(header.map((h) => h.padStart(10)).join(' '));
  for (const row of rows) {
    const cells = [
      row.day,
      row.presentations,
      row.introduced,
      row.conquered,
      pct(row.accuracy),
      row.duePool,
      row.introducedSoFar,
      row.conqueredSoFar,
      Number.isFinite(row.daysNeeded) ? row.daysNeeded : '∞',
      row.verdict,
    ];
    console.log(cells.map((c) => String(c).padStart(10)).join(' '));
  }
}

function printSummary(result: SimulateResult, args: SimulateArgs, wordCount: number): void {
  const sorted = [...result.conquestDays].sort((a, b) => a - b);
  console.log('');
  console.log(`words: ${wordCount}  presentations: ${result.presentationsTotal}`);
  if (sorted.length > 0) {
    console.log(
      `conquest days — min ${Math.min(...sorted)} · p25 ${percentile(sorted, 0.25)} · ` +
        `median ${median(sorted)} · p75 ${percentile(sorted, 0.75)} · max ${Math.max(...sorted)} ` +
        `(${sorted.length}/${wordCount} conquered)`,
    );
  } else {
    console.log('conquest days — no word was conquered');
  }
  console.log(`never conquered: ${result.neverConquered}`);
  const actual = result.actualFinishDay === null ? 'not finished' : `day ${result.actualFinishDay}`;
  const error = result.paceErrorDays === null ? 'n/a' : `${result.paceErrorDays} days`;
  console.log(
    `pace estimate — predicted day ${result.predictedFinishDay}, actual ${actual}, error ${error}`,
  );
  console.log(
    `(seed ${args.seed}, ${args.minutes} min/day, ${args.days} days, exam in ${args.examDays} days)`,
  );
}

async function main(): Promise<void> {
  let args: SimulateArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`simulate: ${(error as Error).message}`);
    process.exitCode = 1;
    return;
  }

  let content: ContentItem[];
  try {
    content = await loadLexiconContent(args.words === undefined ? {} : { wordLimit: args.words });
  } catch (error) {
    console.error(`simulate: could not read content/lexicon: ${(error as Error).message}`);
    process.exitCode = 1;
    return;
  }
  if (content.length === 0) {
    console.error('simulate: no words matched — content/lexicon has nothing with timesTested > 0');
    process.exitCode = 1;
    return;
  }

  const rng = mulberry32(args.seed);
  const result = simulate(
    {
      minutesPerDay: args.minutes,
      days: args.days,
      examDays: args.examDays,
      accuracy: args.accuracy,
    },
    content,
    rng,
  );

  if (args.json) {
    console.log(JSON.stringify({ args, wordCount: content.length, result }, null, 2));
    return;
  }

  printTable(result.rows);
  printSummary(result, args, content.length);
}

await main();
