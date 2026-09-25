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

/** The part of an exam file this module reads — `raw.ts`'s `ExamFile` satisfies it. */
export interface StemPaper {
  readonly questions: readonly { readonly stem: string }[];
}

function matchedIn(from: StemPaper, to: StemPaper): number {
  let count = 0;
  for (const question of from.questions) {
    const found = to.questions.some(
      (other) => stemSimilarity(question.stem, other.stem) >= STEM_MATCH_THRESHOLD,
    );
    if (found) count += 1;
  }
  return count;
}

/**
 * How many stems two papers share: the questions of one that have a match in the other, taken
 * in whichever direction finds more, so the answer does not depend on argument order.
 */
export function sharedStemCount(a: StemPaper, b: StemPaper): number {
  return Math.max(matchedIn(a, b), matchedIn(b, a));
}

/** The fields of `content/exams/<paperId>.json` the duplicate checks read. */
export interface DedupPaper {
  readonly paperId: string;
  readonly year: number;
  readonly bookletCount?: number;
  /** Set on a retired paper: the paper id whose questions this file duplicates. */
  readonly duplicateOf?: string;
  /** Why, with the measured overlap. Required whenever `duplicateOf` is set. */
  readonly duplicateReason?: string;
  readonly uncertain?: readonly unknown[];
  readonly questions: readonly {
    readonly no: number;
    readonly stem: string;
    readonly options: readonly (string | null)[];
    readonly uncertain?: readonly unknown[];
  }[];
}

function uncertainCount(paper: DedupPaper): number {
  let count = paper.uncertain?.length ?? 0;
  for (const question of paper.questions) count += question.uncertain?.length ?? 0;
  return count;
}

/**
 * The kept-paper rule (ADR-0021): of papers that hold one English test, keep the most complete
 * transcription — most questions, then fewest `uncertain[]` notes (the paper's and its
 * questions'), then the most booklets (`bookletCount`), then the lowest paper id. Every input
 * is in the exam files, so the choice is deterministic and re-derivable.
 */
export function chooseKept<T extends DedupPaper>(papers: readonly T[]): T {
  const sorted = [...papers].sort((a, b) => {
    if (a.questions.length !== b.questions.length) return b.questions.length - a.questions.length;
    const uncertainA = uncertainCount(a);
    const uncertainB = uncertainCount(b);
    if (uncertainA !== uncertainB) return uncertainA - uncertainB;
    const bookletsA = a.bookletCount ?? 1;
    const bookletsB = b.bookletCount ?? 1;
    if (bookletsA !== bookletsB) return bookletsB - bookletsA;
    return a.paperId < b.paperId ? -1 : a.paperId > b.paperId ? 1 : 0;
  });
  const kept = sorted[0];
  if (kept === undefined) throw new Error('chooseKept: no papers');
  return kept;
}
