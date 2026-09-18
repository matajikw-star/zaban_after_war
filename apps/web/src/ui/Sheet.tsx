/**
 * The bottom sheet (`what.md` §7.8: the flag sheet, the goal-reached sheet, the install nudge).
 *
 * A Radix Dialog anchored to the bottom edge, with the drag handle every Android user reads as
 * "swipe me". The handle is decoration: dismissal is the overlay, escape, or a button inside —
 * a real drag gesture would be a gesture library, and §17.9 says dependencies are few.
 */

import { Dialog as RadixDialog } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from './cn.ts';

export const SheetRoot = RadixDialog.Root;
export const SheetTrigger = RadixDialog.Trigger;
export const SheetClose = RadixDialog.Close;

export interface SheetContentProps extends ComponentProps<typeof RadixDialog.Content> {
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
}

export function SheetContent({
  title,
  description,
  className,
  children,
  ...props
}: SheetContentProps) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
      <RadixDialog.Content
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto',
          'rounded-t-[var(--radius-card)] border-t border-[var(--glass-border)] bg-[var(--glass-bg)]',
          'px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 shadow-sm backdrop-blur-[var(--glass-blur)] outline-none',
          className,
        )}
        {...props}
      >
        <div
          aria-hidden="true"
          className="mx-auto mb-4 h-1 w-10 rounded-[var(--radius-pill)] bg-[var(--border)]"
        />
        <RadixDialog.Title className="text-h6 font-medium">{title}</RadixDialog.Title>
        {description === undefined ? null : (
          <RadixDialog.Description className="mt-1 text-body-sm text-[var(--fg-muted)]">
            {description}
          </RadixDialog.Description>
        )}
        <div className="mt-4">{children}</div>
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}
