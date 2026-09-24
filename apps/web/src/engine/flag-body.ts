/**
 * The one place that shapes a `FlagBody` (`what.md` §8.1 `word_flags`, §8.2 `POST /api/flags`).
 *
 * `/review` and `/word/:id` both let the user flag a word; both must enqueue the identical shape
 * for the same `(itemId, reason)`, because they hit the same server route and the same daily cap.
 * Before this existed the two screens built the body by hand and drifted apart — see ticket
 * dev-web/07. Pure: the install id, app version and timestamp all come in as `context` rather
 * than being read here, same rule as every other file in `engine/` (`what.md` §17.7).
 */

import type { FlagBody, FlagReason } from '../net/api.ts';

export interface FlagBodyContext {
  readonly installId: string;
  readonly appVersion: string;
  readonly at: number;
}

export function buildFlagBody(
  itemId: string,
  reason: FlagReason,
  context: FlagBodyContext,
): FlagBody {
  return {
    installId: context.installId,
    itemId,
    reason,
    appVersion: context.appVersion,
    at: context.at,
  };
}
