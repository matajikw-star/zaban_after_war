/**
 * `/checkout` (`what.md` §7.8) — **online**. The server's price, a discount-code field that asks
 * `pay/quote` and shows its `codeStatus` in Persian, and «پرداخت» → `pay/request` → the gateway,
 * or straight to `/purchase/result` for a 100 % code. Login is required: an anonymous device is
 * sent to `/login?next=/checkout` and comes back here.
 *
 * `machine.ts` decides every state and `flow.ts` performs the requests; this file renders the
 * state and runs the one effect that belongs to it, once per state object (StrictMode-safe, so
 * a double render never sends two payment requests). On staging every pay route answers the
 * mock-SMS gate's 503 and this screen says «پرداخت به‌زودی فعال می‌شود» — never an error.
 */

import { CircleAlert } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { queueBeacon } from '../../log/beacon.ts';
import { reportError } from '../../log/errors.ts';
import { payQuote, payRequest } from '../../net/api.ts';
import { useAuthStore } from '../../stores/auth.ts';
import { strings } from '../../strings.ts';
import { refreshEntitlementNow } from '../../sync/entitlement-live.ts';
import { writePendingPayment } from '../../sync/payment-live.ts';
import { Button } from '../../ui/Button.tsx';
import { Card } from '../../ui/Card.tsx';
import { faNumber } from '../../ui/format.ts';
import { Input } from '../../ui/Input.tsx';
import { loginPathFor } from '../login/machine.ts';
import { type CheckoutDeps, fetchQuote, startPayment } from './flow.ts';
import {
  appliedCode,
  CHECKOUT_START,
  type CheckoutEvent,
  type CheckoutProblem,
  type CheckoutState,
  transition,
} from './machine.ts';

const deps: CheckoutDeps = {
  quote: (code) => payQuote(code ?? undefined),
  request: (code) => payRequest(code ?? undefined),
  userId: () => useAuthStore.getState().userId,
  writePending: writePendingPayment,
  onStarted: () => {
    void queueBeacon('purchase_started');
  },
  reportError: (err, phase) => void reportError('payment', err, { phase }),
};

/** Said in words and an icon, never in red (§7.9). */
const NOTE_CLASS = 'flex items-start gap-2 text-body-sm font-medium text-[var(--fg)]';

function problemText(problem: CheckoutProblem): string {
  switch (problem.kind) {
    case 'network':
      return strings.checkout.network;
    case 'rateLimited':
      return strings.checkout.rateLimited(faNumber(Math.ceil(problem.retryAfter / 60)));
    case 'gateway':
      return strings.checkout.gateway;
    case 'failed':
      return strings.checkout.failed;
  }
}

function toman(amount: number): string {
  return strings.payment.toman(faNumber(amount));
}

