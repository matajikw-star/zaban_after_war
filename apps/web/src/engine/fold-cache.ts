/**
 * The current `Fold`, held in memory and recomputed from the whole log on every append.
 *
 * ADR-0002: state is a fold over an append-only log, never a mutable blob. A full re-fold is
 * O(events) and the log is a few thousand entries after a year of daily study, so the honest
 * implementation is also the fast one — and it cannot drift from what a fresh launch computes.
 */

import { DEFAULT_PARAMS, type Fold, fold, type Params, type ReviewEvent } from '@kl/core';
import { breadcrumb } from '../log/breadcrumbs.ts';

type Listener = (next: Fold) => void;

let events: ReviewEvent[] = [];
let params: Params = DEFAULT_PARAMS;
let current: Fold = fold([], DEFAULT_PARAMS);
const listeners = new Set<Listener>();

function refold(reason: string): Fold {
  current = fold(events, params);
  breadcrumb('engine', 'fold', { reason, events: events.length, items: current.items.size });
  for (const listener of listeners) listener(current);
  return current;
}

/** Replaces the whole log — bootstrap, and after a pull that brought new events (§7.4). */
export function loadEvents(all: readonly ReviewEvent[]): Fold {
  events = all.slice();
  return refold('load');
}

/** Adds one event to the cached log and re-folds. */
export function appendToFold(event: ReviewEvent): Fold {
  events.push(event);
  return refold('append');
}

export function currentFold(): Fold {
  return current;
}

export function cachedEvents(): readonly ReviewEvent[] {
  return events;
}

/** The engine's tunables are one object (§5.1); changing them re-folds everything. */
export function setParams(next: Params): Fold {
  params = next;
  return refold('params');
}

export function currentParams(): Params {
  return params;
}

/** Lets a store mirror the fold into React without the engine knowing React exists. */
export function subscribeToFold(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test hook: back to an empty log and the default parameters. */
export function resetFoldCache(): void {
  events = [];
  params = DEFAULT_PARAMS;
  current = fold([], DEFAULT_PARAMS);
  listeners.clear();
}
