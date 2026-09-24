/**
 * Tabs on the glass surface. Radix handles the roving focus and the RTL arrow keys, which is
 * the entire reason not to hand-roll this.
 */

import { Tabs as RadixTabs } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from './cn.ts';

export const TabsRoot = RadixTabs.Root;
export const TabsContent = RadixTabs.Content;

export function TabsList({ className, ...props }: ComponentProps<typeof RadixTabs.List>) {
  return (
    <RadixTabs.List
      className={cn(
        'glass inline-flex items-center gap-1 rounded-[var(--radius-pill)] border p-1',
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof RadixTabs.Trigger>) {
  return (
    <RadixTabs.Trigger
      className={cn(
        'min-h-11 rounded-[var(--radius-pill)] px-4 text-body-sm font-medium text-[var(--fg-muted)]',
        'transition-colors duration-[var(--motion-fast)] outline-none',
        'focus-visible:ring-2 focus-visible:ring-[var(--fg)]',
        'data-[state=active]:bg-[var(--fg)] data-[state=active]:text-[var(--bg)]',
        className,
      )}
      {...props}
    />
  );
}