export function Checkout() {
  const navigate = useNavigate();
  const userId = useAuthStore((s) => s.userId);
  const [state, setState] = useState<CheckoutState>(CHECKOUT_START);
  const [codeInput, setCodeInput] = useState('');
  const effectFor = useRef<CheckoutState | null>(null);

  const dispatch = useCallback((event: CheckoutEvent): void => {
    setState((current) => transition(current, event));
  }, []);

  useEffect(() => {
    // Login is required before checkout (§7.8); `/login` brings the user back here.
    if (userId === null) {
      void navigate(loginPathFor('/checkout'), { replace: true });
      return;
    }
    if (effectFor.current === state) return;
    effectFor.current = state;

    switch (state.name) {
      case 'loading':
        void fetchQuote(deps, null).then(dispatch);
        break;
      case 'applying':
        void fetchQuote(deps, state.code).then(dispatch);
        break;
      case 'requesting':
        void startPayment(deps, appliedCode(state.quote)).then(dispatch);
        break;
      case 'redirecting':
        // `kv.pendingPayment` is already written (`flow.ts`); the bank's page replaces this one.
        globalThis.location.assign(state.gatewayUrl);
        break;
      case 'granted':
        void navigate(
          `/purchase/result?${new URLSearchParams({ status: 'ok', paymentId: state.paymentId })}`,
          { replace: true },
        );
        break;
      case 'owned':
        // The server says this account is entitled: make the device agree (§7.6).
        void refreshEntitlementNow();
        break;
      case 'loginNeeded':
        void navigate(loginPathFor('/checkout'), { replace: true });
        break;
      case 'ready':
      case 'disabled':
      case 'error':
        break;
    }
  }, [state, userId, navigate, dispatch]);

  function apply(e: FormEvent): void {
    e.preventDefault();
    dispatch({ type: 'APPLY', code: codeInput });
  }

  const quote =
    state.name === 'ready' || state.name === 'applying' || state.name === 'requesting'
      ? state.quote
      : state.name === 'error'
        ? state.quote
        : null;
  const busy =
    state.name === 'applying' || state.name === 'requesting' || state.name === 'redirecting';
  const codeStatus = state.name === 'ready' ? state.codeStatus : null;
  const laterIsPrimary = state.name === 'disabled' || state.name === 'owned';

  return (
    <main
      className="flex flex-1 flex-col gap-4 pt-2"
      data-state={state.name}
      data-testid="checkout"
    >
      <h1 className="flex min-h-11 items-center text-h5 font-medium">{strings.screens.checkout}</h1>

      {state.name === 'loading' ? (
        <p className="text-body-sm text-[var(--fg-muted)]" role="status">
          {strings.checkout.loading}
        </p>
      ) : null}

      {state.name === 'disabled' ? (
        <Card>
          <p role="status" data-testid="payment-soon" className="text-body font-medium">
            {strings.payment.soon}
          </p>
        </Card>
      ) : null}

      {state.name === 'owned' ? (
        <Card>
          <p role="status" className="text-body font-medium">
            {strings.checkout.owned}
          </p>
        </Card>
      ) : null}

      {quote !== null && state.name !== 'redirecting' ? (
        <Card className="flex flex-col gap-3">
          <dl className="flex flex-col gap-2 text-body">
            <div className="flex items-baseline justify-between gap-2">
              <dt>{strings.checkout.priceLabel}</dt>
              <dd className="flex items-baseline gap-2">
                {quote.listPrice > quote.salePrice ? (
                  <s className="text-body-sm text-[var(--fg-muted)]">{toman(quote.listPrice)}</s>
                ) : null}
                <span>{toman(quote.salePrice)}</span>
              </dd>
            </div>
            {quote.discountAmount > 0 ? (
              <div className="flex items-baseline justify-between gap-2">
                <dt>{strings.checkout.discountLabel}</dt>
                <dd data-testid="checkout-discount">{toman(quote.discountAmount)}</dd>
              </div>
            ) : null}
            <div className="flex items-baseline justify-between gap-2 border-t border-[var(--border)] pt-2 font-medium">
              <dt>{strings.checkout.payableLabel}</dt>
              <dd className="text-h5" data-testid="checkout-payable">
                {toman(quote.payable)}
              </dd>
            </div>
          </dl>

          <form className="flex flex-col gap-2" onSubmit={apply}>
            <label
              htmlFor="checkout-code"
              className="flex flex-col gap-2 text-subtitle-sm font-medium"
            >
              {strings.checkout.codeLabel}
              <Input
                id="checkout-code"
                data-testid="checkout-code"
                dir="ltr"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                maxLength={32}
                placeholder={strings.checkout.codePlaceholder}
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                disabled={busy}
              />
            </label>
            {codeStatus !== null && codeStatus !== 'none' && codeStatus !== 'already-entitled' ? (
              <p
                role="status"
                data-testid="checkout-code-status"
                data-code-status={codeStatus}
                className={NOTE_CLASS}
              >
                {codeStatus === 'ok' ? null : (
                  <CircleAlert size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
                )}
                {strings.checkout.codeStatus[codeStatus]}
              </p>
            ) : null}
            <Button
              type="submit"
              variant="secondary"
              data-testid="checkout-apply"
              disabled={busy || codeInput.trim() === ''}
            >
              {state.name === 'applying' ? strings.checkout.applying : strings.checkout.apply}
            </Button>
          </form>
        </Card>
      ) : null}

      {state.name === 'redirecting' ? (
        <p className="text-body-sm" role="status">
          {strings.checkout.redirecting}
        </p>
      ) : null}

      {state.name === 'error' ? (
        <div className="flex flex-col gap-3">
          <p role="alert" data-testid="checkout-error" className={NOTE_CLASS}>
            <CircleAlert size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
            {problemText(state.problem)}
          </p>
          <Button
            variant="primary"
            block
            data-testid="checkout-retry"
            onClick={() => dispatch({ type: 'RETRY' })}
          >
            {strings.payment.retry}
          </Button>
        </div>
      ) : null}

      {state.name === 'ready' || state.name === 'requesting' ? (
        <Button
          variant="primary"
          size="lg"
          block
          data-testid="checkout-pay"
          disabled={state.name !== 'ready'}
          onClick={() => dispatch({ type: 'PAY' })}
        >
          {state.name === 'requesting' ? strings.checkout.paying : strings.checkout.pay}
        </Button>
      ) : null}

      {state.name === 'owned' ? (
        <Button variant="primary" size="lg" block onClick={() => void navigate('/')}>
          {strings.checkout.home}
        </Button>
      ) : (
        <Button
          variant={laterIsPrimary ? 'primary' : 'ghost'}
          size={laterIsPrimary ? 'lg' : 'md'}
          block
          data-testid="checkout-later"
          disabled={state.name === 'redirecting'}
          onClick={() => void navigate('/review')}
        >
          {strings.checkout.later}
        </Button>
      )}
    </main>
  );
}
