/**
 * Turning one lexicon entry into the `WordCard` the client reads (`docs/spec/what.md` §6.1).
 */

import type { Hint, WordCard } from '../types.ts';
import type { ExamFile, LexiconEntry } from './raw.ts';
import { joinStems } from './stems.ts';

/**
 * A word ships when it has at least one sense (word data is written), is not on the
 * exclusion list (`packages/content/exclusions.json`) — non-words such as `as-like` that were
 * tested but are not English (`.scratch/word-data/issues/04`) — and is not `retired`.
 */
export function isShippable(entry: LexiconEntry, exclusions: ReadonlySet<string>): boolean {
  return entry.senses.length > 0 && !exclusions.has(entry.id) && entry.retired === undefined;
}

function examYears(entry: LexiconEntry): number[] {
  return Object.keys(entry.stats.byYear)
    .map(Number)
    .sort((a, b) => a - b);
}

/** Builds the card for one shippable entry. Callers filter with `isShippable` first. */
export function buildWordCard(
  entry: LexiconEntry,
  rank: number,
  examsById: ReadonlyMap<string, ExamFile>,
  hint: Hint | null,
): WordCard {
  const level = entry.level;
  if (level === null) {
    // Word data (`extraction/WORD-DATA.md`) writes `senses` and `level` together, so a
    // shippable entry (non-empty `senses`) should never lack one. If this fires, the two
    // fields drifted apart and the entry needs a human, not a guessed default.
    throw new Error(`${entry.id}: has senses but no level`);
  }

  return {
    id: entry.id,
    lemma: entry.lemma,
    rank,
    weight: entry.stats.timesTested,
    level,
    senses: entry.senses.map((sense) => ({
      pos: sense.pos,
      ipa: sense.ipa,
      definition: sense.definition,
      translations: sense.translations,
      synonyms: sense.synonyms,
      antonyms: sense.antonyms,
      examples: sense.examples,
    })),
    confusables: entry.confusables,
    homograph: entry.homograph,
    hint,
    exam: {
      timesTested: entry.stats.timesTested,
      timesAsAnswer: entry.stats.timesAsAnswer,
      years: examYears(entry),
      lastYear: entry.stats.lastYear,
      stems: joinStems(entry, examsById),
    },
  };
}
