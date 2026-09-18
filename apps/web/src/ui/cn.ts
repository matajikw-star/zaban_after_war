/**
 * Class-name join with Tailwind conflict resolution — the one shadcn helper this repo keeps.
 *
 * It lives in its own file rather than a `utils.ts` (`what.md` §17.1): one concept, one file,
 * one name.
 */

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
