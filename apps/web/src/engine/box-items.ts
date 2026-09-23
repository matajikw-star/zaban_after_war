/**
 * The word list behind one column of `/boxes` (`what.md` §7.8).
 *
 * `boxItems` is the pure derivation — a box number plus the fold and the content package in,
 * one row per word in that box out — kept separate from `queue.ts`'s `boxCounts` (which only
 * counts) because the boxes screen needs the ids too, to look up each word's lemma and link to
 * `/word/:id`. Sorted soonest-due first, which is the order a user actually cares about: what do
 * I need to look at next.
 */

import type { Box, ContentItem, Fold, ItemId } from '@kl/core';
import { currentContentItems } from '../stores/content.ts';
import { currentFold } from './fold-cache.ts';

export interface BoxWordRow {
  readonly itemId: ItemId;
  readonly dueAt: number;
}

export function boxItems(
  fold: Fold,
  content: readonly ContentItem[],
  box: Box,
): readonly BoxWordRow[] {
  const rows: BoxWordRow[] = [];
  for (const item of content) {
    const state = fold.items.get(item.id);
    if (state === undefined || state.box !== box) continue;
    rows.push({ itemId: item.id, dueAt: state.dueAt });
  }
  rows.sort((a, b) => a.dueAt - b.dueAt || (a.itemId < b.itemId ? -1 : 1));
  return rows;
}

export function currentBoxItems(box: Box): readonly BoxWordRow[] {
  return boxItems(currentFold(), currentContentItems(), box);
}
