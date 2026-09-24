/**
 * The two questions `/purchase/result` asks, each turned into a `ResultEvent`. Neither throws.
 *
 * - `confirmOk`: the callback said ok, so ask `/api/me` (§7.8) — which caches the entitlement
 *   through the never-revoke merge and starts the download (`sync/entitlement.ts`).
 * - `waitForPayment`: ask `pay/status/:id` on the bounded backoff of `sync/payment-status.ts`,
 *   which caches, clears `kv.pendingPayment` on a terminal answer and starts the download itself.
 */

import type { RefreshOutcome } from '../../sync/entitlement.ts';
import type { PaymentOutcome } from '../../sync/payment-status.ts';
import type { ResultEvent } from './machine.ts';

export interface ResultDeps {
  readonly userId: () => string | null;
  /** `sync/entitlement-live.ts` `refreshEntitlementNow`. */
  readonly refreshEntitlement: () => Promise<RefreshOutcome>;
  /** `sync/payment-status.ts` `pollPayment`, bound. */
  readonly poll: (paymentId: string) => Promise<PaymentOutcome>;
  /** Clears `kv.pendingPayment` when it names this payment. */
  readonly settlePending: (paymentId: string) => Promise<void>;
  /** `purchase_done` (§8.4). */
  readonly onPurchased: () => void;
  readonly reportError: (err: unknown, phase: string) => void;
}

export async function confirmOk(
  deps: ResultDeps,
  paymentId: string | null,
  refId: string | null,
): Promise<ResultEvent> {
  if (deps.userId() === null) return { type: 'UNAUTHORIZED' };
  const outcome = await deps.refreshEntitlement();
  if (outcome === 'failed') return { type: 'OFFLINE' };
  if (outcome === 'none') return { type: 'NOT_YET' };
  if (paymentId !== null) {
    try {
      await deps.settlePending(paymentId);
    } catch (err) {
      deps.reportError(err, 'purchaseResult.settlePending');
    }
  }
  deps.onPurchased();
  return { type: 'ENTITLED', refId };
}

export async function waitForPayment(deps: ResultDeps, paymentId: string): Promise<ResultEvent> {
  if (deps.userId() === null) return { type: 'UNAUTHORIZED' };
  const outcome = await deps.poll(paymentId);
  switch (outcome.kind) {
    case 'entitled':
      return { type: 'ENTITLED', refId: outcome.refId };
    case 'failed':
      return { type: 'FAILED', reason: outcome.reason };
    case 'unknown':
      return { type: 'FAILED', reason: 'unknown_payment' };
    case 'disabled':
      return { type: 'DISABLED' };
    case 'unauthorized':
      return { type: 'UNAUTHORIZED' };
    case 'inconsistent':
      return { type: 'INCONSISTENT' };
    case 'network':
      return { type: 'OFFLINE' };
    case 'pending':
    case 'error':
      return { type: 'STILL_PENDING' };
  }
}
