/**
 * What the review card shows, as pure functions of one `WordCard` (`what.md` §7.8, §6.1).
 *
 * The screen decides nothing: it asks here which sentence to print, how the exam badge reads,
 * in what order the senses go, and what «دفعهٔ بعد» says. That keeps every content rule in one
 * unit-tested file and leaves `Review.tsx` to the flow. Nothing here reads the clock, the fold
 * or the network — the box and the params come in as arguments.
 */

import type { ExamStem, WordCard, WordSense } from '@kl/content';
import type { Box, Params } from '@kl/core';
import { strings } from '../strings.ts';
import { faNumber, faYear } from '../ui/format.ts';

/**
 * The blank in a transcribed exam stem. Extraction writes it verbatim as five dots (CLAUDE.md,
 * "transcribe verbatim"), so the marker is a run of three or more dots and never a single
 * ellipsis character, which could be ordinary punctuation.
 */
const GAP = /\.{3,}/;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export type SentencePart =
  /** Verbatim text between gaps. */
  | { readonly kind: 'text'; readonly text: string }
  /** A blank. `word` is filled on the back; `null` for the second and later blanks. */
  | { readonly kind: 'gap'; readonly word: string | null };

export interface PrimarySentence {
  /** `exam` is a real stem the word answered; `example` is the authored sentence. */
  readonly source: 'exam' | 'example';
  /** The sentence verbatim, gap markers included — what a test asserts on. */
  readonly text: string;
  /** The Persian translation. Only an authored example has one; a stem never does. */
  readonly fa: string | null;
  readonly year: number | null;
  readonly parts: readonly SentencePart[];
}

export interface ExamBadge {
  readonly times: number;
  readonly lastYear: number | null;
}

/**
 * Senses in package order, except that a sense with no translation sinks to the end: the card
 * leads with translations, and leading with a sense that has none would show an empty back.
 * Order is otherwise preserved, so two translated senses keep what the content build gave them.
 */
export function orderedSenses(card: WordCard): readonly WordSense[] {
  const translated = card.senses.filter((sense) => sense.translations.length > 0);
  const untranslated = card.senses.filter((sense) => sense.translations.length === 0);
  return [...translated, ...untranslated];
}

/**
 * The stem the word actually answered, most recent year first. Ties break on `paperId` then
 * `questionNo`, so the same card always prints the same sentence — an example that moved
 * between two renders would read as a bug.
 */
function bestAnswerStem(card: WordCard): ExamStem | null {
  const answers = card.exam.stems.filter((stem) => stem.isAnswer && stem.stem.length > 0);
  if (answers.length === 0) return null;
  const sorted = [...answers].sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    if (a.paperId !== b.paperId) return a.paperId < b.paperId ? -1 : 1;
    return a.questionNo - b.questionNo;
  });
  return sorted[0] ?? null;
}

/**
 * Splits a sentence into text and blanks. Only the **first** blank is filled: a two-blank
 * question tests two words and we cannot know that this card's lemma belongs in the second, so
 * the rest stay empty rather than printing a confident guess.
 */
export function sentenceParts(text: string, word: string): readonly SentencePart[] {
  const pieces = text.split(GAP);
  if (pieces.length === 1) return [{ kind: 'text', text }];
  const parts: SentencePart[] = [];
  let filled = false;
  pieces.forEach((piece, index) => {
    if (piece.length > 0) parts.push({ kind: 'text', text: piece });
    if (index < pieces.length - 1) {
      parts.push({ kind: 'gap', word: filled ? null : word });
      filled = true;
    }
  });
  return parts;
}

/**
 * The one sentence the back prints: the exam stem the word answered, else the first authored
 * example that exists. `null` when the card carries neither — a word can still show its front,
 * its translations and its hint.
 */
export function primarySentence(card: WordCard): PrimarySentence | null {
  const stem = bestAnswerStem(card);
  if (stem !== null) {
    return {
      source: 'exam',
      text: stem.stem,
      fa: null,
      year: stem.year,
      parts: sentenceParts(stem.stem, card.lemma),
    };
  }
  for (const sense of orderedSenses(card)) {
    const example = sense.examples[0];
    if (example !== undefined && example.en.length > 0) {
      return {
        source: 'example',
        text: example.en,
        fa: example.fa.length > 0 ? example.fa : null,
        year: null,
        parts: sentenceParts(example.en, card.lemma),
      };
    }
  }
  return null;
}

/** `null` for a context word, which was never tested and must not claim a badge. */
export function examBadge(card: WordCard): ExamBadge | null {
  if (card.exam.timesTested <= 0) return null;
  return { times: card.exam.timesTested, lastYear: card.exam.lastYear };
}

/** «۲ بار در کنکور، آخرین بار ۱۴۰۲» — the second clause is dropped when no year is known. */
export function examBadgeText(badge: ExamBadge): string {
  const times = `${faNumber(badge.times)} ${strings.review.examTimes}`;
  if (badge.lastYear === null) return times;
  return `${times}، ${strings.review.examLastYear} ${faYear(badge.lastYear)}`;
}

/**
 * «دفعهٔ بعد: ۱۰ دقیقه دیگر». The box is the one the word just landed in, and the interval is
 * the engine's own — `params.intervalsMs`, never a number written a second time here (§5.1).
 */
export function nextDueText(box: Box, params: Params): string {
  const ms = params.intervalsMs[box];
  const [amount, unit] =
    ms < HOUR_MS
      ? [Math.round(ms / MINUTE_MS), strings.review.inMinutes]
      : ms < DAY_MS
        ? [Math.round(ms / HOUR_MS), strings.review.inHours]
        : [Math.round(ms / DAY_MS), strings.review.inDays];
  return `${strings.review.nextDue}: ${faNumber(amount)} ${unit}`;
}

/** «جعبهٔ ۲» — and «تازه» for a word the fold has never seen, which has no box yet. */
export function boxLabel(box: Box | null): string {
  return box === null ? strings.review.boxNew : `${strings.review.box} ${faNumber(box)}`;
}
