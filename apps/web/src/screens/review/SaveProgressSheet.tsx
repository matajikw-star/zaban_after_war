/**
 * «ذخیرهٔ پیشرفت با شمارهٔ موبایل» (`what.md` §7.4): offered once after 50 presentations on an
 * anonymous install. An offer, never a gate — «بعداً» returns to the card. When it is due is
 * `engine/save-progress-prompt.ts`.
 */

import { strings } from '../../strings.ts';
import { Button } from '../../ui/Button.tsx';
import { SheetContent, SheetRoot } from '../../ui/Sheet.tsx';

export interface SaveProgressSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onAccept: () => void;
}

export function SaveProgressSheet({ open, onOpenChange, onAccept }: SaveProgressSheetProps) {
  return (
    <SheetRoot open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title={strings.review.saveProgressTitle}
        description={strings.review.saveProgressBody}
        data-testid="save-progress-sheet"
      >
        <div className="flex flex-col gap-2">
          <Button variant="primary" size="md" block onClick={onAccept}>
            {strings.review.saveProgressAccept}
          </Button>
          <Button variant="secondary" size="md" block onClick={() => onOpenChange(false)}>
            {strings.review.saveProgressLater}
          </Button>
        </div>
      </SheetContent>
    </SheetRoot>
  );
}
