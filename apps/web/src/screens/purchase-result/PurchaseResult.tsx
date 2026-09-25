/**
 * `/purchase/result` (`what.md` §7.8) — **online**. Where the payment callback lands.
 *
 * ok: `/api/me`, cache the entitlement, start the download, show its progress — study works
 * throughout on whatever package is active. failed: the Persian reason and a retry. pending:
 * `pay/status/:id` on a bounded backoff until it settles or the wait is spent. `machine.ts` holds
 * the states, `flow.ts` the questions; each effect runs once per state object, and polling stops
 * when the screen goes away.
 */

import { CircleAlert } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { queueBeacon } from '../../log/beacon.ts';
import { reportError } from '../../log/errors.ts';
import { useAuthStore } from '../../stores/auth.ts';
import { useContentStore } from '../../stores/content.ts';
import { useSyncStore } from '../../stores/sync.ts';
import { strings } from '../../strings.ts';
import { requestDownload } from '../../sync/download-live.ts';
import { refreshEntitlementNow } from '../../sync/entitlement-live.ts';
import { pollDeps, settlePendingPayment } from '../../sync/payment-live.ts';
import { pollPayment } from '../../sync/payment-status.ts';
import { Button } from '../../ui/Button.tsx';
import { Card } from '../../ui/Card.tsx';
import { downloadCanRetry, downloadPercent, downloadStatusText } from '../../ui/download-status.ts';
import { ProgressBar } from '../../ui/Progress.tsx';
import { loginPathFor } from '../login/machine.ts';
import { confirmOk, type ResultDeps, waitForPayment } from './flow.ts';
import {
  initialResultState,
  type ResultEvent,
  type ResultState,
  refFromQuery,
  transition,
} from './machine.ts';

/** Said in words and an icon, never in red (§7.9). */
const NOTE_CLASS = 'flex items-start gap-2 text-body font-medium text-[var(--fg)]';

function reasonText(reason: string): string {
  const reasons: Record<string, string> = strings.purchase.reasons;
  return reasons[reason] ?? strings.purchase.reasons.other;
}

