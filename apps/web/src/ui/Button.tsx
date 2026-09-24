/**
 * The button (ADR-0020, `what.md` §7.9).
 *
 * Monochrome by decision: `success` and `danger` are the only coloured variants that exist and
 * they are reserved for the two grading buttons and destructive confirmations. Every size clears
 * the 44 px minimum tap target; `primary` is a full-round pill, everything else takes the 12 px
 * control radius.
 */

import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from './cn.ts';

const button = cva(
  [
    'inline-flex items-center justify-center gap-2 select-none',
    'font-medium whitespace-nowrap',
    'transition-[color,background-color,opacity,transform] duration-[var(--motion-fast)] active:scale-[0.98]',
    'outline-none focus-visible:ring-2 focus-visible:ring-[var(--fg)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]',
    'disabled:pointer-events-none disabled:opacity-50',
  ],
  {
    variants: {
      variant: {
        primary: 'rounded-[var(--radius-pill)] bg-[var(--fg)] text-[var(--bg)] hover:opacity-90',
        secondary:
          'rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--fg)] hover:bg-[var(--bg-muted)]',
        ghost:
          'rounded-[var(--radius-control)] bg-transparent text-[var(--fg)] hover:bg-[var(--bg-muted)]',
        success: 'rounded-[var(--radius-control)] bg-[var(--success)] text-white hover:opacity-90',
        danger: 'rounded-[var(--radius-control)] bg-[var(--danger)] text-white hover:opacity-90',
      },
      size: {
        // 44 px is the floor everywhere, so `sm` is smaller in padding, never in height (§7.9).
        sm: 'min-h-11 px-4 text-body-sm',
        md: 'min-h-11 px-6 text-body',
        lg: 'min-h-14 px-8 text-h6',
      },
      block: {
        true: 'w-full',
        false: '',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md', block: false },
  },
);

export type ButtonVariant = NonNullable<VariantProps<typeof button>['variant']>;
export type ButtonSize = NonNullable<VariantProps<typeof button>['size']>;

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {
  /** Renders the child element instead of a `<button>` — a link that looks like a button. */
  readonly asChild?: boolean;
}

export function Button({
  className,
  variant,
  size,
  block,
  asChild = false,
  type,
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot.Root : 'button';
  return (
    <Component
      className={cn(button({ variant, size, block }), className)}
      // A button inside a form defaults to `submit`, which has surprised every codebase once.
      {...(asChild ? {} : { type: type ?? 'button' })}
      {...props}
    />
  );
}
