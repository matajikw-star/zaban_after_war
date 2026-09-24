/**
 * Who this device is, and what it is allowed to see (`what.md` §7.2, §7.6).
 *
 * Everything here lives in `kv`, not `localStorage`, so "log out" is one table to clear. The
 * entitlement cache is written only from a server response and is never revoked locally: an
 * online check that contradicts it is an error record, not a downgrade (§7.6).
 */

import { create } from 'zustand';
import { kvDelete, kvGet, kvSet } from '../db/repo.ts';
import { now } from '../engine/clock.ts';
import { breadcrumb } from '../log/breadcrumbs.ts';
import type { EntitlementResponse } from '../net/api.ts';
import { type EntitlementMerge, mergeEntitlement } from '../sync/entitlement.ts';

export type EntitlementStatus = 'none' | 'full';

export interface Entitlement {
  readonly status: EntitlementStatus;
  /** `zarinpal` | `manual` | `discount` — whatever the server said granted it. */
  readonly source: string | null;
  /** Verbatim from the server: PocketBase datetime text. */
  readonly grantedAt: string | null;
  readonly checkedAt: number;
}

export const NO_ENTITLEMENT: Entitlement = {
  status: 'none',
  source: null,
  grantedAt: null,
  checkedAt: 0,
};

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
  readonly entitlement: Entitlement;
  readonly loaded: boolean;
  load: (installId: string) => Promise<void>;
  signIn: (auth: AuthRecord) => Promise<void>;
  signOut: () => Promise<void>;
  /**
   * The only writer of `kv.entitlement`: a server answer, merged by `sync/entitlement.ts`'s
   * never-revoke rule (§7.6). There is deliberately no plain setter.
   */
  adoptServerEntitlement: (server: EntitlementResponse) => Promise<EntitlementMerge>;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  installId: '',
  userId: null,
  phone: null,
  token: null,
  entitlement: NO_ENTITLEMENT,
  loaded: false,

  load: async (installId) => {
    const [auth, entitlement] = await Promise.all([
      kvGet<AuthRecord>('auth'),
      kvGet<Entitlement>('entitlement'),
    ]);
    set({
      installId,
      userId: auth?.userId ?? null,
      phone: auth?.phone ?? null,
      token: auth?.token ?? null,
      entitlement: entitlement ?? NO_ENTITLEMENT,
      loaded: true,
    });
    breadcrumb('log', 'auth.load', {
      loggedIn: auth !== undefined,
      entitlement: (entitlement ?? NO_ENTITLEMENT).status,
    });
  },

  signIn: async (auth) => {
    set({ userId: auth.userId, phone: auth.phone, token: auth.token });
    await kvSet('auth', auth);
    breadcrumb('log', 'auth.signIn', { userId: auth.userId });
  },

  signOut: async () => {
    // The event log stays: it is this device's progress whether or not anyone is logged in.
    set({ userId: null, phone: null, token: null });
    await kvDelete('auth');
    breadcrumb('log', 'auth.signOut');
  },

  adoptServerEntitlement: async (server) => {
    const merge = mergeEntitlement(get().entitlement, server, now());
    if (merge.next !== get().entitlement) {
      await kvSet('entitlement', merge.next);
      set({ entitlement: merge.next });
    }
    breadcrumb('log', 'auth.adoptServerEntitlement', {
      server: server?.status ?? null,
      device: merge.next.status,
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
