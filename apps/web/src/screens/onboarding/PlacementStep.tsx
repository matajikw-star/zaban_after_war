/**
 * Placement step (`what.md` §5.6): the top 100 words by rank, one at a time. «بلدم» records a
 * `know` event so the queue will not waste a slot introducing a word the user already has;
 * «بلد نیستم» just moves on — the word is introduced normally, later. Skippable, and leaves on
 * its own once the pool is exhausted.
 */

import { useMemo, useState } from 'react';
import { recordReview } from '../../engine/index.ts';
import { type PlacementChoice, placementEvent, placementPool } from '../../engine/placement.ts';
import { useContentStore } from '../../stores/content.ts';
import { strings } from '../../strings.ts';
import { Button } from '../../ui/Button.tsx';
import { faNumber } from '../../ui/format.ts';

export interface PlacementStepProps {
  /** Called once the pool is exhausted — leaves the step exactly like «رد کردن» would. */
  readonly onLeave: () => void;
}

export function PlacementStep({ onLeave }: PlacementStepProps) {
  const items = useContentStore((state) => state.items);
  const card = useContentStore((state) => state.card);
  const pool = useMemo(() => placementPool(items), [items]);
  const [index, setIndex] = useState(0);

  if (pool.length === 0 || index >= pool.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <p className="text-body text-[var(--fg-muted)]">{strings.onboarding.placementDone}</p>
      </div>
    );
  }

  const itemId = pool[index] as string;
  const lemma = card(itemId)?.lemma ?? itemId;

  function choose(choice: PlacementChoice): void {
    const event = placementEvent(choice);
    const advance = () => {
      const nextIndex = index + 1;
      if (nextIndex >= pool.length) onLeave();
      else setIndex(nextIndex);
    };
    if (event === 'know') {
      void recordReview(itemId, 'know', 1).then(advance);
    } else {
      advance();
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <h1 className="text-h5 font-medium">{strings.onboarding.placementTitle}</h1>
      <p className="text-body-sm text-[var(--fg-muted)]">{strings.onboarding.placementBody}</p>
      <p className="text-caption text-[var(--fg-muted)]">
        {strings.onboarding.placementCounter(faNumber(index + 1), faNumber(pool.length))}
      </p>
      <p data-testid="placement-word" dir="ltr" className="text-h3 font-medium">
        {lemma}
      </p>
      <div className="flex w-full gap-2">
        <Button
          data-testid="placement-dont-know"
          variant="secondary"
          block
          onClick={() => choose('dont-know')}
        >
          {strings.onboarding.placementDontKnow}
        </Button>
        <Button data-testid="placement-know" variant="primary" block onClick={() => choose('know')}>
          {strings.onboarding.placementKnow}
        </Button>
      </div>
    </div>
  );
}
