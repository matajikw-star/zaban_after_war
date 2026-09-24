/**
 * A centred modal on the glass surface. Radix owns the focus trap, the scroll lock and the
 * escape handling; this file owns only the look (ADR-0020).
 *
 * `Sheet.tsx` is the same Radix primitive anchored to the bottom — the two are separate files
 * because they are separate concepts on a phone, not because they are separate libraries.
 */

import { Dialog as RadixDialog } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from './cn.ts';

export const DialogRoot = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

export interface DialogContentProps extends ComponentProps<typeof RadixDialog.Content> {
  /** Required by Radix for the accessible name; always a key from `strings.ts`. */
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
}

export function DialogContent({
  title,
  description,
  className,
  children,
  ...props
}: DialogContentProps) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-40 bg-[var(--overlay)] backdrop-blur-[2px]" />
      <RadixDialog.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2',
          'glass-strong rounded-[var(--radius-card)] border p-6 shadow-sm outline-none',
          className,
        )}
        {...props}
      >
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
