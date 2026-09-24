/**
 * The text field: the phone number, the OTP code, the discount code. All three are Latin digits
 * typed left-to-right inside a right-to-left page, so `dir` is a prop and the caller sets it.
 */

import type { InputHTMLAttributes } from 'react';
import { cn } from './cn.ts';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        'min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--border)] font-normal',
        'bg-[var(--bg-elevated)] px-4 text-body text-[var(--fg)]',
        'placeholder:text-[var(--fg-muted)] outline-none',
        'transition-colors duration-[var(--motion-fast)]',
        'focus-visible:border-[var(--fg)] focus-visible:ring-2 focus-visible:ring-[var(--fg)]',
        'disabled:pointer-events-none disabled:opacity-50',
        // Monochrome even when wrong (§7.9): a heavier border, and the message beside it says why.
        'aria-[invalid=true]:border-[var(--fg)] aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-[var(--fg)]',
        className,
      )}
      {...props}
    />
  );
}
