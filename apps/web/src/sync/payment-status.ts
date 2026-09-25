/**
 * Asking the server what became of a payment (`what.md` §7.6, §7.8 `/purchase/result`, §8.2
 * `pay/status/:id`), and the launch-time recovery of a payment that never reached its result.
 *
 * `/checkout` writes `kv.pendingPayment` **before** it sends the browser to the gateway. The
 * callback lands on `/purchase/result`, which settles it. If that landing never happens — the user
 * closed the tab on the bank's page, the phone killed the browser, the redirect failed — the next
 * launch finds the record and asks `pay/status/:id` before anything assumes the payment failed.
 * Offline, the record stays for the next launch; a terminal answer clears it.
 *
 * `pollPayment` asks repeatedly on a bounded backoff (`POLL_DELAYS_MS`, under three minutes in
 * all), for `/purchase/result?status=pending` — the gateway could not be asked, and the server's
 * next callback or its 15-minute reconcile cron will settle it.
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
  /**
   * `verified` while the account holds no entitlement: the server contradicts itself. Terminal
   * (the record is cleared, a person must look), reported, and never shown as a failure — the
   * money was taken.
   */
  | { readonly kind: 'inconsistent' }
  /** Anything unnamed: a 5xx, a malformed answer. Retryable. */
  | { readonly kind: 'error' };

/** The answers that end a wait; everything else (`pending`, `network`, `error`) is asked again. */
export function isTerminal(outcome: PaymentOutcome): boolean {
  switch (outcome.kind) {
    case 'entitled':
    case 'failed':
    case 'unknown':
    case 'disabled':
    case 'unauthorized':
    case 'inconsistent':
      return true;
    case 'pending':
    case 'network':
    case 'error':
      return false;
  }
}

export interface PaymentStatusDeps {
  readonly status: (paymentId: string) => Promise<PayStatusResponse>;
  /**
   * `stores/auth.ts` `adoptServerEntitlement`, for the account the request was made as (captured
   * before it was sent, so a sign-out mid-request cannot move the grant to another account).
   */
  readonly adopt: (server: EntitlementResponse, userId: string | null) => Promise<unknown>;
  /** `/api/me` for the entitlement's `source` and `grantedAt`, fired after `entitled`. */
  readonly refreshEntitlement: () => Promise<unknown>;
  readonly readPending: () => Promise<PendingPayment | null>;
  /**
   * Removes `kv.pendingPayment` only if it names this payment, in one check-and-delete; true when
   * this call removed it. Whoever removes it queues `purchase_done`, so it is queued once.
   */
  readonly clearPending: (paymentId: string) => Promise<boolean>;
  readonly userId: () => string | null;
  /** Start the paid download (§7.5). Every `entitled` answer asks; the runner makes it idempotent. */
  readonly onEntitled: () => void;
  /** Queue `purchase_done` (§8.4) — only by the call whose clear removed the record. */
  readonly onPurchased: () => void;
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
 * entitlement, starts the download and clears the pending record — queueing `purchase_done` only
 * when this call is the one that removed it; `failed`/`expired`/unknown clear the record;
 * `pending` and every transient failure keep it. Never throws.
 */
export async function checkPayment(
  deps: PaymentStatusDeps,
  paymentId: string,
): Promise<PaymentOutcome> {
  const askedAs = deps.userId();
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
    try {
      await deps.adopt({ status: 'full', source: null, grantedAt: null }, askedAs);
    } catch (err) {
      // The server's yes stands; the next `/api/me` will cache it. Say so, and carry on.
      deps.reportError(err, { phase: 'pay.status.adopt', paymentId });
    }
    void deps.refreshEntitlement().catch(() => undefined);
    deps.onEntitled();
    outcome = { kind: 'entitled', refId: answer.refId ?? null };
  } else if (answer.status === 'pending') {
    outcome = { kind: 'pending' };
  } else if (answer.status === 'failed' || answer.status === 'expired') {
    outcome = { kind: 'failed', reason: answer.failReason ?? answer.status };
  } else {
    // `verified` without an entitlement. A double payment (§8.3) still leaves the account
    // entitled, so this is the server contradicting itself: a person must look.
    deps.reportError(new AppError('PAY_VERIFIED_NOT_ENTITLED', 'verified without an entitlement'), {
      phase: 'pay.status',
      paymentId,
      status: answer.status,
    });
    outcome = { kind: 'inconsistent' };
  }

  if (outcome.kind === 'entitled' || outcome.kind === 'failed' || outcome.kind === 'inconsistent') {
    const cleared = await clearIfSame(deps, paymentId);
    // A reload, a second poll or the ok landing that got there first finds no record: no beacon.
    if (outcome.kind === 'entitled' && cleared) deps.onPurchased();
  }
  breadcrumb('net', 'payment.status', { outcome: outcome.kind, status: answer.status });
  return outcome;
}

/** True when this call removed the record naming `paymentId`. */
async function clearIfSame(deps: PaymentStatusDeps, paymentId: string): Promise<boolean> {
  try {
    return await deps.clearPending(paymentId);
  } catch (err) {
    // Left in place, the record is asked about once more next launch and cleared then.
    deps.reportError(err, { phase: 'pay.pending.clear', paymentId });
    return false;
  }
}

export type RecoveryOutcome = 'none' | 'other-account' | PaymentOutcome['kind'];

/**
 * At launch, fire and forget: a payment started on this device and never settled is asked about
 * once. A record left by another account is kept for that account.
 */
export async function recoverPendingPayment(deps: PaymentStatusDeps): Promise<RecoveryOutcome> {
  let pending: PendingPayment | null;
  try {
    pending = await deps.readPending();
  } catch (err) {
    deps.reportError(err, { phase: 'pay.pending.read' });
    return 'error';
  }
  if (pending === null) return 'none';
  if (pending.userId !== deps.userId()) {
    breadcrumb('log', 'payment.recover', { outcome: 'other-account' });
    return 'other-account';
  }
  const outcome = await checkPayment(deps, pending.paymentId);
  breadcrumb('log', 'payment.recover', { outcome: outcome.kind });
  return outcome.kind;
}

/** Waits between `pay/status` asks: 2 s rising to 30 s, eleven asks in about 2 min 50 s. */
export const POLL_DELAYS_MS: readonly number[] = [
  2_000, 3_000, 5_000, 8_000, 13_000, 20_000, 30_000, 30_000, 30_000, 30_000,
];

export interface PollDeps extends PaymentStatusDeps {
  readonly sleep: (ms: number) => Promise<void>;
  /** The screen went away: stop asking. */
  readonly cancelled: () => boolean;
}

/**
 * Asks until a terminal answer or the delays run out, and returns the last answer — `pending`,
 * `network` or `error` when the budget is spent, which the screen shows as "still waiting" with
 * a button to ask again. Never throws.
 */
export async function pollPayment(deps: PollDeps, paymentId: string): Promise<PaymentOutcome> {
  let outcome = await checkPayment(deps, paymentId);
  for (const delay of POLL_DELAYS_MS) {
    if (isTerminal(outcome) || deps.cancelled()) break;
    await deps.sleep(delay);
    if (deps.cancelled()) break;
    outcome = await checkPayment(deps, paymentId);
  }
  breadcrumb('net', 'payment.poll', { outcome: outcome.kind });
  return outcome;
}
