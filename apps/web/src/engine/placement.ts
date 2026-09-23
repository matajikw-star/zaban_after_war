/**
 * Onboarding's placement step (`what.md` §5.6): the top words by rank, and the rule for what a
 * tap on them means.
 *
 * Pure, so the screen only has to render the pool and call `recordReview` — nothing here touches
 * the fold, the clock or React. `rank` is "introduction order, frozen in the content package;
 * lower is introduced first" (`packages/core/src/types.ts`), so ascending rank is the same top
 * words the queue would introduce first anyway.
 */

import type { ContentItem, ItemId } from '@kl/core';

/** The top `limit` items by rank ascending — rank 1 first. */
export function placementPool(items: readonly ContentItem[], limit = 100): readonly ItemId[] {
  return items
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map((item) => item.id);
}

export type PlacementChoice = 'know' | 'dont-know';

/**
 * «بلدم» emits a `know` event; «بلد نیستم» emits nothing — the word is introduced normally later
 * (`what.md` §5.6). Kept separate from the button handler so the emission rule is testable
 * without mounting React.
 */
export function placementEvent(choice: PlacementChoice): 'know' | null {
  return choice === 'know' ? 'know' : null;
}
