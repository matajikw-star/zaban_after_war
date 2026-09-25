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

/** The same shape as `content:lint`'s own findings, so it can push these unchanged. */
export interface DuplicateFinding {
  readonly severity: 'blocking' | 'warning';
  readonly check: '15' | '16' | '17' | '18';
  readonly file: string;
  readonly message: string;
}

const examPath = (paperId: string) => `content/exams/${paperId}.json`;

function sameOption(a: string | null, b: string | null): boolean {
  const norm = (text: string | null) => (text ?? '').toLowerCase().split(/\s+/).join(' ').trim();
  return norm(a) === norm(b);
}

/**
 * Check 15 (blocking): two live papers of one year share more than `MAX_SHARED_STEMS` stems.
 * The message names the paper the kept-paper rule would keep, across every paper linked to
 * it, so the fix is to copy the suggested `duplicateOf` into the others.
 */
function liveDuplicateFindings(papers: readonly DedupPaper[]): DuplicateFinding[] {
  const live = papers.filter((paper) => paper.duplicateOf === undefined);
  const pairs: { a: DedupPaper; b: DedupPaper; shared: number }[] = [];
  for (let i = 0; i < live.length; i += 1) {
    for (let j = i + 1; j < live.length; j += 1) {
      const a = live[i] as DedupPaper;
      const b = live[j] as DedupPaper;
      if (a.year !== b.year) continue;
      const shared = sharedStemCount(a, b);
      if (shared > MAX_SHARED_STEMS) pairs.push({ a, b, shared });
    }
  }

  // Papers linked by any pair form one group, and the group has one kept paper.
  const groupOf = new Map<string, Set<DedupPaper>>();
  for (const { a, b } of pairs) {
    const merged = new Set<DedupPaper>([
      ...(groupOf.get(a.paperId) ?? [a]),
      ...(groupOf.get(b.paperId) ?? [b]),
    ]);
    for (const member of merged) groupOf.set(member.paperId, merged);
  }

  return pairs.map(({ a, b, shared }) => {
    const group = [...(groupOf.get(a.paperId) ?? [])];
    const kept = chooseKept(group);
    const retire = group
      .filter((paper) => paper !== kept)
      .map((paper) => paper.paperId)
      .sort()
      .join(', ');
    const of = Math.min(a.questions.length, b.questions.length);
    return {
      severity: 'blocking',
      check: '15',
      file: `${examPath(a.paperId)}, ${examPath(b.paperId)}`,
      message:
        `${a.paperId} and ${b.paperId} share ${shared} of ${of} stems — one English test under ` +
        `two ids, so every question counts twice. The kept-paper rule (ADR-0021) says keep ` +
        `${kept.paperId}; give ${retire} "duplicateOf": "${kept.paperId}" and a duplicateReason.`,
    };
  });
}

/**
 * Check 16 (blocking): a `duplicateOf` claim holds — it names another paper of the same year
 * that is not itself retired, carries a reason, and the two really share stems.
 * Check 17 (warning): a retired question whose options differ from the kept paper's
 * same-numbered question. The lexicon fold takes a second lemma reading of an option only
 * where the two transcripts agree on its text, so a disagreement is a misreading in one of them.
 */
function retiredFindings(papers: readonly DedupPaper[]): DuplicateFinding[] {
  const byId = new Map(papers.map((paper) => [paper.paperId, paper]));
  const findings: DuplicateFinding[] = [];

  for (const retired of papers) {
    if (retired.duplicateOf === undefined) continue;
    const file = examPath(retired.paperId);
    const fail = (message: string) => findings.push({ severity: 'blocking', check: '16', file, message });
    const kept = byId.get(retired.duplicateOf);

    if (!retired.duplicateReason) fail('duplicateOf is set but duplicateReason is empty');
    if (retired.duplicateOf === retired.paperId) {
      fail('duplicateOf names the paper itself');
      continue;
    }
    if (kept === undefined) {
      fail(`duplicateOf names "${retired.duplicateOf}", which is not a paper in content/exams/`);
      continue;
    }
    if (kept.duplicateOf !== undefined) {
      fail(
        `duplicateOf names ${kept.paperId}, which is itself retired — point at ${kept.duplicateOf}`,
      );
      continue;
    }
    if (kept.year !== retired.year) {
      fail(`duplicateOf names ${kept.paperId}, a paper of ${kept.year}, not ${retired.year}`);
      continue;
    }
    const shared = sharedStemCount(retired, kept);
    if (shared <= MAX_SHARED_STEMS) {
      fail(`shares only ${shared} stems with ${kept.paperId} — not the same English test`);
      continue;
    }

    for (const question of retired.questions) {
      const counterpart = kept.questions.find((other) => other.no === question.no);
      const agrees =
        counterpart !== undefined &&
        counterpart.options.length === question.options.length &&
        question.options.every((option, i) => sameOption(option, counterpart.options[i] ?? null));
      if (!agrees) {
        findings.push({
          severity: 'warning',
          check: '17',
          file,
          message: counterpart
            ? `question ${question.no}: options [${question.options.join(' | ')}] differ from ` +
              `${kept.paperId}'s [${counterpart.options.join(' | ')}]`
            : `question ${question.no}: ${kept.paperId} has no question ${question.no}`,
        });
      }
    }
  }

  return findings;
}

/** Checks 15–17 over every exam file. */
export function duplicatePaperFindings(papers: readonly DedupPaper[]): DuplicateFinding[] {
  return [...liveDuplicateFindings(papers), ...retiredFindings(papers)];
}

/** The fields of a lexicon entry check 18 reads. */
export interface OccurrenceHolder {
  readonly id: string;
  readonly occurrences: readonly {
    readonly occurrenceType: string;
    readonly paperId: string;
    readonly questionNo: number;
  }[];
}

/**
 * Check 18: an occurrence that points at a retired paper. The fold books a retired paper's
 * questions on the paper it duplicates, so one left here is stale — a word that exists only
 * because of a misreading in the duplicate copy (and so is no longer re-derived), or a lexicon
 * that was not re-folded. Blocking when the word ships, since its card would count the
 * duplicate; a warning otherwise, for the owner to decide the orphan's fate (ids are never
 * deleted by a script).
 */
export function retiredOccurrenceFindings(
  entries: readonly OccurrenceHolder[],
  papers: readonly DedupPaper[],
  shipping: ReadonlySet<string>,
): DuplicateFinding[] {
  const retired = new Map<string, string>();
  for (const paper of papers) {
    if (paper.duplicateOf !== undefined) retired.set(paper.paperId, paper.duplicateOf);
  }
  const findings: DuplicateFinding[] = [];
  for (const entry of entries) {
    for (const occurrence of entry.occurrences) {
      const keptId = retired.get(occurrence.paperId);
      if (keptId === undefined) continue;
      findings.push({
        severity: shipping.has(entry.id) ? 'blocking' : 'warning',
        check: '18',
        file: `content/lexicon/${entry.id}.json`,
        message:
          `${occurrence.occurrenceType} occurrence on ${occurrence.paperId}#${occurrence.questionNo}, ` +
          `a retired duplicate of ${keptId} — re-run S6, or it is an orphan of a misreading`,
      });
    }
  }
  return findings;
}
