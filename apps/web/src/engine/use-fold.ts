/**
 * Re-renders a screen when the fold changes (`what.md` §7.1).
 *
 * `screens/boxes`, `screens/progress` and `screens/word` all read the live fold through
 * `engine/index.ts`'s bound functions, but none of those functions are React state — a `know`
 * recorded on `/word/:id` would not repaint `/boxes` without this. `useSyncExternalStore` is the
 * correct primitive for an external store that is not Zustand; `fold-cache.ts` already replaces
 * its `current` object wholesale on every refold, so identity comparison is exactly right here.
 */

import type { Fold } from '@kl/core';
import { useSyncExternalStore } from 'react';
import { currentFold, subscribeToFold } from './fold-cache.ts';

function subscribe(onStoreChange: () => void): () => void {
  return subscribeToFold(() => onStoreChange());
}

/** The return value is only useful as a re-render trigger; read the fold via `engine/index.ts`. */
export function useFold(): Fold {
  return useSyncExternalStore(subscribe, currentFold);
}
