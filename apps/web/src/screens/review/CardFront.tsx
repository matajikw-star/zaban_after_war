/**
 * The front of the review card (`what.md` §7.8): the word, the exam badge, and the invitation
 * to tap. Nothing else — §7.9 forbids a decorative illustration here, and anything the user can
 * read before deciding whether they know the word would make the grade a lie.
 *
 * The word is Latin inside an RTL page, so it carries its own `dir="ltr"` (punctuation in
 * "set off," or "a.m." stays where it belongs) and `lang="en"` (TalkBack reads it in English, and
 * the browser hyphenates it as English if it ever has to).
 */

import type { WordCard } from '@kl/content';
import { examBadge, examBadgeText } from '../../engine/card-content.ts';
import { strings } from '../../strings.ts';
import { Chip } from '../../ui/Chip.tsx';
import { cn } from '../../ui/cn.ts';

/**
 * The largest step of the type scale the word fits on one line in, at 360 px. Measured on
 * Vazirmatn's Latin: a 9-letter word at 48 px and a 14-letter one at 32 px both clear the card's
 * 288 px of text width with room to spare.
 */
function wordSize(lemma: string): string {
  if (lemma.length <= 9) return 'text-h2';
  if (lemma.length <= 14) return 'text-h3';
  return 'text-h4';
}

export interface CardFrontProps {
  readonly card: WordCard;
}

export function CardFront({ card }: CardFrontProps) {
  const badge = examBadge(card);

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-5 py-10 text-center">
        <h2
          dir="ltr"
          lang="en"
          className={cn(
            'max-w-full font-medium tracking-tight break-words hyphens-auto',
            wordSize(card.lemma),
          )}
          data-testid="review-word"
        >
          {card.lemma}
        </h2>
        {badge === null ? null : <Chip tone="neutral">{examBadgeText(badge)}</Chip>}
      </div>
      <p className="text-center text-caption text-[var(--fg-muted)]">
        {strings.review.tapToReveal}
      </p>
    </div>
  );
}
