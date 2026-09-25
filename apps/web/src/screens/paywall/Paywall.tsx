/**
 * `/paywall` (`what.md` §7.8): the pace argument, what is included, the price with its
 * strike-through, «خرید» → `/login` if anonymous → `/checkout`. «بعداً» returns to study and
 * always works — offline, on staging, whatever the server said — because the early pool keeps the
 * app usable forever.
 *
 * `machine.ts` holds the state, `flow.ts` the one request. On staging the server's mock-SMS gate
 * answers every pay route with 503, and this screen says «پرداخت به‌زودی فعال می‌شود» calmly.
 */

import { Check, CircleAlert } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { reportError } from '../../log/errors.ts';
import { appConfig, payQuote } from '../../net/api.ts';
import { useAuthStore } from '../../stores/auth.ts';
import { strings } from '../../strings.ts';
import { Button } from '../../ui/Button.tsx';
import { Card, CardBody, CardTitle } from '../../ui/Card.tsx';
import { faNumber } from '../../ui/format.ts';
import { loginPathFor } from '../login/machine.ts';
import { loadPaywall, type PaywallDeps } from './flow.ts';
import { PAYWALL_START, type PaywallEvent, type PaywallState, transition } from './machine.ts';

const deps: PaywallDeps = {
  quote: () => payQuote(),
  config: appConfig,
  reportError: (err, phase) => void reportError('payment', err, { phase }),
};

/** Said in words and an icon, never in red (§7.9). */
const NOTE_CLASS = 'flex items-start gap-2 text-body-sm font-medium text-[var(--fg)]';

export function Paywall() {
  const navigate = useNavigate();
  const userId = useAuthStore((s) => s.userId);
  const owned = useAuthStore((s) => s.entitlement.status === 'full');
  const [state, setState] = useState<PaywallState>(owned ? { name: 'owned' } : PAYWALL_START);
  const effectFor = useRef<PaywallState | null>(null);

  const dispatch = useCallback((event: PaywallEvent): void => {
    setState((current) => transition(current, event));
  }, []);

  useEffect(() => {
    if (effectFor.current === state) return;
    effectFor.current = state;
    if (state.name === 'loading') void loadPaywall(deps).then(dispatch);
  }, [state, dispatch]);

  function buy(): void {
    void navigate(userId === null ? loginPathFor('/checkout') : '/checkout');
  }

  const laterIsPrimary = state.name !== 'ready';

  return (
    <main className="flex flex-1 flex-col gap-4 pt-2" data-state={state.name} data-testid="paywall">
      <h1 className="flex min-h-11 items-center text-h5 font-medium">{strings.screens.paywall}</h1>

      <Card className="flex flex-col gap-3">
        <CardBody>{strings.paywall.pace}</CardBody>
        <CardTitle>{strings.paywall.includedTitle}</CardTitle>
        <ul className="flex flex-col gap-2">
          {strings.paywall.included.map((line) => (
            <li key={line} className="flex items-start gap-2 text-body-sm">
              <Check size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
              {line}
            </li>
          ))}
        </ul>
      </Card>

      <Card className="flex flex-col gap-3" aria-live="polite">
        {state.name === 'loading' ? (
          <p className="text-body-sm text-[var(--fg-muted)]">{strings.paywall.loading}</p>
        ) : null}

        {state.name === 'ready' ? (
          <div className="flex flex-col gap-1" data-testid="paywall-price">
            {state.prices.listPrice > state.prices.salePrice ? (
              <p className="text-body-sm text-[var(--fg-muted)]">
                <span className="sr-only">{strings.paywall.listPriceLabel} </span>
                <s>{strings.payment.toman(faNumber(state.prices.listPrice))}</s>
              </p>
            ) : null}
            <p className="text-h4 font-medium">
              {strings.payment.toman(faNumber(state.prices.salePrice))}
            </p>
          </div>
        ) : null}

        {state.name === 'disabled' ? (
          <p role="status" data-testid="payment-soon" className="text-body font-medium">
            {strings.payment.soon}
          </p>
        ) : null}

        {state.name === 'owned' ? (
          <p role="status" className="text-body font-medium">
            {strings.paywall.owned}
          </p>
        ) : null}

        {state.name === 'offline' || state.name === 'failed' ? (
          <div className="flex flex-col gap-3">
            <p role="status" className={NOTE_CLASS}>
              <CircleAlert size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
              {state.name === 'offline' ? strings.paywall.offline : strings.paywall.failed}
            </p>
            <Button
              variant="secondary"
              data-testid="paywall-retry"
              onClick={() => dispatch({ type: 'RETRY' })}
            >
              {strings.payment.retry}
            </Button>
          </div>
        ) : null}
      </Card>

      {state.name === 'ready' ? (
        <Button variant="primary" size="lg" block onClick={buy} data-testid="paywall-buy">
          {strings.paywall.buy}
        </Button>
      ) : null}
      <Button
        variant={laterIsPrimary ? 'primary' : 'ghost'}
        size={laterIsPrimary ? 'lg' : 'md'}
        block
        onClick={() => void navigate('/review')}
        data-testid="paywall-later"
      >
        {strings.paywall.later}
      </Button>
    </main>
  );
}
