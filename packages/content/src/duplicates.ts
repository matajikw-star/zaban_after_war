/**
 * Duplicate papers (ADR-0021, ticket `.scratch/dev-content/issues/03`). Two paper ids of one
 * year that hold the same English test would count every question twice, so a paper that
 * duplicates another is retired with `duplicateOf` and the lexicon fold stops counting it.
 *
 * This module is the one measure of "same question" in the codebase: `content:lint` uses it to
 * find two live papers of a year that share stems, and to check every `duplicateOf` claim.
 * Pure — no filesystem.
 */

/**
 * Two stems at or above this similarity are one question. Measured 2026-09-25 over the 58
 * papers: a question's best match in a paper of another year never scored above 0.27; the
 * same question read twice from one year scored 0.69–1.0 (the 0.3–0.5 tail is a cloze passage
 * cut at a different sentence boundary, which the paper-level count absorbs).
 */
export const STEM_MATCH_THRESHOLD = 0.6;

/**
 * Two live papers of one year may share at most this many stems. Distinct papers were
 * measured to share 0 or 1 (a question reused from the year before shares 1); a duplicate
 * shares 13–15 of 15.
 */
export const MAX_SHARED_STEMS = 3;

/** Lower case, blanks (`.....`, `____`, `-----`, `…`) and punctuation to spaces, one space. */
export function normalizeStem(stem: string): string {
  return stem
    .toLowerCase()
    .replace(/\.{2,}|_{2,}|-{2,}|…/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .join(' ');
}

/** Token-set Jaccard of the two normalised stems: shared distinct words / all distinct words. */
export function stemSimilarity(a: string, b: string): number {
  const left = new Set(normalizeStem(a).split(' ').filter((w) => w.length > 0));
  const right = new Set(normalizeStem(b).split(' ').filter((w) => w.length > 0));
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  const union = left.size + right.size - shared;
  return union === 0 ? 0 : shared / union;
}
