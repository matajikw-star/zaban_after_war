/**
 * «به هدف امروز رسیدی» (`what.md` §7.8).
 *
 * Congratulation, not a wall: the queue's fourth pool means there is always another card, and
 * the spec is explicit that this never blocks. It appears once per Tehran day — the day is kept
 * in `kv.goalSheetShownDay` by the caller, so closing the app does not earn a second one.
 */

import { strings } from '../../strings.ts';
import { Button } from '../../ui/Button.tsx';
import { SheetContent, SheetRoot } from '../../ui/Sheet.tsx';

export interface GoalReachedSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onFinish: () => void;
}

export function GoalReachedSheet({ open, onOpenChange, onFinish }: GoalReachedSheetProps) {
  return (
    <SheetRoot open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title={strings.review.goalTitle}
        description={strings.review.goalBody}
        data-testid="goal-sheet"
      >
        <div className="flex flex-col gap-2">
          <Button variant="primary" size="md" block onClick={() => onOpenChange(false)}>
            {strings.review.goalContinue}
          </Button>
          <Button variant="secondary" size="md" block onClick={onFinish}>
            {strings.review.goalFinish}
          </Button>
        </div>
      </SheetContent>
    </SheetRoot>
  );
}
