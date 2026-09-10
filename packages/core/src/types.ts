/**
 * The domain types for study state.
 *
 * Everything here follows ADR-0002 (progress is an append-only review log) and
 * ADR-0003 (Leitner boxes with real intervals). Read those before changing a shape.
 */

/** A frozen, lemma-derived word id. See CLAUDE.md, "Word ids". */
export type WordId = string;

/** 0 = forgot, 1 = remembered. Deliberately binary — it is what the UI offers. */
export type Grade = 0 | 1;

/** Leitner box, 1..5. Box 5 is مسلط. */
export type Box = 1 | 2 | 3 | 4 | 5;

/**
 * One presentation of one word to one user, answered.
 *
 * Immutable and append-only: events are never edited or deleted, and sync is the
 * union of ids across devices. All study state is a fold over these.
 */
export interface ReviewEvent {
  /** UUIDv7 — time-sortable, and collision-free across devices without coordination. */
  readonly id: string;
  readonly wordId: WordId;
  /** Epoch ms, from the device clock at the moment of the answer. */
  readonly at: number;
  readonly grade: Grade;
  /** Opaque per-install id, so a bad clock can be traced to one device. */
  readonly device: string;
}

/** What the fold knows about one word right now. Derived, never stored as truth. */
export interface WordState {
  readonly wordId: WordId;
  readonly box: Box;
  readonly lastReviewedAt: number;
  readonly dueAt: number;
  readonly reviewCount: number;
  readonly lapseCount: number;
}

/** Interval per box, in milliseconds. The table lives in ADR-0003. */
export const BOX_INTERVALS_MS: Readonly<Record<Box, number>> = {
  1: 10 * 60 * 1000,
  2: 24 * 60 * 60 * 1000,
  3: 3 * 24 * 60 * 60 * 1000,
  4: 7 * 24 * 60 * 60 * 1000,
  5: 21 * 24 * 60 * 60 * 1000,
};

export const FIRST_BOX: Box = 1;
export const MASTERED_BOX: Box = 5;

/** Where a word lands after an answer: up one box, or back to the start. */
export function nextBox(current: Box, grade: Grade): Box {
  if (grade === 0) return FIRST_BOX;
  return Math.min(current + 1, MASTERED_BOX) as Box;
}
