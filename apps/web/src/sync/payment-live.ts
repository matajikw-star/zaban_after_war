/**
 * `payment-status.ts` bound to the device: `pay/status/:id`, `kv.pendingPayment`, the auth store,
 * the download and the `purchase_done` beacon. Used by `/checkout`, `/purchase/result` and the
 * launch recovery in `main.tsx`.
 */

import { kvDelete, kvGet, kvSet } from '../db/repo.ts';
import { now } from '../engine/clock.ts';
import { queueBeacon } from '../log/beacon.ts';
import { reportError } from '../log/errors.ts';
import { payStatus } from '../net/api.ts';
import { useAuthStore } from '../stores/auth.ts';
import { requestDownload } from './download-live.ts';
import { refreshEntitlementNow } from './entitlement-live.ts';
import {
  isPendingPayment,
  type PaymentStatusDeps,
  type PendingPayment,
  type PollDeps,
  type RecoveryOutcome,
  recoverPendingPayment,
} from './payment-status.ts';

export const paymentDeps: PaymentStatusDeps = {
  status: payStatus,
  adopt: (server) => useAuthStore.getState().adoptServerEntitlement(server),
  refreshEntitlement: refreshEntitlementNow,
  readPending: async () => {
    const stored = await kvGet<unknown>('pendingPayment');
    return isPendingPayment(stored) ? stored : null;
  },
  clearPending: () => kvDelete('pendingPayment'),
  userId: () => useAuthStore.getState().userId,
  onEntitled: () => {
    void requestDownload('entitled');
    void queueBeacon('purchase_done');
  },
  reportError: (err, data) => {
    void reportError('payment', err, data);
  },
};

/** `paymentDeps` plus a real sleep, for a screen that polls until it unmounts. */
export function pollDeps(cancelled: () => boolean): PollDeps {
  return {
    ...paymentDeps,
    sleep: (ms) => new Promise((resolve) => globalThis.setTimeout(resolve, ms)),
    cancelled,
  };
}

/** Written by `/checkout` just before it leaves for the gateway. */
export function writePendingPayment(paymentId: string, userId: string): Promise<void> {
  const record: PendingPayment = { paymentId, userId, startedAt: now() };
  return kvSet('pendingPayment', record);
}

/** Clears `kv.pendingPayment` when it names this payment (an ok result, settled by `/api/me`). */
export async function settlePendingPayment(paymentId: string): Promise<void> {
  const pending = await paymentDeps.readPending();
  if (pending !== null && pending.paymentId === paymentId) await paymentDeps.clearPending();
}

/** At launch, fire and forget. Offline leaves the record for the next launch. */
export function recoverPendingPaymentNow(): Promise<RecoveryOutcome> {
  return recoverPendingPayment(paymentDeps);
}
