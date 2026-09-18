/**
 * The settings toggle. Radix gives the checkbox semantics and the keyboard behaviour; the thumb
 * travels the other way in RTL, which `rtl:` handles here rather than in every caller.
 */

import { Switch as RadixSwitch } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from './cn.ts';

export interface SwitchProps extends ComponentProps<typeof RadixSwitch.Root> {
  /** Accessible name — a key from `strings.ts`. */
  readonly ariaLabel: string;
}

export function Switch({ className, ariaLabel, ...props }: SwitchProps) {
  return (
    <RadixSwitch.Root
      aria-label={ariaLabel}
      className={cn(
        // 44 px of tap target around a 28 px track: the control is small, the target is not.
        'relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-[var(--radius-pill)]',
        'border border-[var(--border)] bg-[var(--border)] outline-none',
        'transition-colors duration-[var(--motion-fast)]',
        'before:absolute before:-inset-y-2 before:inset-x-0 before:content-[""]',
        'focus-visible:ring-2 focus-visible:ring-[var(--fg)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]',
        'data-[state=checked]:bg-[var(--fg)] data-[state=checked]:border-[var(--fg)]',
        'disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <RadixSwitch.Thumb
        className={cn(
          'block h-5 w-5 rounded-full bg-[var(--bg-elevated)] shadow-sm',
          'transition-transform duration-[var(--motion-fast)]',
          'translate-x-1 data-[state=checked]:translate-x-6',
          'rtl:-translate-x-1 rtl:data-[state=checked]:-translate-x-6',
        )}
      />
    </RadixSwitch.Root>
  );
}
