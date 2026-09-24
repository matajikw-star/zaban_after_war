/**
 * The entitlement cache's one rule (`what.md` §7.6): written only from a server answer, read
 * offline forever, and **never revoked by the device**. An online answer of `none` while the
 * cache says `full` is a `client_errors` record for the owner, and the cache stays as it was —
 * a refund is the owner's act (§8.3), and a device that downgraded itself on a flaky or wrong
 * answer would take away a paid user's words with no way back offline.
 *
 * `mergeEntitlement` is that rule as a pure function; `refreshEntitlement` asks `/api/me` and
 * applies it, with every effect injected so `entitlement.test.ts` drives it with fakes.
 */

import { AppError, toAppError } from '../errors.ts';
import { breadcrumb } from '../log/breadcrumbs.ts';
import type { EntitlementResponse, MeResponse } from '../net/api.ts';
import type { Entitlement } from '../stores/auth.ts';

export interface EntitlementMerge {
  readonly next: Entitlement;
  /** The server said `none` while the device holds `full`: kept, and worth a record. */
  readonly mismatch: boolean;
}

function isServerEntitlement(value: unknown): value is EntitlementResponse {
  const v = value as Partial<EntitlementResponse> | null | undefined;
  return v !== null && typeof v === 'object' && (v.status === 'full' || v.status === 'none');
}

/** A malformed answer changes nothing: it is not a server response about entitlement. */
export function mergeEntitlement(
  cached: Entitlement,
  server: unknown,
  at: number,
): EntitlementMerge {
  if (!isServerEntitlement(server)) return { next: cached, mismatch: false };
  if (server.status === 'full') {
    return {
      next: {
        status: 'full',
        // A purchase result knows only that the caller is entitled; a later `/api/me` fills these
        // in, and until then whatever the cache already had is better than null.
        source: server.source ?? cached.source,
        grantedAt: server.grantedAt ?? cached.grantedAt,
        checkedAt: at,
      },
      mismatch: false,
    };
  }
  if (cached.status === 'full') return { next: cached, mismatch: true };
  return {
    next: { status: 'none', source: null, grantedAt: null, checkedAt: at },
    mismatch: false,
  };
}

export interface RefreshDeps {
  readonly fetchMe: () => Promise<MeResponse>;
  /** `stores/auth.ts` `adoptServerEntitlement`: applies `mergeEntitlement` and writes `kv`. */
  readonly adopt: (server: EntitlementResponse) => Promise<EntitlementMerge>;
  /** The cache went (or stayed) `full`: start or resume the paid download (§7.5). */
  readonly onEntitled: () => void;
  /** A mismatch (§7.6) or a cache write that failed: a `client_errors` record. */
  readonly reportError: (err: AppError) => void;
}

export type RefreshOutcome = 'full' | 'none' | 'failed';

/** Never throws: an entitlement check that fails changes nothing on the device. */
export async function refreshEntitlement(deps: RefreshDeps): Promise<RefreshOutcome> {
  let me: MeResponse;
  try {
    me = await deps.fetchMe();
  } catch (err) {
    breadcrumb('net', 'entitlement.refreshFailed', { code: toAppError(err, 'ME_FAILED').code });
    return 'failed';
  }
  let merge: EntitlementMerge;
  try {
    merge = await deps.adopt(me.entitlement);
  } catch (err) {
    // The device could not store the answer (IndexedDB refused): the cache is as it was.
    deps.reportError(toAppError(err, 'ENTITLEMENT_STORE_FAILED'));
    return 'failed';
  }
  if (merge.mismatch) {
    deps.reportError(
      new AppError('ENTITLEMENT_MISMATCH', 'the server says none while the device holds full', {
        cachedSource: merge.next.source,
        cachedGrantedAt: merge.next.grantedAt,
      }),
    );
  }
  breadcrumb('log', 'entitlement.refreshed', {
    server: me.entitlement?.status ?? null,
    device: merge.next.status,
  });
  if (merge.next.status === 'full') deps.onEntitled();
  return merge.next.status;
}
