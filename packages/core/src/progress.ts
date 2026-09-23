/**
 * Progress: one honest number for "how much of the exam vocabulary do I own".
 *
 * Weighted by how often a word was actually tested in the last ten years, so conquering a word
 * that appeared nine times moves the bar nine times as far as one that appeared once. It is
 * driven by `highWaterBox`, which never decreases, so the bar never goes backwards — a lapse
 * changes what the user studies next, not what they have achieved (ADR-0019).
 */

import type { ContentItem, Fold } from './types.ts';

export interface Progress {
  /** 0..100, ready to print. 0 when the content carries no weight at all. */
  readonly percent: number;
  /** Content items whose `highWaterBox` is 5, weight-0 context words included. */
  readonly conquered: number;
  /** Content items in total, weight-0 context words included. */
  readonly total: number;
  readonly weightEarned: number;
  readonly weightTotal: number;
}

const CONQUERED_BOX = 5;

export function progress(fold: Fold, content: readonly ContentItem[]): Progress {
  let weightEarned = 0;
  let weightTotal = 0;
  let conquered = 0;

  for (const item of content) {
    weightTotal += item.weight;
    const state = fold.items.get(item.id);
    // Unseen items contribute nothing; context-only words (weight 0) never move the bar.
    if (state === undefined) continue;
    weightEarned += (state.highWaterBox / CONQUERED_BOX) * item.weight;
    if (state.highWaterBox === CONQUERED_BOX) conquered += 1;
  }

  return {
    percent: weightTotal > 0 ? (weightEarned / weightTotal) * 100 : 0,
    conquered,
    total: content.length,
    weightEarned,
    weightTotal,
  };
}
