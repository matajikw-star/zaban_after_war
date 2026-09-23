/**
 * The front of the review card (`what.md` §7.8): the word, the exam badge, and the invitation
 * to tap. Nothing else — §7.9 forbids a decorative illustration here, and anything the user can
 * read before deciding whether they know the word would make the grade a lie.
 *
 * The word is Latin inside an RTL page, so it carries its own `dir="ltr"`.
 */

import type { WordCard } from '@kl/content';
import { examBadge, examBadgeText } from '../../engine/card-content.ts';
import { strings } from '../../strings.ts';
import { Chip } from '../../ui/Chip.tsx';

export interface CardFrontProps {
  readonly card: WordCard;
}

export function CardFront({ card }: CardFrontProps) {
  const badge = examBadge(card);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 py-8 text-center">
      <h2 dir="ltr" className="text-h2 font-medium break-words" data-testid="review-word">
        {card.lemma}
      </h2>
      {badge === null ? null : <Chip tone="neutral">{examBadgeText(badge)}</Chip>}
      <p className="text-body-sm text-[var(--fg-muted)]">{strings.review.tapToReveal}</p>
    </div>
  );
}
