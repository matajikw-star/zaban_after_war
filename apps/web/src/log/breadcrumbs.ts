/**
 * The breadcrumb ring: the last 50 things that happened, attached to every error record (§10.1).
 *
 * Recorded by every store action, every route change, every state-machine transition and every
 * network call. Never a body, never a phone number — a breadcrumb is a label plus small,
 * non-identifying data, because it is uploaded to the server with the error.
 */

import { now } from '../engine/clock.ts';

export type BreadcrumbType = 'nav' | 'tap' | 'sync' | 'download' | 'sw' | 'net' | 'engine' | 'log';

export interface Breadcrumb {
  readonly at: number;
  readonly type: BreadcrumbType;
  readonly msg: string;
  readonly data?: unknown;
}

/** §10.1: "last 50". The ring is a plain array because 50 entries never make this hot. */
export const BREADCRUMB_LIMIT = 50;

const ring: Breadcrumb[] = [];

/** Records one crumb, dropping the oldest once the ring is full. */
export function breadcrumb(type: BreadcrumbType, msg: string, data?: unknown): void {
  const crumb: Breadcrumb =
    data === undefined ? { at: now(), type, msg } : { at: now(), type, msg, data };
  ring.push(crumb);
  while (ring.length > BREADCRUMB_LIMIT) ring.shift();
}

/** Oldest first, which is the order `tools/errors` prints them in. */
export function breadcrumbs(): readonly Breadcrumb[] {
  return ring.slice();
}

export function clearBreadcrumbs(): void {
  ring.length = 0;
}
