/**
 * The content package format, copied verbatim from `docs/spec/what.md` §6.1.
 *
 * TEMPORARY HOME. `packages/content` is being built in parallel and will export these two
 * interfaces as `@kl/content`; the moment it does, delete this file and switch every import to
 * the package export. Until then the app needs the shape to compile, and duplicating a type
 * for one ticket is cheaper than blocking on another agent's branch.
 */

import type { ItemId } from '@kl/core';

export interface WordSenseExample {
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
  readonly examples: readonly WordSenseExample[];
}

export interface WordConfusable {
  readonly word: string;
  readonly note: string;
}

export interface WordHomograph {
  readonly suspected: boolean;
  readonly note: string | null;
}

/** The four hint templates of `docs/plan/content-pipeline.md`; a word may ship without a hint. */
export type HintTemplate = 'تداعی صوتی' | 'طنز' | 'ریشه‌شناسی' | 'تصویری';

export interface WordHint {
  readonly template: HintTemplate;
  readonly association: string;
  readonly sentence: string;
}

/** One question this word appeared in, joined from `content/exams/` at build time. */
export interface WordExamStem {
  readonly paperId: string;
  readonly year: number;
  readonly questionNo: number;
  readonly stem: string;
  readonly options: readonly string[];
  readonly key: number | null;
  readonly isAnswer: boolean;
}

export interface WordExam {
  readonly timesTested: number;
  readonly timesAsAnswer: number;
  readonly years: readonly number[];
  readonly lastYear: number | null;
  readonly stems: readonly WordExamStem[];
}

export type WordLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

/** Everything the review card can show. The engine only ever sees `id`, `rank` and `weight`. */
export interface WordCard {
  readonly id: ItemId;
  readonly lemma: string;
  readonly rank: number;
  readonly weight: number;
  readonly level: WordLevel;
  readonly senses: readonly WordSense[];
  readonly confusables: readonly WordConfusable[];
  readonly homograph: WordHomograph;
  readonly hint: WordHint | null;
  readonly exam: WordExam;
}

export type PackageId = 'free' | 'paid';

export interface ContentPackage {
  readonly packageId: PackageId;
  /** Content build id, e.g. "2026-09-30.1". */
  readonly version: string;
  /** ISO timestamp. */
  readonly builtAt: string;
  readonly schemaVersion: 1;
  /** sha256 of the canonical JSON of `items`. */
  readonly hash: string;
  /** Ordered by rank. */
  readonly items: readonly WordCard[];
}

/** `GET /api/content/manifest` (§8.2) — what the download machine compares against. */
export interface ContentManifestEntry {
  readonly version: string;
  readonly hash: string;
  readonly bytes: number;
}

export interface ContentManifest {
  readonly free: ContentManifestEntry;
  readonly paid: ContentManifestEntry;
}
