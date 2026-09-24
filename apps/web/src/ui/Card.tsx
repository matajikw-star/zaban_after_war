/**
 * The glass surface (ADR-0020): translucent, blurred, a one-pixel border, a 24 px radius and no
 * shadow heavier than `shadow-sm`. Every panel in the app is one of these.
 */

import type { HTMLAttributes } from 'react';
import { cn } from './cn.ts';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** The inverted card — dark on the light ground, light on the dark one — for the one thing on
   *  a screen that must be looked at. */
  readonly emphasis?: boolean;
}

export function Card({ className, emphasis = false, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-card)] border p-5 shadow-sm',
        emphasis ? 'border-transparent bg-[var(--fg)] text-[var(--bg)]' : 'glass',
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
