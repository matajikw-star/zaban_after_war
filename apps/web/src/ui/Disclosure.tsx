/**
 * The collapsible section. «بیشتر» on the review card and «راهنمای یادگیری» are both this
 * (`what.md` §7.8, §7.9): a hint is collapsed by default, never hidden behind a navigation.
 */

import { Collapsible } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from './cn.ts';

export interface DisclosureProps {
  /** Persian, from `strings.ts`. */
  readonly label: string;
  readonly defaultOpen?: boolean;
  readonly children: ReactNode;
  readonly className?: string;
}

export function Disclosure({ label, defaultOpen = false, children, className }: DisclosureProps) {
  return (
    <Collapsible.Root defaultOpen={defaultOpen} className={cn('w-full', className)}>
      <Collapsible.Trigger
        className={cn(
          'flex min-h-11 w-full items-center justify-between gap-2 rounded-[var(--radius-control)]',
          'px-3 text-subtitle-sm font-medium text-[var(--fg)] outline-none',
          'transition-colors duration-[var(--motion-fast)] hover:bg-[var(--bg-muted)]',
          'focus-visible:ring-2 focus-visible:ring-[var(--fg)]',
        )}
      >
        <span>{label}</span>
        {/* Rotates on open; the chevron is drawn here so `lucide-react` is not pulled into a
            primitive that would otherwise have no dependency at all. */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className="shrink-0 transition-transform duration-[var(--motion-fast)] [[data-state=open]_&]:rotate-180"
        >
          <path
            d="M4 6l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Collapsible.Trigger>
      <Collapsible.Content className="px-3 pt-1 pb-2 text-body-sm text-[var(--fg-muted)]">
        {children}
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
