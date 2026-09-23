/**
 * What the user sees for the moment after they grade (`what.md` §7.8): which box the word moved
 * to, and when it comes back.
 *
 * It is the whole screen rather than a toast, because it is also the pause between two cards —
 * without it the next word appears under the thumb that just tapped and gets graded by accident.
 * It clears on a tap or after `FEEDBACK_MS`, whichever comes first; the timer is the caller's,
 * so nothing here reads the clock (§17.7).
 */

import type { Box } from '@kl/core';
import { boxLabel } from '../../engine/card-content.ts';
import { strings } from '../../strings.ts';

/** Long enough to read six words, short enough not to be in the way. */
export const FEEDBACK_MS = 900;

export interface FeedbackProps {
  readonly lemma: string;
  /** `null` when the word had never been seen: it had no box to come from. */
  readonly boxBefore: Box | null;
  readonly boxAfter: Box;
  readonly nextDue: string;
  readonly onDismiss: () => void;
}

export function Feedback({ lemma, boxBefore, boxAfter, nextDue, onDismiss }: FeedbackProps) {
  const conquered = boxAfter === 5 && boxBefore !== 5;

  return (
    <button
      type="button"
      onClick={onDismiss}
      className="flex flex-1 flex-col items-center justify-center gap-3 text-center"
      data-testid="review-feedback"
    >
      <span dir="ltr" className="text-h6 font-medium text-[var(--fg-muted)]">
        {lemma}
      </span>
      <span className="flex items-center gap-2 text-h5 font-medium">
        <span className="text-[var(--fg-muted)]">{boxLabel(boxBefore)}</span>
        {/* The arrow points right-to-left with the page: "from" is on the right. */}
        <span aria-hidden="true">←</span>
        <span>{boxLabel(boxAfter)}</span>
      </span>
      {conquered ? <span className="text-body-sm">{strings.review.conquered}</span> : null}
      <span className="text-body-sm text-[var(--fg-muted)]" data-testid="review-next-due">
        {nextDue}
      </span>
    </button>
  );
}
