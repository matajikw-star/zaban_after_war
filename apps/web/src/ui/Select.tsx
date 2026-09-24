/**
 * The native `<select>`, styled like `Input.tsx`: the field of study and the three exam-date
 * parts. Native on purpose — on Android it opens the system picker, which is bigger, faster and
 * more familiar than anything drawn in the page.
 *
 * `appearance-none` removes the platform arrow, which sits on the wrong side in some RTL
 * browsers; the chevron is drawn here at the inline end instead. `className` sizes the wrapper
 * (`flex-1` in a row of three), not the `<select>` inside it.
 */

import type { SelectHTMLAttributes } from 'react';
import { cn } from './cn.ts';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {}

export function Select({ className, children, ...props }: SelectProps) {
  return (
    <div className={cn('relative w-full', className)}>
      <select
        className={cn(
          'min-h-11 w-full appearance-none rounded-[var(--radius-control)] border border-[var(--border)]',
          'bg-[var(--bg-elevated)] ps-4 pe-10 text-body text-[var(--fg)] outline-none',
          'transition-colors duration-[var(--motion-fast)]',
          'focus-visible:border-[var(--fg)] focus-visible:ring-2 focus-visible:ring-[var(--fg)]',
        )}
        {...props}
      >
        {children}
      </select>
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
        className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-[var(--fg-muted)]"
      >
        <path
          d="M4 6l4 4 4-4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
