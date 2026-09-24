/**
 * The paywall's one request, turned into a `PaywallEvent`. Never throws.
 *
 * `pay/quote` is asked first, even by an anonymous device, because it is what carries the
 * mock-SMS gate (§8.2): the gate answers 503 before auth, so the answer says whether payment is
 * open at all. A logged-in device gets its prices from the same answer; an anonymous one gets a
 * 401 and reads the prices from `/api/config`, which is public and never gated.
 */

import { AppError } from '../../errors.ts';
import type { AppConfig, PayQuoteResponse } from '../../net/api.ts';
import type { PaywallEvent } from './machine.ts';

export interface PaywallDeps {
  readonly quote: () => Promise<PayQuoteResponse>;
  readonly config: () => Promise<AppConfig>;
  readonly reportError: (err: unknown, phase: string) => void;
}

function codeOf(err: unknown): string {
  return err instanceof AppError ? err.code : 'UNKNOWN';
}

/** A failure to event: the named ones are expected; the rest are a bug worth a record. */
function failed(deps: PaywallDeps, err: unknown, phase: string): PaywallEvent {
  switch (codeOf(err)) {
    case 'SERVER_PAYMENT_DISABLED_MOCK_SMS':
      return { type: 'DISABLED' };
    case 'NETWORK':
      return { type: 'OFFLINE' };
    default:
      deps.reportError(err, phase);
      return { type: 'FAILED' };
  }
}

export async function loadPaywall(deps: PaywallDeps): Promise<PaywallEvent> {
  try {
    const quote = await deps.quote();
    if (quote.codeStatus === 'already-entitled') return { type: 'OWNED' };
    return { type: 'LOADED', prices: { listPrice: quote.listPrice, salePrice: quote.salePrice } };
  } catch (err) {
    if (codeOf(err) !== 'UNAUTHORIZED') return failed(deps, err, 'paywall.quote');
  }
  try {
    const config = await deps.config();
    return { type: 'LOADED', prices: { listPrice: config.listPrice, salePrice: config.salePrice } };
  } catch (err) {
    return failed(deps, err, 'paywall.config');
  }
}
