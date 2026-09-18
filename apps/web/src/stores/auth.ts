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

export type EntitlementStatus = 'none' | 'full';

export interface Entitlement {
  readonly status: EntitlementStatus;
  /** `purchase` | `manual` | `code` — whatever the server said granted it. */
  readonly source: string | null;
  readonly grantedAt: number | null;
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
  setEntitlement: (entitlement: Entitlement) => Promise<void>;
}

export const useAuthStore = create<AuthState>()((set) => ({
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

  setEntitlement: async (entitlement) => {
    const stamped: Entitlement = { ...entitlement, checkedAt: entitlement.checkedAt || now() };
    set({ entitlement: stamped });
    await kvSet('entitlement', stamped);
    breadcrumb('log', 'auth.setEntitlement', { status: stamped.status, source: stamped.source });
  },
}));

/** For `net/api.ts`, which cannot use a React hook. */
export function currentToken(): string | null {
  return useAuthStore.getState().token;
}

export function isEntitled(): boolean {
  return useAuthStore.getState().entitlement.status === 'full';
}
