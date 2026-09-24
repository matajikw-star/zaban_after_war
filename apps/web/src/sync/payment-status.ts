/**
 * Asking the server what became of a payment (`what.md` §7.6, §7.8 `/purchase/result`, §8.2
 * `pay/status/:id`), and the launch-time recovery of a payment that never reached its result.
 *
 * `/checkout` writes `kv.pendingPayment` **before** it sends the browser to the gateway. The
 * callback lands on `/purchase/result`, which settles it. If that landing never happens — the user
 * closed the tab on the bank's page, the phone killed the browser, the redirect failed — the next
 * launch finds the record and asks `pay/status/:id` before anything assumes the payment failed,
 * and `/checkout` refuses to start a second payment while one is still unanswered.
 *
 * The entitlement itself is only ever written from the server's answer (`entitled`), never from
 * the query string the browser arrived with.
 */

import { AppError, toAppError } from '../errors.ts';
import { breadcrumb } from '../log/breadcrumbs.ts';
import type { EntitlementResponse, PayStatusResponse } from '../net/api.ts';

/** `kv.pendingPayment`. */
export interface PendingPayment {
  readonly paymentId: string;
  /** The account that started it: another account's payment id is `NOT_FOUND` to this one. */
  readonly userId: string;
  readonly startedAt: number;
}

export function isPendingPayment(value: unknown): value is PendingPayment {
  const v = value as Partial<PendingPayment> | null | undefined;
  return (
    v !== null &&
    typeof v === 'object' &&
    typeof v.paymentId === 'string' &&
    v.paymentId !== '' &&
    typeof v.userId === 'string' &&
    typeof v.startedAt === 'number'
  );
}

/** What one `pay/status/:id` answer means to the device. */
export type PaymentOutcome =
  | { readonly kind: 'entitled'; readonly refId: string | null }
  | { readonly kind: 'pending' }
  | { readonly kind: 'failed'; readonly reason: string }
  /** No such payment for this account (404): nothing to wait for. */
  | { readonly kind: 'unknown' }
  | { readonly kind: 'network' }
  /** 503 `PAYMENT_DISABLED_MOCK_SMS` — staging, until real SMS. */
  | { readonly kind: 'disabled' }
  | { readonly kind: 'unauthorized' }
  /** Anything unnamed: a 5xx, a malformed answer. Retryable. */
  | { readonly kind: 'error' };

export interface PaymentStatusDeps {
  readonly status: (paymentId: string) => Promise<PayStatusResponse>;
  /** `stores/auth.ts` `adoptServerEntitlement`. */
  readonly adopt: (server: EntitlementResponse) => Promise<unknown>;
  /** `/api/me` for the entitlement's `source` and `grantedAt`, fired after `entitled`. */
  readonly refreshEntitlement: () => Promise<unknown>;
  readonly readPending: () => Promise<PendingPayment | null>;
  readonly clearPending: () => Promise<void>;
  readonly userId: () => string | null;
  /** Start the paid download (§7.5) and queue `purchase_done`. */
  readonly onEntitled: () => void;
  readonly reportError: (err: unknown, data: unknown) => void;
}

/** Maps a thrown request to an outcome. The unnamed ones are a bug worth a record. */
function outcomeOfError(err: unknown, deps: PaymentStatusDeps, paymentId: string): PaymentOutcome {
  const error = toAppError(err, 'PAY_STATUS_FAILED');
  switch (error.code) {
    case 'NETWORK':
      return { kind: 'network' };
    case 'SERVER_PAYMENT_DISABLED_MOCK_SMS':
      return { kind: 'disabled' };
    case 'UNAUTHORIZED':
      return { kind: 'unauthorized' };
    case 'SERVER_NOT_FOUND':
      return { kind: 'unknown' };
    default:
      deps.reportError(error, { phase: 'pay.status', paymentId });
      return { kind: 'error' };
  }
}

/**
 * One `pay/status/:id` call and everything that follows from its answer: `entitled` caches the
 * entitlement, clears the pending record and starts the download; `failed`/`expired`/unknown
 * clear the record; `pending` and every transient failure keep it. Never throws.
 */
export async function checkPayment(
  deps: PaymentStatusDeps,
  paymentId: string,
): Promise<PaymentOutcome> {
  let answer: PayStatusResponse;
  try {
    answer = await deps.status(paymentId);
  } catch (err) {
    const outcome = outcomeOfError(err, deps, paymentId);
    if (outcome.kind === 'unknown') await clearIfSame(deps, paymentId);
    breadcrumb('net', 'payment.status', { outcome: outcome.kind });
    return outcome;
  }

  let outcome: PaymentOutcome;
  if (answer.entitled === true) {
    await deps.adopt({ status: 'full', source: null, grantedAt: null });
    void deps.refreshEntitlement().catch(() => undefined);
    deps.onEntitled();
    outcome = { kind: 'entitled', refId: answer.refId ?? null };
  } else if (answer.status === 'pending') {
    outcome = { kind: 'pending' };
  } else if (answer.status === 'failed' || answer.status === 'expired') {
    outcome = { kind: 'failed', reason: answer.failReason ?? answer.status };
  } else {
    // `verified` without an entitlement: the payment went through for an account that already
    // held one (a double payment, §8.3) or the server is inconsistent. Either way, a person.
    deps.reportError(new AppError('PAY_VERIFIED_NOT_ENTITLED', 'verified without an entitlement'), {
      phase: 'pay.status',
      paymentId,
      status: answer.status,
    });
    outcome = { kind: 'error' };
  }

  if (outcome.kind === 'entitled' || outcome.kind === 'failed') {
    await clearIfSame(deps, paymentId);
  }
  breadcrumb('net', 'payment.status', { outcome: outcome.kind, status: answer.status });
  return outcome;
}

async function clearIfSame(deps: PaymentStatusDeps, paymentId: string): Promise<void> {
  const pending = await deps.readPending();
  if (pending !== null && pending.paymentId === paymentId) await deps.clearPending();
}

export type RecoveryOutcome = 'none' | 'other-account' | PaymentOutcome['kind'];

/**
 * At launch, fire and forget: a payment started on this device and never settled is asked about
 * once. A record left by another account is kept for that account.
 */
export async function recoverPendingPayment(deps: PaymentStatusDeps): Promise<RecoveryOutcome> {
  const pending = await deps.readPending();
  if (pending === null) return 'none';
  if (pending.userId !== deps.userId()) {
    breadcrumb('log', 'payment.recover', { outcome: 'other-account' });
    return 'other-account';
  }
  const outcome = await checkPayment(deps, pending.paymentId);
  breadcrumb('log', 'payment.recover', { outcome: outcome.kind });
  return outcome.kind;
}
