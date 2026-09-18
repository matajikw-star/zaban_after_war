/**
 * What a screen looks like before its ticket is picked up.
 *
 * Every route in `what.md` §7.8 exists from ticket 01 onward, so navigation, the error boundary
 * and the e2e suite are exercised against the real route table rather than a subset of it. A
 * screen graduates by replacing its own file; this component then loses a caller and, once the
 * last one is gone, is deleted.
 */

import type { ReactNode } from 'react';
import { strings } from '../../strings.ts';

export interface PlaceholderProps {
  /** A value from `strings.screens`. */
  readonly title: string;
  readonly children?: ReactNode;
}

export function PlaceholderScreen({ title, children }: PlaceholderProps) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <h1 className="text-h5 font-medium">{title}</h1>
      <p className="text-body-sm text-[var(--fg-muted)]">{strings.placeholder}</p>
      {children}
    </main>
  );
}
