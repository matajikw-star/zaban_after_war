/**
 * The two requests of `/checkout` (`what.md` §7.8, §8.2), each turned into a `CheckoutEvent`.
 * Neither throws. Every dependency is injected, so `checkout.test.ts` drives them with fakes.
 *
 * `startPayment` writes `kv.pendingPayment` **before** it hands back the gateway URL: if the
 * browser never comes back from the bank, the next launch still knows to ask (§7.8). A failed
 * write is reported and the payment goes ahead — the record is a safety net, and the server's
 * callback and its reconcile cron settle the payment without it.
 */

import { AppError } from '../../errors.ts';
import type { DiscountCodeStatus, PayQuoteResponse, PayRequestResponse } from '../../net/api.ts';
import { DEFAULT_RETRY_AFTER_SECONDS } from '../login/machine.ts';
import type { CheckoutEvent, CheckoutFailure } from './machine.ts';

export interface CheckoutDeps {
  readonly quote: (code: string | null) => Promise<PayQuoteResponse>;
  readonly request: (code: string | null) => Promise<PayRequestResponse>;
  readonly userId: () => string | null;
  readonly writePending: (paymentId: string, userId: string) => Promise<void>;
  /** `purchase_started` (§8.4). */
  readonly onStarted: () => void;
  readonly reportError: (err: unknown, phase: string) => void;
}

const CODE_STATUSES: ReadonlySet<string> = new Set<DiscountCodeStatus>([
  'none',
  'ok',
  'invalid',
  'expired',
  'exhausted',
  'used',
  'already-entitled',
]);

function isCodeStatus(value: unknown): value is DiscountCodeStatus {
  return typeof value === 'string' && CODE_STATUSES.has(value);
}

/** `AppError` codes from `net/api.ts` → what the screen does about them. */
export function failureFromError(err: unknown): CheckoutFailure {
  if (!(err instanceof AppError)) return { kind: 'failed' };
  const data = (err.data ?? {}) as { retryAfter?: unknown; codeStatus?: unknown };
  switch (err.code) {
    case 'SERVER_PAYMENT_DISABLED_MOCK_SMS':
      return { kind: 'disabled' };
    case 'SERVER_ALREADY_ENTITLED':
      return { kind: 'owned' };
    case 'UNAUTHORIZED':
      return { kind: 'unauthorized' };
    case 'NETWORK':
      return { kind: 'network' };
    case 'RATE_LIMITED':
      return {
        kind: 'rateLimited',
        retryAfter:
          typeof data.retryAfter === 'number' && data.retryAfter > 0
            ? data.retryAfter
            : DEFAULT_RETRY_AFTER_SECONDS,
      };
    case 'SERVER_GATEWAY_FAILED':
      return { kind: 'gateway' };
    case 'SERVER_DISCOUNT_REJECTED':
      return {
        kind: 'discountRejected',
        codeStatus: isCodeStatus(data.codeStatus) ? data.codeStatus : 'invalid',
      };
    default:
      return { kind: 'failed' };
  }
}

/**
 * Only an absolute http(s) URL is followed. Zarinpal's is https; the mock gateway's is our own
 * callback, http on a local e2e server. Anything else is a server bug, not a place to send a
 * user with a card in hand.
 */
export function isGatewayUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function toFailed(deps: CheckoutDeps, err: unknown, phase: string): CheckoutEvent {
  const failure = failureFromError(err);
  // Named outcomes are the user's or the weather; only the unnamed ones are a bug worth a record.
  if (failure.kind === 'failed') deps.reportError(err, phase);
  return { type: 'FAILED', failure };
}

export async function fetchQuote(deps: CheckoutDeps, code: string | null): Promise<CheckoutEvent> {
  try {
    return { type: 'QUOTED', quote: await deps.quote(code) };
  } catch (err) {
    return toFailed(deps, err, 'checkout.quote');
  }
}

export async function startPayment(
  deps: CheckoutDeps,
  code: string | null,
): Promise<CheckoutEvent> {
  const userId = deps.userId();
  if (userId === null) return { type: 'FAILED', failure: { kind: 'unauthorized' } };

  let response: PayRequestResponse;
  try {
    response = await deps.request(code);
  } catch (err) {
    return toFailed(deps, err, 'checkout.request');
  }

  if (response.granted === true) return { type: 'GRANTED', paymentId: response.paymentId };

  if (!isGatewayUrl(response.gatewayUrl)) {
    deps.reportError(
      new AppError('PAY_BAD_GATEWAY_URL', 'pay/request answered without a usable gateway URL', {
        paymentId: response.paymentId,
      }),
      'checkout.request',
    );
    return { type: 'FAILED', failure: { kind: 'failed' } };
  }

  try {
    await deps.writePending(response.paymentId, userId);
  } catch (err) {
    deps.reportError(err, 'checkout.writePending');
  }
  deps.onStarted();
  return { type: 'REDIRECT', gatewayUrl: response.gatewayUrl };
}
