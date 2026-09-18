/**
 * The on-disk shape of `content/` — what the build reads, before it becomes a `WordCard`
 * (`../types.ts`). These are the extraction pipeline's schemas (`docs/plan/content-pipeline.md`),
 * not the shipped contract; nothing here is exported outside `build/`.
 */

import type { Confusable, HintTemplate, Homograph, Level, WordSense } from '../types.ts';

export type OccurrenceType = 'tested' | 'context';

interface OccurrenceBase {
  readonly paperId: string;
  readonly part: string;
  readonly questionNo: number;
  readonly reach: number;
  readonly surface: string;
  readonly year: number;
}

export interface TestedOccurrence extends OccurrenceBase {
  readonly occurrenceType: 'tested';
  readonly optionIndex: number;
  readonly isAnswer: boolean;
}

export interface ContextOccurrence extends OccurrenceBase {
  readonly occurrenceType: 'context';
}

export type Occurrence = TestedOccurrence | ContextOccurrence;

export interface LexiconStats {
  readonly byYear: Readonly<Record<string, number>>;
  readonly answersByYear: Readonly<Record<string, number>>;
  readonly distinctYears: number;
  readonly firstYear: number | null;
  readonly lastYear: number | null;
  readonly priority: number;
  readonly timesAsAnswer: number;
  readonly timesAsContext: number;
  readonly timesAsDistractor: number;
  readonly timesTested: number;
}

/** A `senses[]` entry as extraction/generation write it — a superset of `WordSense`. */
export interface LexiconSense extends WordSense {
  readonly testedIn: readonly { readonly paperId: string; readonly questionNo: number }[];
}

export interface LexiconEntry {
  readonly id: string;
  readonly lemma: string;
  readonly level: Level | null;
  readonly senses: readonly LexiconSense[];
  readonly confusables: readonly Confusable[];
  readonly homograph: Homograph;
  readonly occurrences: readonly Occurrence[];
  readonly stats: LexiconStats;
  readonly status: 'draft' | 'approved';
}

export interface ExamQuestion {
  readonly no: number;
  readonly part: string;
  readonly stem: string;
  readonly options: readonly string[];
  readonly key: number | null;
  readonly testedWord: string | null;
}

export interface ExamFile {
  readonly paperId: string;
  readonly year: number;
  readonly questions: readonly ExamQuestion[];
}

export interface HintFile {
  readonly template: HintTemplate;
  readonly association: string;
  readonly sentence: string;
  readonly status: 'approved' | 'draft';
}
