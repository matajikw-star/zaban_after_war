/**
 * The two progress shapes the product uses: the goal ring on home and a bar for downloads and
 * the boxes screen. Both are gray-scale — ADR-0020 reserves colour for the grading buttons.
 *
 * Hand-rolled SVG rather than Radix Progress: a ring is a stroke-dashoffset, and the label is
 * already Persian-formatted by the caller, so the primitive would add an element and no value.
 */

import { cn } from './cn.ts';

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export interface ProgressRingProps {
  /** 0..100. */
  readonly value: number;
  readonly size?: number;
  readonly strokeWidth?: number;
  /** Rendered in the middle; already Persian (`faPercent`, `faNumber`). */
  readonly label?: string;
  readonly caption?: string;
  /** Accessible name — a key from `strings.ts`. */
  readonly ariaLabel: string;
  readonly className?: string;
}

export function ProgressRing({
  value,
  size = 140,
  strokeWidth = 10,
  label,
  caption,
  ariaLabel,
  className,
}: ProgressRingProps) {
  const percent = clampPercent(value);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - percent / 100);

  return (
    <div
      className={cn('relative inline-flex items-center justify-center', className)}
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {/* Rotated so the arc starts at twelve o'clock; RTL does not mirror a ring. */}
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--fg)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset var(--motion-base) ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
        {label === undefined ? null : <span className="text-h3 font-medium">{label}</span>}
        {caption === undefined ? null : (
          <span className="text-caption text-[var(--fg-muted)]">{caption}</span>
        )}
      </div>
    </div>
  );
}

export interface ProgressBarProps {
  /** 0..100. */
  readonly value: number;
  readonly ariaLabel: string;
  readonly className?: string;
}

export function ProgressBar({ value, ariaLabel, className }: ProgressBarProps) {
  const percent = clampPercent(value);
  return (
    <div
      className={cn(
        'h-2 w-full overflow-hidden rounded-[var(--radius-pill)] bg-[var(--border)]',
        className,
      )}
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-[var(--radius-pill)] bg-[var(--fg)]"
        style={{ width: `${percent}%`, transition: 'width var(--motion-base) ease-out' }}
      />
    </div>
  );
}
