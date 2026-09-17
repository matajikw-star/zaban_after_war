/**
 * The domain types of the SRS engine. Types only — no runtime values.
 *
 * The shapes here are the contract in `docs/spec/what.md` §5.1. Progress is a fold over an
 * append-only review log (ADR-0002); the ladder and the queue are ADR-0019. Read both before
 * changing a shape: every field is either written by the device or derived on load, and a
 * rename of `itemId` orphans user progress (CLAUDE.md, "Word ids").
 */

/** Today always a word id (lemma slug); opaque, globally unique, frozen forever. */
export type ItemId = string;

/** 0 = forgot, 1 = remembered. Deliberately binary — it is what the UI offers. */
export type Grade = 0 | 1;

/** Leitner box, 1..5. Box 5 is فتح‌شده (conquered). */
export type Box = 1 | 2 | 3 | 4 | 5;

/**
 * `review`: the user saw the card, revealed it, and graded themselves.
 * `know`:   «این را بلدم» — the word goes straight to box 5 (grade is always 1).
 */
export type ReviewEventKind = 'review' | 'know';

/** One recorded answer. Append-only: never edited, never deleted. Sync is the union of ids. */
export interface ReviewEvent {
  /** UUIDv7, minted on the device — time-sortable and collision-free without coordination. */
  readonly id: string;
  readonly itemId: ItemId;
  /** Epoch ms, device clock. Stored as given, even when the clock is wrong (ADR-0002). */
  readonly at: number;
  readonly kind: ReviewEventKind;
  readonly grade: Grade;
  /** The `installId` of the device that recorded it. */
  readonly device: string;
}

/** What the fold knows about one item right now. Derived, never stored as truth. */
export interface ItemState {
  readonly itemId: ItemId;
  /** Live schedule box. Drops to 1 on every forgot. */
  readonly box: Box;
  /** Never decreases; drives progress. */
  readonly highWaterBox: Box;
  readonly lastReviewedAt: number;
  /** `lastReviewedAt + intervalsMs[box]`, recomputed after every event. */
  readonly dueAt: number;
  /** Events counted for this item, `know` included. */
  readonly reviewCount: number;
  readonly lapseCount: number;
}

/** A Tehran-local day: `floor((at + TEHRAN_OFFSET_MS) / DAY_MS)`. See `day.ts`. */
export type DayKey = number;

/** What happened on one Tehran-local day. */
export interface DayStats {
  /** Every event, whatever its kind or grade. */
  readonly presentations: number;
  /** Events with `grade === 1`, `know` included. */
  readonly correct: number;
  /**
   * Items whose `highWaterBox` first reached 5 on this day **through a `review` event**.
   * A `know` never counts here: this number is the introduction budget's control signal
   * (§5.4), and letting «بلدم» raise the budget would unlock the lexicon in one swipe.
   */
  readonly conquered: number;
  /** Items whose first event ever fell on this day. */
  readonly introduced: number;
}

/** The whole of user progress, recomputed from the log on load. */
export interface Fold {
  readonly items: ReadonlyMap<ItemId, ItemState>;
  readonly byDay: ReadonlyMap<DayKey, DayStats>;
  /** The largest `at` in the log; 0 for an empty log. */
  readonly lastEventAt: number;
}

/** The engine's view of a word. The card the user sees carries much more. */
export interface ContentItem {
  readonly id: ItemId;
  /** Introduction order, frozen in the content package. Lower is introduced first. */
  readonly rank: number;
  /** `stats.timesTested`; 0 for context-only words, which never move progress. */
  readonly weight: number;
}

/** Every tunable number of the engine, in one object. Tuned through `tools/simulate`. */
export interface Params {
  /** Box → interval in ms: 10 min, 1 d, 2 d, 4 d, 8 d. */
  intervalsMs: Record<Box, number>;
  /** Never show a card seen within the last N draws. */
  suppressionWindow: number;
  /** Box → draw multiplier: 1.5, 1.3, 1.15, 1.0, 0.6. */
  boxDrawFactor: Record<Box, number>;
  /** `floor = ceil(dailyGoal / newWordsFloorDivisor)`. */
  newWordsFloorDivisor: number;
  /** `cap = newWordsCapMultiplier × floor`. */
  newWordsCapMultiplier: number;
  /** Introduce a new word when the due pool is thinner than this. */
  minDuePool: number;
  /** Fraction of the goal that makes a day count for the streak. */
  streakMinFraction: number;
  /** Days of history the accuracy estimate looks at. */
  accuracyWindowDays: number;
  /** Assumed accuracy until there is data. */
  defaultAccuracy: number;
  /** Presentations a free user gets before the paywall (server config can override). */
  freePresentationLimit: number;
}
