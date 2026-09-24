/**
 * The paywall's state (`what.md` §7.8 `/paywall`): the argument and «بعداً» always work, offline
 * too; the price and «خرید» appear once the server has said payment is open.
 *
 * `loading → ready | disabled | offline | failed | owned`; `offline` and `failed` retry.
 * `disabled` is the mock-SMS gate (§8.2): a calm «پرداخت به‌زودی فعال می‌شود», never an error.
 */

import { breadcrumb } from '../../log/breadcrumbs.ts';

export interface Prices {
  /** Toman, as the server sent them. The client only displays (§8.3). */
  readonly listPrice: number;
  readonly salePrice: number;
}

export type PaywallState =
  | { readonly name: 'loading' }
  | { readonly name: 'ready'; readonly prices: Prices }
  | { readonly name: 'disabled' }
  | { readonly name: 'offline' }
  | { readonly name: 'failed' }
  /** The account already holds the full version: nothing to sell. */
  | { readonly name: 'owned' };

export type PaywallEvent =
  | { readonly type: 'LOADED'; readonly prices: Prices }
  | { readonly type: 'DISABLED' }
  | { readonly type: 'OFFLINE' }
  | { readonly type: 'FAILED' }
  | { readonly type: 'OWNED' }
  | { readonly type: 'RETRY' };

export const PAYWALL_START: PaywallState = { name: 'loading' };

export function transition(state: PaywallState, event: PaywallEvent): PaywallState {
  const next = compute(state, event);
  if (next !== state) {
    breadcrumb('log', 'paywall.transition', { from: state.name, event: event.type, to: next.name });
  }
  return next;
}

function compute(state: PaywallState, event: PaywallEvent): PaywallState {
  switch (state.name) {
    case 'loading':
      switch (event.type) {
        case 'LOADED':
          return { name: 'ready', prices: event.prices };
        case 'DISABLED':
          return { name: 'disabled' };
        case 'OFFLINE':
          return { name: 'offline' };
        case 'FAILED':
          return { name: 'failed' };
        case 'OWNED':
          return { name: 'owned' };
        case 'RETRY':
          return state;
      }
      break;
    case 'offline':
    case 'failed':
      if (event.type === 'RETRY') return { name: 'loading' };
      return state;
    case 'ready':
    case 'disabled':
    case 'owned':
      return state;
  }
  return state;
}
