/**
 * The glass surface (ADR-0020): translucent, blurred, a one-pixel border, a 24 px radius and no
 * shadow heavier than `shadow-sm`. Every panel in the app is one of these.
 */

import type { HTMLAttributes } from 'react';
import { cn } from './cn.ts';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** A dark card on the light ground, for the one thing on a screen that must be looked at. */
  readonly emphasis?: boolean;
}

export function Card({ className, emphasis = false, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-card)] border p-5 shadow-sm',
        emphasis
          ? 'border-transparent bg-[var(--color-neutral-900)] text-[var(--color-neutral-50)]'
          : 'border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)]',
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-h6 font-medium', className)} {...props} />;
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('text-body-sm text-[var(--fg-muted)]', className)} {...props} />;
}
