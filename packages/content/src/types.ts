/**
 * The content package contract (`docs/spec/what.md` §6.1) — what `packages/content` builds
 * and what `apps/web` and `server/` import. Types only; the build lives in `build/`.
 */

/** Today always a word id (lemma slug); opaque, frozen forever (CLAUDE.md, "Word ids"). */
export type ItemId = string;

export type Level = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export type HintTemplate = 'تداعی صوتی' | 'طنز' | 'ریشه‌شناسی' | 'تصویری';

export interface WordExample {
  readonly en: string;
  readonly fa: string;
}

export interface WordSense {
  readonly pos: string;
  readonly ipa: string | null;
  readonly definition: string;
  readonly translations: readonly string[];
  readonly synonyms: readonly string[];
  readonly antonyms: readonly string[];
  readonly examples: readonly WordExample[];
}

export interface Confusable {
  readonly word: string;
  readonly note: string;
}

export interface Homograph {
  readonly suspected: boolean;
  readonly note: string | null;
}

export interface Hint {
  readonly template: HintTemplate;
  readonly association: string;
  readonly sentence: string;
}

/** One exam question that tested this word, joined in from `content/exams/` at build time. */
export interface ExamStem {
  readonly paperId: string;
  readonly year: number;
  readonly questionNo: number;
  readonly stem: string;
  readonly options: readonly string[];
  readonly key: number | null;
  readonly isAnswer: boolean;
}

export interface WordCardExam {
  readonly timesTested: number;
  readonly timesAsAnswer: number;
  readonly years: readonly number[];
  readonly lastYear: number | null;
  readonly stems: readonly ExamStem[];
}

export interface WordCard {
  readonly id: ItemId;
  readonly lemma: string;
  readonly rank: number;
  readonly weight: number;
  readonly level: Level;
  readonly senses: readonly WordSense[];
  readonly confusables: readonly Confusable[];
  readonly homograph: Homograph;
  readonly hint: Hint | null;
  readonly exam: WordCardExam;
}

export type PackageId = 'free' | 'paid';

export interface ContentPackage {
  readonly packageId: PackageId;
  readonly version: string;
  readonly builtAt: string;
  readonly schemaVersion: 1;
  readonly hash: string;
  readonly items: readonly WordCard[];
}

/** Bumped whenever `WordCard`'s shape changes in a way old clients cannot read. */
export const CONTENT_SCHEMA_VERSION = 1;
