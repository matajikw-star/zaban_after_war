/**
 * A small pill: the exam badge on the card («۱ بار در کنکور، سال ۱۴۰۲»), the update chip on
 * home, the backup status dot's label. Gray-scale, like everything but the grading buttons.
 */

import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from './cn.ts';

const chip = cva(
  'inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] px-3 py-1 text-caption font-medium',
  {
    variants: {
      tone: {
        neutral: 'border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--fg-muted)]',
        solid: 'bg-[var(--fg)] text-[var(--bg)]',
        glass: 'glass border text-[var(--fg)]',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface ChipProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof chip> {}

export function Chip({ className, tone, ...props }: ChipProps) {
  return <span className={cn(chip({ tone }), className)} {...props} />;
}
