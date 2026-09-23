/**
 * Joining a lexicon entry's tested occurrences back to their exam questions
 * (`docs/spec/what.md` §6.2). The stem is never duplicated into `senses[].examples` — it is
 * joined in here, fresh, every build.
 */

import type { ExamStem } from '../types.ts';
import type { ExamFile, LexiconEntry } from './raw.ts';

const BLANK = '.....';
const HYPHEN_BLANK = /-{2,}/g;

/** The blank marker is normally dots; a minority of scans used a run of hyphens instead. */
export function normalizeBlank(stem: string): string {
  return stem.replace(HYPHEN_BLANK, BLANK);
}

/**
 * One `ExamStem` per `tested` occurrence, in occurrence order. Throws if an occurrence points
 * at a paper or question number that does not exist — `content:lint` reports the same defect
 * without stopping the build, but the build itself must not ship a card with a missing stem.
 */
export function joinStems(
  entry: LexiconEntry,
  examsById: ReadonlyMap<string, ExamFile>,
): ExamStem[] {
  const stems: ExamStem[] = [];

  for (const occurrence of entry.occurrences) {
    if (occurrence.occurrenceType !== 'tested') continue;

    const exam = examsById.get(occurrence.paperId);
    if (!exam) {
      throw new Error(`${entry.id}: occurrence points to unknown paper "${occurrence.paperId}"`);
    }

    const question = exam.questions.find((q) => q.no === occurrence.questionNo);
    if (!question) {
      throw new Error(
        `${entry.id}: occurrence points to unknown question ${occurrence.paperId}#${occurrence.questionNo}`,
      );
    }

    stems.push({
      paperId: occurrence.paperId,
      year: occurrence.year,
      questionNo: occurrence.questionNo,
      stem: normalizeBlank(question.stem),
      options: question.options,
      key: question.key,
      isAnswer: occurrence.isAnswer,
    });
  }

  return stems;
}
