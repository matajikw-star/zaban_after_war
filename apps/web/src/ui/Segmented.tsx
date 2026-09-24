/**
 * A single choice among a few short options, as one glass pill: minutes per day (onboarding and
 * settings) and the theme (settings). ADR-0020's look: the chosen option is the inverted pill,
 * the rest sit on the glass.
 *
 * Plain toggle buttons with `aria-pressed` inside a labelled fieldset rather than a radio group:
 * each option is one tap, reads as "pressed / not pressed" to TalkBack, and needs no roving
 * focus. Options share the width equally, so the control never wraps onto a second line at
 * 360 px the way a row of separate buttons did.
 */

import { cn } from './cn.ts';

export interface SegmentedOption<T extends string | number> {
  readonly value: T;
  /** Persian, from `strings.ts`. */
  readonly label: string;
}

export interface SegmentedProps<T extends string | number> {
  readonly options: readonly SegmentedOption<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  /** Accessible name of the group — a key from `strings.ts`. */
  readonly ariaLabel: string;
  readonly className?: string;
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: SegmentedProps<T>) {
  return (
    // A fieldset is a group to assistive tech without a role attribute; `min-w-0` undoes its
    // min-content width, which would otherwise push the row past a 360 px screen.
    <fieldset
      aria-label={ariaLabel}
      className={cn(
        'glass flex w-full min-w-0 gap-1 rounded-[var(--radius-pill)] border p-1',
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'min-h-11 min-w-0 flex-1 rounded-[var(--radius-pill)] px-2 text-body-sm font-medium whitespace-nowrap',
              'transition-colors duration-[var(--motion-fast)] outline-none',
              'focus-visible:ring-2 focus-visible:ring-[var(--fg)]',
              selected
                ? 'bg-[var(--fg)] text-[var(--bg)]'
                : 'text-[var(--fg-muted)] hover:bg-[var(--bg-muted)] hover:text-[var(--fg)]',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </fieldset>
  );
}
