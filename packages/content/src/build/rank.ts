/**
 * Rank assignment (`docs/spec/what.md` §6.2, `CLAUDE.md` "Word ids"). Rank is introduction
 * order and is frozen forever once assigned — a user's progress is keyed by id, and re-ranking
 * an existing id would silently rewrite what they are studying. This module only ever appends.
 */

export interface RankCandidate {
  readonly id: string;
  readonly priority: number;
  readonly timesTested: number;
  readonly firstYear: number | null;
}

/**
 * Returns `existing` plus a rank for every candidate not already in it. New ids are ordered by
 * `priority` desc, `timesTested` desc, `firstYear` desc (missing treated as lowest), `id` asc,
 * then appended starting one past the current maximum rank. An id already in `existing` keeps
 * its rank untouched, whatever `candidates` says about it now.
 */
export function assignRanks(
  existing: Readonly<Record<string, number>>,
  candidates: readonly RankCandidate[],
): Record<string, number> {
  const next: Record<string, number> = { ...existing };

  let currentMax = 0;
  for (const rank of Object.values(existing)) {
    if (rank > currentMax) currentMax = rank;
  }

  const newOnes = candidates.filter((candidate) => !(candidate.id in existing));
  newOnes.sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    if (a.timesTested !== b.timesTested) return b.timesTested - a.timesTested;
    const aYear = a.firstYear ?? Number.NEGATIVE_INFINITY;
    const bYear = b.firstYear ?? Number.NEGATIVE_INFINITY;
    if (aYear !== bYear) return bYear - aYear;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  newOnes.forEach((candidate, index) => {
    next[candidate.id] = currentMax + index + 1;
  });

  return next;
}
