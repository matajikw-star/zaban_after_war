/**
 * The entitlement cache's one rule (`what.md` §7.6): written only from a server answer, read
 * offline forever, and **never revoked by the device**. An online answer of `none` while the
 * cache says `full` is a `client_errors` record for the owner, and the cache stays as it was —
 * a refund is the owner's act (§8.3), and a device that downgraded itself on a flaky or wrong
 * answer would take away a paid user's words with no way back offline.
 *
 * `mergeEntitlement` is that rule as a pure function; `refreshEntitlement` asks `/api/me` and
 * applies it, with every effect injected so `entitlement.test.ts` drives it with fakes.
 *
 * **Per account.** The cache is `kv.entitlement = { byUser: { [userId]: Entitlement } }`: a
 * grant counts only while the account it was granted to is signed in, so a shared phone never
 * hands one account's purchase to the next (the same reasoning as the per-user sync cursor,
 * how-why §5.8). A map rather than one record keyed by userId, because B's `none` must sit
 * beside A's `full`, not replace it — A signing back in regains the paid package offline.
 */

import { AppError, toAppError } from '../errors.ts';
import { breadcrumb } from '../log/breadcrumbs.ts';
import type { EntitlementResponse, MeResponse } from '../net/api.ts';
import type { Entitlement, EntitlementStatus } from '../stores/auth.ts';

/** What every device holds for an account it has no record for — and for nobody signed in. */
export const NO_ENTITLEMENT: Entitlement = {
  status: 'none',
  source: null,
  grantedAt: null,
  checkedAt: 0,
};

/** `kv.entitlement`'s value: one record per account this device has seen answered. */
export type EntitlementsByUser = Readonly<Record<string, Entitlement>>;

function isEntitlement(value: unknown): value is Entitlement {
  const v = value as Partial<Entitlement> | null | undefined;
  return (
    v !== null &&
    typeof v === 'object' &&
    (v.status === 'full' || v.status === 'none') &&
    typeof v.checkedAt === 'number'
  );
}

/**
 * The stored map. Anything else — including the pre-account `{status, …}` record staging builds
 * wrote — belongs to nobody and reads as empty; the next `/api/me` fills the account in.
 */
export function readEntitlements(stored: unknown): EntitlementsByUser {
  const byUser = (stored as { byUser?: unknown } | null | undefined)?.byUser;
  if (byUser === null || typeof byUser !== 'object' || Array.isArray(byUser)) return {};
  const out: Record<string, Entitlement> = {};
  for (const [userId, value] of Object.entries(byUser)) {
    if (isEntitlement(value)) out[userId] = value;
  }
  return out;
}

/** The entitlement that counts now: the signed-in account's, or none. */
export function entitlementFor(map: EntitlementsByUser, userId: string | null): Entitlement {
  if (userId === null) return NO_ENTITLEMENT;
  return map[userId] ?? NO_ENTITLEMENT;
}

/** A server answer about `userId`, merged into that account's record only. */
export function adoptFor(
  map: EntitlementsByUser,
  userId: string,
  server: unknown,
  at: number,
): { readonly map: EntitlementsByUser; readonly merge: EntitlementMerge } {
  const cached = entitlementFor(map, userId);
  const merge = mergeEntitlement(cached, server, at);
  if (merge.next === cached) return { map, merge };
  return { map: { ...map, [userId]: merge.next }, merge };
}

export interface FollowDeps {
  /** `stores/content.ts` `load`: the stored paid package when entitled, else the free one. */
  readonly loadContent: (entitled: boolean) => Promise<void>;
  /** Ask the download to check the paid package (§7.5); it fetches only what is missing. */
  readonly requestDownload: () => void;
  readonly reportError: (err: unknown) => void;
}

/**
 * The effective entitlement changed (a sign-in, a sign-out, a server answer): load the package
 * it allows, without a reload. Never throws.
 */
export async function followEntitlement(
  previous: EntitlementStatus,
  next: EntitlementStatus,
  deps: FollowDeps,
): Promise<void> {
  if (previous === next) return;
  breadcrumb('log', 'entitlement.follow', { from: previous, to: next });
  try {
    await deps.loadContent(next === 'full');
  } catch (err) {
    deps.reportError(err);
    return;
  }
  if (next === 'full') deps.requestDownload();
}

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