export function PurchaseResult() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [state, setState] = useState<ResultState>(() => initialResultState(params));
  const effectFor = useRef<ResultState | null>(null);
  const alive = useRef(true);
  const download = useSyncStore((s) => s.download);
  const entitled = useAuthStore((s) => s.entitlement.status === 'full');

  const dispatch = useCallback((event: ResultEvent): void => {
    if (!alive.current) return;
    setState((current) => transition(current, event));
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (effectFor.current === state) return;
    effectFor.current = state;

    const deps: ResultDeps = {
      userId: () => useAuthStore.getState().userId,
      refreshEntitlement: refreshEntitlementNow,
      poll: (paymentId) =>
        pollPayment(
          pollDeps(() => !alive.current),
          paymentId,
        ),
      settlePending: settlePendingPayment,
      onPurchased: () => {
        void queueBeacon('purchase_done');
      },
      reportError: (err, phase) => void reportError('payment', err, { phase }),
    };

    if (state.name === 'confirming') {
      void confirmOk(deps, state.paymentId, refFromQuery(params)).then(dispatch);
    } else if (state.name === 'waiting') {
      void waitForPayment(deps, state.paymentId).then(dispatch);
    } else if (state.name === 'entitled') {
      // Idempotent: the refresh already asked, and a run in progress queues this once (§7.5).
      void requestDownload('entitled');
    }
  }, [state, params, dispatch]);

  // The paid words are loaded for this account: a failed update check must not read as missing.
  const paidOnDevice = useContentStore((s) => s.active === 'paid');
  const percent = downloadPercent(download, entitled);
  const here = `/purchase/result?${params.toString()}`;

  return (
    <main
      className="flex flex-1 flex-col gap-4 pt-2"
      data-state={state.name}
      data-testid="purchase-result"
    >
      <h1 className="flex min-h-11 items-center text-h5 font-medium">
        {strings.screens.purchaseResult}
      </h1>

      <Card className="flex flex-col gap-3" aria-live="polite">
        {state.name === 'confirming' || state.name === 'waiting' ? (
          <p role="status" className="text-body">
            {state.name === 'confirming' ? strings.purchase.confirming : strings.purchase.waiting}
          </p>
        ) : null}

        {state.name === 'entitled' ? (
          <>
            <p role="status" data-testid="purchase-entitled" className="text-h6 font-medium">
              {strings.purchase.entitled}
            </p>
            {state.refId !== null ? (
              <p className="text-body-sm text-[var(--fg-muted)]">
                {strings.purchase.refIdLabel} <bdi dir="ltr">{state.refId}</bdi>
              </p>
            ) : null}
            <p
              className="text-body-sm text-[var(--fg-muted)]"
              data-testid="purchase-download-status"
              data-state={download.name}
            >
              {downloadStatusText(download, entitled, paidOnDevice)}
            </p>
            {percent !== null ? (
              <ProgressBar value={percent} ariaLabel={strings.download.progressLabel} />
            ) : null}
            {downloadCanRetry(download, entitled, paidOnDevice) ? (
              <Button
                variant="secondary"
                size="sm"
                data-testid="purchase-download-retry"
                onClick={() => void requestDownload('manual')}
              >
                {strings.download.retry}
              </Button>
            ) : null}
          </>
        ) : null}

        {state.name === 'failed' ? (
          <>
            <p
              role="alert"
              data-testid="purchase-failed"
              data-reason={state.reason}
              className={NOTE_CLASS}
            >
              <CircleAlert size={20} aria-hidden="true" className="mt-0.5 shrink-0" />
              {strings.purchase.failedTitle}
            </p>
            <p className="text-body-sm">{reasonText(state.reason)}</p>
            {state.reason === 'cancelled' ? null : (
              <p className="text-caption text-[var(--fg-muted)]">{strings.purchase.moneyNote}</p>
            )}
          </>
        ) : null}

        {state.name === 'stillPending' ? (
          <p role="status" data-testid="purchase-still-pending" className="text-body">
            {strings.purchase.stillPending}
          </p>
        ) : null}

        {state.name === 'offline' ? (
          <p role="status" className={NOTE_CLASS}>
            <CircleAlert size={20} aria-hidden="true" className="mt-0.5 shrink-0" />
            {strings.purchase.offline}
          </p>
        ) : null}

        {state.name === 'loginNeeded' ? (
          <p role="status" className="text-body">
            {strings.purchase.loginNeeded}
          </p>
        ) : null}

        {state.name === 'inconsistent' ? (
          <p role="alert" className={NOTE_CLASS}>
            <CircleAlert size={20} aria-hidden="true" className="mt-0.5 shrink-0" />
            {strings.purchase.inconsistent}
          </p>
        ) : null}

        {state.name === 'disabled' ? (
          <p role="status" data-testid="payment-soon" className="text-body font-medium">
            {strings.payment.soon}
          </p>
        ) : null}
      </Card>

      {state.name === 'entitled' ? (
        <Button
          variant="primary"
          size="lg"
          block
          data-testid="purchase-start-review"
          onClick={() => void navigate('/review')}
        >
          {strings.purchase.startReview}
        </Button>
      ) : null}

      {state.name === 'failed' ? (
        <Button
          variant="primary"
          size="lg"
          block
          data-testid="purchase-retry"
          onClick={() => void navigate('/checkout')}
        >
          {strings.purchase.retry}
        </Button>
      ) : null}

      {state.name === 'stillPending' || state.name === 'offline' ? (
        <Button
          variant="primary"
          size="lg"
          block
          data-testid="purchase-check-again"
          onClick={() => dispatch({ type: 'RETRY' })}
        >
          {state.name === 'offline' ? strings.payment.retry : strings.purchase.checkAgain}
        </Button>
      ) : null}

      {state.name === 'loginNeeded' ? (
        <Button
          variant="primary"
          size="lg"
          block
          data-testid="purchase-login"
          onClick={() => void navigate(loginPathFor(here))}
        >
          {strings.purchase.login}
        </Button>
      ) : null}

      {state.name !== 'entitled' && state.name !== 'confirming' && state.name !== 'waiting' ? (
        <Button
          variant={state.name === 'inconsistent' || state.name === 'disabled' ? 'primary' : 'ghost'}
          block
          data-testid="purchase-later"
          onClick={() => void navigate('/review')}
        >
          {strings.purchase.later}
        </Button>
      ) : null}
    </main>
  );
}
