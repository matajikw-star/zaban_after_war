import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * The payment-enabled e2e server (ticket dev-payment/01 part B; `what.md` §16.2). The rest of the
 * suite keeps the gated server (`SMS_PROVIDER=mock`, :8091 behind preview :4173); the purchase
 * journey needs a server where payment is on, so `playwright.config.ts` starts a second
 * PocketBase (`server/scripts/e2e.mjs` with `KL_E2E_PAYMENT=1`) behind a second preview, and runs
 * `payment-journey.spec.ts` alone in the `payment` project against it. Test-only: nothing here
 * is imported by the app.
 */

export const PAY_APP_ORIGIN = 'http://127.0.0.1:4174';
export const PAY_PB_HOST = '127.0.0.1:8092';

/** Where the script copies PocketBase's stdout; truncated at every server start. */
export const PAY_PB_LOG = path.join(tmpdir(), 'kl-e2e-pay-pocketbase.log');

/**
 * Written by the script through the superuser API before it reports ready. Prices are toman
 * (§8.3); the spec's arithmetic reads them from here, so the two cannot drift.
 */
export const PAY_SEED = {
  listPrice: 450_000,
  salePrice: 290_000,
  codes: [
    { code: 'E2EHALF', type: 'percent', value: 50 },
    { code: 'E2EFREE', type: 'percent', value: 100 },
  ],
} as const;

/**
 * The console SMS provider prints `sms.console phone=+98…1234 code=12345` (lib/sms.js; the
 * phone masked to its last four digits). `from` is the log's length before the code was
 * requested, so only a line printed after that answers — two tests whose phones share the last
 * four digits cannot read each other's code unless they ask within the same moment.
 */
export function payLogSize(): number {
  try {
    return readFileSync(PAY_PB_LOG).length;
  } catch {
    return 0;
  }
}

export async function consoleOtp(phone: string, from: number): Promise<string> {
  const lastFour = phone.slice(-4);
  const pattern = new RegExp(`sms\\.console phone=\\+98…${lastFour} code=(\\d+)`, 'g');
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const text = readFileSync(PAY_PB_LOG).subarray(from).toString('utf8');
    const last = [...text.matchAll(pattern)].at(-1);
    if (last?.[1]) return last[1];
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`no console OTP for …${lastFour} in ${PAY_PB_LOG}`);
}
