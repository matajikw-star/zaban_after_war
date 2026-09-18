/**
 * «این کلمه اشکال دارد» (`what.md` §7.8, §8.1 `word_flags`).
 *
 * Three reasons and no free-text box: §16.3 caps what an unauthenticated route will accept, and
 * three buckets are what `pnpm flags` can group. The report goes into the outbox, never onto the
 * network from here — flagging a word offline has to work, and the drain of §7.4 owns the send.
 */

import { strings } from '../../strings.ts';
import { Button } from '../../ui/Button.tsx';
import { SheetContent, SheetRoot } from '../../ui/Sheet.tsx';

/** The `reason` enum of the `word_flags` collection. */
export type FlagReason = 'translation' | 'example' | 'hint';

const REASONS: readonly { readonly reason: FlagReason; readonly label: string }[] = [
  { reason: 'translation', label: strings.review.flagTranslation },
  { reason: 'example', label: strings.review.flagExample },
  { reason: 'hint', label: strings.review.flagHint },
];

export interface FlagSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onFlag: (reason: FlagReason) => void;
}

export function FlagSheet({ open, onOpenChange, onFlag }: FlagSheetProps) {
  return (
    <SheetRoot open={open} onOpenChange={onOpenChange}>
      <SheetContent title={strings.review.flag} description={strings.review.flagQuestion}>
        <div className="flex flex-col gap-2">
          {REASONS.map(({ reason, label }) => (
            <Button
              key={reason}
              variant="secondary"
              size="md"
              block
              onClick={() => onFlag(reason)}
              data-testid={`flag-${reason}`}
            >
              {label}
            </Button>
          ))}
          <Button variant="ghost" size="md" block onClick={() => onOpenChange(false)}>
            {strings.review.flagCancel}
          </Button>
        </div>
      </SheetContent>
    </SheetRoot>
  );
}
