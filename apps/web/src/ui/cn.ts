/**
 * Class-name join with Tailwind conflict resolution — the one shadcn helper this repo keeps.
 *
 * It lives in its own file rather than a `utils.ts` (`what.md` §17.1): one concept, one file,
 * one name.
 *
 * `tailwind-merge` has to be told about the Sonnat type scale (`text-h1` … `text-caption-sm`,
 * §7.9). Left to guess, it reads `text-h6` as a *colour* — any `text-*` it does not recognise is
 * — and drops whichever text colour came earlier in the list. That is how every primary button
 * once rendered its label in the page's own foreground colour on a foreground-coloured pill:
 * invisible (ticket dev-web/06).
 */

import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

const TYPE_SCALE = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'subtitle',
  'subtitle-sm',
  'body',
  'body-sm',
  'caption',
  'caption-sm',
];

const twMerge = extendTailwindMerge({
  extend: { classGroups: { 'font-size': [{ text: TYPE_SCALE }] } },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
