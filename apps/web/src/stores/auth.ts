/**
 * Who this device is, and what it is allowed to see (`what.md` §7.2, §7.6).
 *
 * Everything here lives in `kv`, not `localStorage`, so "log out" is one table to clear. The
 * entitlement cache is written only from a server response and is never revoked locally: an
 * online check that contradicts it is an error record, not a downgrade (§7.6). It is kept per
 * account (`kv.entitlement.byUser`), and `entitlement` below is the one that counts now: the
 * signed-in account's, or none — so signing out, or in as someone else, never carries a purchase
 * across accounts on a shared phone.
 */

import { create } from 'zustand';
import { kvDelete, kvGet, kvSet } from '../db/repo.ts';
import { now } from '../engine/clock.ts';
import { breadcrumb } from '../log/breadcrumbs.ts';
import type { EntitlementResponse } from '../net/api.ts';
import {
  adoptFor,
  type EntitlementMerge,
  type EntitlementsByUser,
  entitlementFor,
  NO_ENTITLEMENT,
  readEntitlements,
} from '../sync/entitlement.ts';

// Defined beside the per-account rules it belongs to; re-exported for every existing reader.
export { NO_ENTITLEMENT };

export type EntitlementStatus = 'none' | 'full';

export interface Entitlement {
  readonly status: EntitlementStatus;
  /** `zarinpal` | `manual` | `discount` — whatever the server said granted it. */
  readonly source: string | null;
  /** Verbatim from the server: PocketBase datetime text. */
  readonly grantedAt: string | null;
  readonly checkedAt: number;
}

/** What is kept under `kv.auth`. The token is a PocketBase bearer token (§8.2). */
export interface AuthRecord {
  readonly userId: string;
  readonly phone: string;
  readonly token: string;
}

export interface AuthState {
  /** UUIDv7 minted on first launch; tags every event as `device`. Empty before bootstrap. */
  readonly installId: string;
  readonly userId: string | null;
  readonly phone: string | null;
  readonly token: string | null;
  /** The entitlement that counts now: `entitlements[userId]`, or none when signed out. */
  readonly entitlement: Entitlement;
  /** Every account's cached record, as stored in `kv.entitlement.byUser`. */
  readonly entitlements: EntitlementsByUser;
  readonly loaded: boolean;
  load: (installId: string) => Promise<void>;
  signIn: (auth: AuthRecord) => Promise<void>;
  signOut: () => Promise<void>;
  /**
   * The only writer of `kv.entitlement`: a server answer about `userId` — the account the request
   * was made as, captured before it was sent — merged into that account's record by
   * `sync/entitlement.ts`'s never-revoke rule (§7.6). A null `userId` is dropped. There is
   * deliberately no plain setter.
   */
  adoptServerEntitlement: (
    server: EntitlementResponse,
    userId: string | null,
  ) => Promise<EntitlementMerge>;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  installId: '',
  userId: null,
  phone: null,
  token: null,
  entitlement: NO_ENTITLEMENT,
  entitlements: {},
  loaded: false,

  load: async (installId) => {
    const [auth, stored] = await Promise.all([
      kvGet<AuthRecord>('auth'),
      kvGet<unknown>('entitlement'),
    ]);
    const userId = auth?.userId ?? null;
    const entitlements = readEntitlements(stored);
    const entitlement = entitlementFor(entitlements, userId);
    set({
      installId,
      userId,
      phone: auth?.phone ?? null,
      token: auth?.token ?? null,
      entitlement,
      entitlements,
      loaded: true,
    });
    breadcrumb('log', 'auth.load', {
      loggedIn: auth !== undefined,
      entitlement: entitlement.status,
    });
  },

  signIn: async (auth) => {
    const entitlement = entitlementFor(get().entitlements, auth.userId);
    set({ userId: auth.userId, phone: auth.phone, token: auth.token, entitlement });
    await kvSet('auth', auth);
    breadcrumb('log', 'auth.signIn', { userId: auth.userId, entitlement: entitlement.status });
  },

  signOut: async () => {
    // The event log stays: it is this device's progress whether or not anyone is logged in.
    // The entitlement records stay too: the account that bought keeps its purchase for next time.
    set({ userId: null, phone: null, token: null, entitlement: NO_ENTITLEMENT });
    await kvDelete('auth');
    breadcrumb('log', 'auth.signOut');
  },

  adoptServerEntitlement: async (server, userId) => {
    if (userId === null) {
      breadcrumb('log', 'auth.adoptServerEntitlement', { dropped: 'no account' });
      return { next: NO_ENTITLEMENT, mismatch: false };
    }
    const { map, merge } = adoptFor(get().entitlements, userId, server, now());
    if (map !== get().entitlements) {
      // State first, then the store: two answers in flight for two accounts each see the
      // other's record, and the last write carries both.
      set({ entitlements: map, entitlement: entitlementFor(map, get().userId) });
      await kvSet('entitlement', { byUser: get().entitlements });
    }
    breadcrumb('log', 'auth.adoptServerEntitlement', {
      server: (server as EntitlementResponse | null)?.status ?? null,
      account: merge.next.status,
      current: userId === get().userId,
      source: merge.next.source,
      mismatch: merge.mismatch,
    });
    return merge;
  },
}));

/** For `net/api.ts`, which cannot use a React hook. */
export function currentToken(): string | null {
  return useAuthStore.getState().token;
}

export function isEntitled(): boolean {
  return useAuthStore.getState().entitlement.status === 'full';
}
