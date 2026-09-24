/**
 * The checkout state machine (`what.md` §7.8 `/checkout`, §8.2 `pay/quote` and `pay/request`).
 *
 *   loading ─QUOTED→ ready ─APPLY→ applying ─QUOTED→ ready
 *                    ready ─PAY→ requesting ─REDIRECT→ redirecting   (→ the gateway)
 *                                requesting ─GRANTED→ granted        (a 100 % code, no gateway)
 *
 * and, from any request, `disabled` (the mock-SMS gate: calm, «پرداخت به‌زودی فعال می‌شود»),
 * `owned` (already entitled — nothing is charged), `loginNeeded` (401) and `error` (network,
 * 429, gateway down, anything unnamed) with a retry that repeats exactly the request that failed.
 *
 * Pure and total, a breadcrumb on every change (§17.2). The price is always the server's: the
 * client never computes one (§8.3). A code the server refused is shown by its `codeStatus`.
 */

import { breadcrumb } from '../../log/breadcrumbs.ts';
import type { DiscountCodeStatus, PayQuoteResponse } from '../../net/api.ts';

export type CheckoutProblem =
  | { readonly kind: 'network' }
  | { readonly kind: 'rateLimited'; readonly retryAfter: number }
  | { readonly kind: 'gateway' }
  | { readonly kind: 'failed' };

/** Which request a retry repeats. `code` is what the failed quote was asked with. */
export type CheckoutRetry =
  | { readonly kind: 'quote'; readonly code: string | null }
  | { readonly kind: 'request' };

export type CheckoutState =
  | { readonly name: 'loading' }
  /** `codeStatus`: the answer to the last code the user applied, shown under the field. */
  | {
      readonly name: 'ready';
      readonly quote: PayQuoteResponse;
      readonly codeStatus: DiscountCodeStatus;
    }
  | { readonly name: 'applying'; readonly quote: PayQuoteResponse; readonly code: string | null }
  | { readonly name: 'requesting'; readonly quote: PayQuoteResponse }
  | { readonly name: 'redirecting'; readonly gatewayUrl: string }
  | { readonly name: 'granted'; readonly paymentId: string }
  | { readonly name: 'disabled' }
  | { readonly name: 'owned' }
  | { readonly name: 'loginNeeded' }
  | {
      readonly name: 'error';
      readonly problem: CheckoutProblem;
      readonly retry: CheckoutRetry;
      /** The last good quote, so a retried request still knows the price; null before any. */
      readonly quote: PayQuoteResponse | null;
    };

export type CheckoutStateName = CheckoutState['name'];

/** What a failed request means to this screen (`flow.ts` maps `AppError` codes to these). */
export type CheckoutFailure =
  | CheckoutProblem
  | { readonly kind: 'disabled' }
  | { readonly kind: 'owned' }
  | { readonly kind: 'unauthorized' }
  | { readonly kind: 'discountRejected'; readonly codeStatus: DiscountCodeStatus };

export type CheckoutEvent =
  | { readonly type: 'QUOTED'; readonly quote: PayQuoteResponse }
  /** A code typed into the field; empty removes the applied one. */
  | { readonly type: 'APPLY'; readonly code: string }
  | { readonly type: 'PAY' }
  | { readonly type: 'REDIRECT'; readonly gatewayUrl: string }
  | { readonly type: 'GRANTED'; readonly paymentId: string }
  | { readonly type: 'FAILED'; readonly failure: CheckoutFailure }
  | { readonly type: 'RETRY' };

export const CHECKOUT_START: CheckoutState = { name: 'loading' };

export function transition(state: CheckoutState, event: CheckoutEvent): CheckoutState {
  const next = compute(state, event);
  if (next !== state) {
    breadcrumb('log', 'checkout.transition', {
      from: state.name,
      event: event.type,
      to: next.name,
      ...(next.name === 'ready' ? { codeStatus: next.codeStatus } : {}),
      ...(next.name === 'error' ? { problem: next.problem.kind } : {}),
    });
  }
  return next;
}

/** The code the next `pay/request` sends: only one the server accepted. */
export function appliedCode(quote: PayQuoteResponse): string | null {
  return quote.codeStatus === 'ok' ? quote.code : null;
}

function quoted(quote: PayQuoteResponse): CheckoutState {
  if (quote.codeStatus === 'already-entitled') return { name: 'owned' };
  return { name: 'ready', quote, codeStatus: quote.codeStatus };
}

function failed(
  failure: CheckoutFailure,
  retry: CheckoutRetry,
  quote: PayQuoteResponse | null,
): CheckoutState {
  switch (failure.kind) {
    case 'disabled':
      return { name: 'disabled' };
    case 'owned':
      return { name: 'owned' };
    case 'unauthorized':
      return { name: 'loginNeeded' };
    case 'discountRejected':
      // `pay/request` refused the code (its last use went to someone else): ask the server
      // again with the same code, so the screen shows the server's own status and plain price.
      if (quote === null) return { name: 'error', problem: { kind: 'failed' }, retry, quote };
      return { name: 'applying', quote, code: quote.code };
    case 'network':
    case 'rateLimited':
    case 'gateway':
    case 'failed':
      return { name: 'error', problem: failure, retry, quote };
  }
}

function compute(state: CheckoutState, event: CheckoutEvent): CheckoutState {
  switch (state.name) {
    case 'loading':
      if (event.type === 'QUOTED') return quoted(event.quote);
      if (event.type === 'FAILED')
        return failed(event.failure, { kind: 'quote', code: null }, null);
      return state;

    case 'ready':
      if (event.type === 'APPLY') {
        const code = event.code.trim();
        return { name: 'applying', quote: state.quote, code: code === '' ? null : code };
      }
      if (event.type === 'PAY') return { name: 'requesting', quote: state.quote };
      return state;

    case 'applying':
      if (event.type === 'QUOTED') return quoted(event.quote);
      if (event.type === 'FAILED') {
        return failed(event.failure, { kind: 'quote', code: state.code }, state.quote);
      }
      return state;

    case 'requesting':
      if (event.type === 'REDIRECT') return { name: 'redirecting', gatewayUrl: event.gatewayUrl };
      if (event.type === 'GRANTED') return { name: 'granted', paymentId: event.paymentId };
      if (event.type === 'FAILED') return failed(event.failure, { kind: 'request' }, state.quote);
      return state;

    case 'error':
      if (event.type !== 'RETRY') return state;
      if (state.retry.kind === 'request' && state.quote !== null) {
        return { name: 'requesting', quote: state.quote };
      }
      if (state.retry.kind === 'quote' && state.quote !== null) {
        return { name: 'applying', quote: state.quote, code: state.retry.code };
      }
      return { name: 'loading' };

    case 'redirecting':
    case 'granted':
    case 'disabled':
    case 'owned':
    case 'loginNeeded':
      return state;
  }
}
