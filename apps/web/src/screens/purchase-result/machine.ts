/**
 * The purchase result's state (`what.md` §7.8 `/purchase/result`), where the payment callback's
 * 302 lands: `?status=ok|failed|pending&paymentId=…` (plus `ref` on ok, `reason` on failed).
 *
 *   ok      → confirming (`/api/me`) → entitled | waiting (the server has not caught up)
 *   pending → waiting (`pay/status/:id` on a bounded backoff) → entitled | failed | stillPending
 *   failed  → failed(reason), with a retry that goes back to `/checkout`
 *
 * The query string decides only which question to ask. The entitlement is written from the
 * server's answer alone (§7.6), so a hand-typed `?status=ok` unlocks nothing.
 */

import { breadcrumb } from '../../log/breadcrumbs.ts';

export type ResultState =
  | { readonly name: 'confirming'; readonly paymentId: string | null }
  | { readonly name: 'waiting'; readonly paymentId: string }
  /** `refId`: the bank's reference, for display only («کد پیگیری»). */
  | { readonly name: 'entitled'; readonly refId: string | null }
  | { readonly name: 'stillPending'; readonly paymentId: string }
  | { readonly name: 'failed'; readonly reason: string }
  /** The server could not be reached; `then` is the question a retry asks again. */
  | {
      readonly name: 'offline';
      readonly then: 'confirm' | 'wait';
      readonly paymentId: string | null;
    }
  | { readonly name: 'loginNeeded' }
  | { readonly name: 'inconsistent' }
  | { readonly name: 'disabled' };

export type ResultStateName = ResultState['name'];

export type ResultEvent =
  | { readonly type: 'ENTITLED'; readonly refId: string | null }
  /** `/api/me` still says none after an ok: ask the payment itself. */
  | { readonly type: 'NOT_YET' }
  | { readonly type: 'STILL_PENDING' }
  | { readonly type: 'FAILED'; readonly reason: string }
  | { readonly type: 'OFFLINE' }
  | { readonly type: 'UNAUTHORIZED' }
  | { readonly type: 'INCONSISTENT' }
  | { readonly type: 'DISABLED' }
  | { readonly type: 'RETRY' };

/** Where the landing starts, from the query string alone. */
export function initialResultState(params: URLSearchParams): ResultState {
  const status = params.get('status');
  const paymentId = nonEmpty(params.get('paymentId'));
  if (status === 'ok') return { name: 'confirming', paymentId };
  if (status === 'failed')
    return { name: 'failed', reason: nonEmpty(params.get('reason')) ?? 'other' };
  // `pending`, or a landing without a status (a bookmark, a reload): ask about the payment.
  if (paymentId !== null) return { name: 'waiting', paymentId };
  return { name: 'failed', reason: 'unknown_payment' };
}

function nonEmpty(value: string | null): string | null {
  return value === null || value.trim() === '' ? null : value;
}

/** The `ref` query value, shown with an ok result. */
export function refFromQuery(params: URLSearchParams): string | null {
  return nonEmpty(params.get('ref'));
}

export function transition(state: ResultState, event: ResultEvent): ResultState {
  const next = compute(state, event);
  if (next !== state) {
    breadcrumb('log', 'purchaseResult.transition', {
      from: state.name,
      event: event.type,
      to: next.name,
      ...(next.name === 'failed' ? { reason: next.reason } : {}),
    });
  }
  return next;
}

/** The answers every asking state treats alike. */
function common(event: ResultEvent): ResultState | null {
  switch (event.type) {
    case 'ENTITLED':
      return { name: 'entitled', refId: event.refId };
    case 'FAILED':
      return { name: 'failed', reason: event.reason };
    case 'UNAUTHORIZED':
      return { name: 'loginNeeded' };
    case 'INCONSISTENT':
      return { name: 'inconsistent' };
    case 'DISABLED':
      return { name: 'disabled' };
    default:
      return null;
  }
}

function compute(state: ResultState, event: ResultEvent): ResultState {
  switch (state.name) {
    case 'confirming': {
      const shared = common(event);
      if (shared !== null) return shared;
      if (event.type === 'NOT_YET') {
        return state.paymentId === null
          ? { name: 'failed', reason: 'unknown_payment' }
          : { name: 'waiting', paymentId: state.paymentId };
      }
      if (event.type === 'OFFLINE') {
        return { name: 'offline', then: 'confirm', paymentId: state.paymentId };
      }
      return state;
    }

    case 'waiting': {
      const shared = common(event);
      if (shared !== null) return shared;
      if (event.type === 'STILL_PENDING')
        return { name: 'stillPending', paymentId: state.paymentId };
      if (event.type === 'OFFLINE')
        return { name: 'offline', then: 'wait', paymentId: state.paymentId };
      return state;
    }

    case 'offline':
      if (event.type !== 'RETRY') return state;
      if (state.then === 'confirm') return { name: 'confirming', paymentId: state.paymentId };
      return state.paymentId === null
        ? { name: 'failed', reason: 'unknown_payment' }
        : { name: 'waiting', paymentId: state.paymentId };

    case 'stillPending':
      if (event.type === 'RETRY') return { name: 'waiting', paymentId: state.paymentId };
      return state;

    case 'entitled':
    case 'failed':
    case 'loginNeeded':
    case 'inconsistent':
    case 'disabled':
      return state;
  }
}
