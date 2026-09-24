import { describe, expect, it } from 'vitest';
import { AppError } from '../../errors.ts';
import type { AppConfig, PayQuoteResponse } from '../../net/api.ts';
import { loadPaywall, type PaywallDeps } from './flow.ts';
import { PAYWALL_START, type PaywallEvent, type PaywallState, transition } from './machine.ts';

const QUOTE: PayQuoteResponse = {
  listPrice: 490_000,
  salePrice: 290_000,
  discountAmount: 0,
  payable: 290_000,
  codeStatus: 'none',
  code: null,
};

const CONFIG: AppConfig = {
  listPrice: 490_000,
  salePrice: 290_000,
  freePresentationLimit: 100,
  minAppVersion: '0.0.0',
  supportUrl: '',
  notice: null,
};

function deps(quote: () => Promise<PayQuoteResponse>, config = async () => CONFIG) {
  const reports: string[] = [];
  const d: PaywallDeps = { quote, config, reportError: (_err, phase) => reports.push(phase) };
  return { d, reports };
}

const gate = new AppError('SERVER_PAYMENT_DISABLED_MOCK_SMS', 'gated', { status: 503 });

describe('loadPaywall', () => {
  it('logged in: prices from the quote', async () => {
    const { d } = deps(async () => QUOTE);
    await expect(loadPaywall(d)).resolves.toEqual({
      type: 'LOADED',
      prices: { listPrice: 490_000, salePrice: 290_000 },
    });
  });

  it('anonymous: the 401 falls through to /api/config', async () => {
    let configAsked = 0;
    const { d, reports } = deps(
      () => Promise.reject(new AppError('UNAUTHORIZED', 'no token', { status: 401 })),
      async () => {
        configAsked += 1;
        return CONFIG;
      },
    );
    await expect(loadPaywall(d)).resolves.toMatchObject({ type: 'LOADED' });
    expect(configAsked).toBe(1);
    expect(reports).toEqual([]);
  });

  it('staging (the mock-SMS gate): DISABLED, quietly, and /api/config is not asked', async () => {
    let configAsked = 0;
    const { d, reports } = deps(
      () => Promise.reject(gate),
      async () => {
        configAsked += 1;
        return CONFIG;
      },
    );
    await expect(loadPaywall(d)).resolves.toEqual({ type: 'DISABLED' });
    expect(configAsked).toBe(0);
    expect(reports).toEqual([]);
  });

  it('offline: OFFLINE, never a report', async () => {
    const { d, reports } = deps(() => Promise.reject(new AppError('NETWORK', 'offline')));
    await expect(loadPaywall(d)).resolves.toEqual({ type: 'OFFLINE' });
    expect(reports).toEqual([]);
  });

  it('already entitled: OWNED', async () => {
    const { d } = deps(async () => ({ ...QUOTE, codeStatus: 'already-entitled' }));
    await expect(loadPaywall(d)).resolves.toEqual({ type: 'OWNED' });
  });

  it('anything unnamed: FAILED and one report', async () => {
    const { d, reports } = deps(() => Promise.reject(new AppError('SERVER_INTERNAL', 'x')));
    await expect(loadPaywall(d)).resolves.toEqual({ type: 'FAILED' });
    expect(reports).toEqual(['paywall.quote']);

    const anon = deps(
      () => Promise.reject(new AppError('UNAUTHORIZED', 'x')),
      () => Promise.reject(new TypeError('boom')),
    );
    await expect(loadPaywall(anon.d)).resolves.toEqual({ type: 'FAILED' });
    expect(anon.reports).toEqual(['paywall.config']);
  });
});

describe('paywall transition', () => {
  const PRICES = { listPrice: 2, salePrice: 1 };
  const EVENTS: PaywallEvent[] = [
    { type: 'LOADED', prices: PRICES },
    { type: 'DISABLED' },
    { type: 'OFFLINE' },
    { type: 'FAILED' },
    { type: 'OWNED' },
    { type: 'RETRY' },
  ];
  const STATES: PaywallState[] = [
    PAYWALL_START,
    { name: 'ready', prices: PRICES },
    { name: 'disabled' },
    { name: 'offline' },
    { name: 'failed' },
    { name: 'owned' },
  ];

  it('loading goes where the answer says', () => {
    expect(EVENTS.map((e) => transition(PAYWALL_START, e).name)).toEqual([
      'ready',
      'disabled',
      'offline',
      'failed',
      'owned',
      'loading',
    ]);
  });

  it('only offline and failed retry; ready, disabled and owned are final', () => {
    for (const state of STATES.slice(1)) {
      for (const event of EVENTS) {
        const next = transition(state, event);
        const retries =
          event.type === 'RETRY' && (state.name === 'offline' || state.name === 'failed');
        expect(next).toEqual(retries ? PAYWALL_START : state);
      }
    }
  });
});
