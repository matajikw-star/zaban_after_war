/**
 * The ⋯ menu on the review header (`what.md` §7.8): «این را بلدم» and «این کلمه اشکال دارد».
 *
 * A dropdown rather than a third bottom sheet, because opening the flag sheet out of a sheet
 * means two stacked dialogs and a focus trap inside a focus trap. Radix's `DropdownMenu` closes
 * itself before the sheet opens, so there is only ever one modal on screen.
 */

import { DropdownMenu } from 'radix-ui';
import { strings } from '../../strings.ts';
import { cn } from '../../ui/cn.ts';

export interface OverflowMenuProps {
  readonly onKnow: () => void;
  readonly onFlag: () => void;
  readonly disabled: boolean;
}

const item = cn(
  'flex min-h-11 w-full cursor-default items-center rounded-[var(--radius-control)] px-3',
  'text-body-sm text-[var(--fg)] outline-none select-none',
  'data-[highlighted]:bg-[var(--border)]',
);

export function OverflowMenu({ onKnow, onFlag, disabled }: OverflowMenuProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={strings.review.overflow}
        disabled={disabled}
        className="flex size-11 items-center justify-center rounded-[var(--radius-control)] text-h6 text-[var(--fg)] outline-none hover:bg-[var(--border)] focus-visible:ring-2 focus-visible:ring-[var(--fg)] disabled:opacity-50"
        data-testid="review-overflow"
      >
        <span aria-hidden="true">⋯</span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={4}
          className="z-50 min-w-48 rounded-[var(--radius-card)] border border-[var(--glass-border)] bg-[var(--glass-bg)] p-1 shadow-sm backdrop-blur-[var(--glass-blur)]"
        >
          <DropdownMenu.Item className={item} onSelect={onKnow} data-testid="review-know">
            {strings.review.know}
          </DropdownMenu.Item>
          <DropdownMenu.Item className={item} onSelect={onFlag} data-testid="review-flag">
            {strings.review.flag}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
