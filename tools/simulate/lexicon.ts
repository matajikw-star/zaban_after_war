/**
 * Turns the real lexicon into the engine's `ContentItem[]`, read fresh on every run.
 *
 * The word list and its weights are never hard-coded — a lexicon update changes what the
 * simulator studies the next time it runs, with no file here to edit. The ordering follows
 * `docs/spec/what.md` §6.2's rank rule exactly, so the simulator's introduction order matches
 * what a real content build would ship.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContentItem } from '../../packages/core/src/index.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const LEXICON_DIR = join(ROOT, 'content/lexicon');

interface LexiconFile {
  readonly id: string;
  readonly stats?: {
    readonly priority?: number;
    readonly timesTested?: number;
    readonly firstYear?: number;
  };
}

interface RankedWord {
  readonly id: string;
  readonly priority: number;
  readonly timesTested: number;
  readonly firstYear: number;
}

async function readLexicon(): Promise<RankedWord[]> {
  const files = (await readdir(LEXICON_DIR)).filter((name) => name.endsWith('.json'));
  const words: RankedWord[] = [];
  for (const name of files) {
    const raw = await readFile(join(LEXICON_DIR, name), 'utf8');
    const entry = JSON.parse(raw) as LexiconFile;
    words.push({
      id: entry.id,
      priority: entry.stats?.priority ?? 0,
      timesTested: entry.stats?.timesTested ?? 0,
      firstYear: entry.stats?.firstYear ?? 0,
    });
  }
  return words;
}

/** what.md §6.2: priority desc, timesTested desc, firstYear desc, id asc. */
function byRankOrder(a: RankedWord, b: RankedWord): number {
  if (a.priority !== b.priority) return b.priority - a.priority;
  if (a.timesTested !== b.timesTested) return b.timesTested - a.timesTested;
  if (a.firstYear !== b.firstYear) return b.firstYear - a.firstYear;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

export interface LexiconOptions {
  /** Cap to the top N words by rank order. Omit for every word with `timesTested > 0`. */
  readonly wordLimit?: number;
}

/** Reads `content/lexicon/*.json` and builds the engine's content list, ranked per §6.2. */
export async function loadLexiconContent(options: LexiconOptions = {}): Promise<ContentItem[]> {
  const ranked = (await readLexicon()).sort(byRankOrder);
  const withRank = ranked.map((word, rank) => ({ word, rank }));
  const selected =
    options.wordLimit === undefined
      ? withRank.filter(({ word }) => word.timesTested > 0)
      : withRank.slice(0, options.wordLimit);
  return selected.map(({ word, rank }) => ({ id: word.id, rank, weight: word.timesTested }));
}
