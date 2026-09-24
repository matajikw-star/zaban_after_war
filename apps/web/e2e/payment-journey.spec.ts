import { readFileSync } from 'node:fs';
import { type BrowserContext, expect, type Page, type Response, test } from '@playwright/test';
import { seedKv, seedProfile } from './helpers.ts';
import { consoleOtp, PAY_SEED, payLogSize } from './pay-server.ts';

/**
 * The purchase journey end to end (ticket dev-payment/01 part B; `what.md` §7.5, §7.6, §7.8,
 * §16.2), in the `payment` project: its own preview (:4174) and PocketBase (:8092) with
 * SMS_PROVIDER=console, the mock Zarinpal gateway and the real paid package in CONTENT_DIR
 * (`e2e/pay-server.ts`, `server/scripts/e2e.mjs`). Nothing is faked in the browser: the OTP is
 * read from PocketBase's stdout, the gateway redirect, the callback, `/api/me`, the paid download
 * (Go's `http.ServeContent`, Range and all) and IndexedDB are the real ones.
 */

/** The built free package (`pnpm content:build`), read the way the app's precache serves it. */
const freeItems = (
  JSON.parse(readFileSync(new URL('../public/content/free.json', import.meta.url), 'utf8')) as {
    items: Array<{ id: string; lemma: string; rank: number }>;
  }
).items
  .slice()
  .sort((a, b) => a.rank - b.rank);
const freeIds = freeItems.map((item) => item.id);
const freeLemmas = new Set(freeItems.map((item) => item.lemma));

/** The word count of the paid package the server serves (`CONTENT_DIR` = server/content). */
const PAID_WORDS = (
  JSON.parse(
    readFileSync(new URL('../../../server/content/paid.json', import.meta.url), 'utf8'),
  ) as { items: unknown[] }
).items.length;

function randomPhone(): string {
  return `0912${String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0')}`;
}

/**
 * The OTP route limits requests per IP (10 an hour, lib/otp.js), keyed on `e.realIP()`, which
 * PocketBase takes from `X-Forwarded-For` because production sits behind Caddy
 * (1758700000_trusted_proxy.js). Here nothing sits in front, so each test plays Caddy and names
 * its own client address — otherwise a `--repeat-each=10` run would be refused at the 11th
 * login. This is the production trust model, not a hook: no app code knows about it.
 */
async function ownClientAddress(context: BrowserContext): Promise<void> {
  const octet = () => Math.floor(Math.random() * 254) + 1;
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `10.${octet()}.${octet()}.${octet()}` });
}

/** `ui/format.ts` `faNumber`: Persian digits, grouped by the Persian thousands separator. */
function faToman(amount: number): string {
  const digits = '۰۱۲۳۴۵۶۷۸۹';
  const grouped = String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
  return `${grouped.replace(/\d/g, (d) => digits[Number(d)] ?? d)} تومان`;
}

/**
 * Every free word but the last is already known (a `know` event three days ago), so the one
 * real card studied before buying is the free package's last word, and the first new word after
 * buying can only come from the paid package (the queue introduces by rank, and the free
 * package is the paid one's first 150 ranks). The paywall counter starts one short of the
 * server's limit (100, `freePresentationLimit`): the paywall is then reached by studying for
 * real, without 99 clicks first.
 */
async function seedNearlyThroughTheFreePackage(page: Page): Promise<void> {
  await seedProfile(page);
  await seedKv(page, 'presentationsBeforePaywall', 99);
  await page.evaluate(
    async (ids) => {
      const at = Date.now() - 3 * 24 * 60 * 60 * 1000;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open('konkur-leitner');
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('events', 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        ids.forEach((itemId, i) => {
          tx.objectStore('events').put({
            id: crypto.randomUUID(),
            itemId,
            at: at + i,
            kind: 'know',
            grade: 1,
            device: 'e2e-device',
            synced: 0,
          });
        });
      });
      db.close();
    },
    freeIds.slice(0, -1),
  );
}

async function logInWithConsoleOtp(page: Page): Promise<string> {
  const phone = randomPhone();
  await page.getByTestId('login-phone').fill(phone);
  const from = payLogSize();
  await page.getByTestId('login-send').click();
  const code = await consoleOtp(phone, from);
  await page.getByTestId('login-code').fill(code);
  await page.getByTestId('login-verify').click();
  return phone;
}

/** Shows one card, grades it «بلد بودم», and returns the lemma it showed. */
async function studyOneCard(page: Page): Promise<string> {
  const word = page.getByTestId('review-word');
  await expect(word).toBeVisible();
  const lemma = await word.innerText();
  await page.getByTestId('review-reveal').click();
  await expect(page.getByTestId('review-back')).toBeVisible();
  await page.getByTestId('grade-knew').click();
  return lemma;
}

/** `kv.downloadReceivedBytes.bytes.length`, or null once the package is installed. */
async function storedDownloadBytes(page: Page): Promise<number | null> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('konkur-leitner');
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const record = await new Promise<{ value?: { bytes?: Uint8Array } } | undefined>(
      (resolve, reject) => {
        const request = db
          .transaction('kv', 'readonly')
          .objectStore('kv')
          .get('downloadReceivedBytes');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      },
    );
    db.close();
    return record?.value?.bytes?.length ?? null;
  });
}

async function paidPackageVersion(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('konkur-leitner');
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const names = Array.from(db.objectStoreNames);
    if (!names.includes('packages')) return null;
    const record = await new Promise<{ version?: string; packageId?: string } | undefined>(
      (resolve, reject) => {
        const request = db.transaction('packages', 'readonly').objectStore('packages').get('paid');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      },
    );
    db.close();
    return record?.version ?? null;
  });
}

test('buy with a 50 % code, download the paid package with a resume, study it offline across a reload', async ({
  page,
  context,
}) => {
  await ownClientAddress(context);
  const paidResponses: Response[] = [];
  page.on('response', (response) => {
    if (new URL(response.url()).pathname === '/api/content/paid') paidResponses.push(response);
  });

  // Fresh install, one card short of the paywall.
  await page.goto('/');
  await seedNearlyThroughTheFreePackage(page);
  await page.goto('/review');

  // The 100th presentation shows the paywall (Review.tsx → countPresentation).
  const lastFree = await studyOneCard(page);
  expect(freeLemmas.has(lastFree)).toBe(true);
  await expect(page).toHaveURL(/\/paywall$/);
  await expect(page.getByTestId('paywall')).toHaveAttribute('data-state', 'ready');
  await expect(page.getByTestId('paywall-price')).toContainText(faToman(PAY_SEED.salePrice));

  // «خرید» while anonymous → login, with the console OTP → back to checkout.
  await page.getByTestId('paywall-buy').click();
  await expect(page).toHaveURL(/\/login\?next=%2Fcheckout$/);
  await logInWithConsoleOtp(page);
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByTestId('checkout')).toHaveAttribute('data-state', 'ready');
  await expect(page.getByTestId('checkout-payable')).toHaveText(faToman(PAY_SEED.salePrice));

  // A 50 % code: the server's arithmetic, shown as given.
  const half = Math.floor(PAY_SEED.salePrice / 2);
  await page.getByTestId('checkout-code').fill('E2EHALF');
  await page.getByTestId('checkout-apply').click();
  await expect(page.getByTestId('checkout-code-status')).toHaveAttribute('data-code-status', 'ok');
  await expect(page.getByTestId('checkout-discount')).toHaveText(faToman(half));
  await expect(page.getByTestId('checkout-payable')).toHaveText(faToman(PAY_SEED.salePrice - half));

  // Slow the page's network so the download can be cut mid-body: 1.39 MB at 128 KB/s is ~11 s,
  // and the first checkpoint to kv lands at 256 KB (§7.5 step 3).
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: 128 * 1024,
    uploadThroughput: -1,
  });

  // «پرداخت» → the mock gateway (our own callback) → 302 → /purchase/result?status=ok.
  await page.getByTestId('checkout-pay').click();
  await expect(page).toHaveURL(/\/purchase\/result\?status=ok&ref=MOCK-\d+&paymentId=\w+/);
  await expect(page.getByTestId('purchase-result')).toHaveAttribute('data-state', 'entitled');
  await expect(page.getByTestId('purchase-entitled')).toBeVisible();

  // Kill the tab mid-body, once a checkpoint is safely in kv (§7.5 step 3: "neither a dropped
  // connection nor a killed tab loses it"). A reload is the kill: the in-flight fetch dies with
  // the document. (`context.setOffline(true)` does not do it — Chromium's offline emulation
  // refuses new requests but lets a body that is already streaming finish; seen on the first
  // run of this spec.)
  const status = page.getByTestId('purchase-download-status');
  await expect(status).toHaveAttribute('data-state', 'downloading');
  await expect.poll(() => storedDownloadBytes(page), { timeout: 20_000 }).toBeGreaterThan(0);
  const kept = await storedDownloadBytes(page);
  await page.reload();
  // Detached, not just un-throttled: a second session's `offline: false` would otherwise keep
  // `navigator.onLine` true after `context.setOffline(true)` below, which is not a real device.
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  await cdp.detach();

  // The fresh document's app-start trigger resumes from the stored bytes.
  await expect(page.getByTestId('purchase-result')).toHaveAttribute('data-state', 'entitled');
  await expect(status).toHaveAttribute('data-state', 'installed', { timeout: 30_000 });
  expect(await storedDownloadBytes(page)).toBeNull();
  expect(await paidPackageVersion(page)).not.toBeNull();

  // What the real server said: a whole-file 200, then — after the kill — one 206 that starts at
  // the byte the client asked for, which is at least the checkpoint seen before the reload (one
  // more may have landed in between) and carries the manifest's hash as its ETag.
  expect(paidResponses.map((r) => r.status())).toEqual([200, 206]);
  const resumed = paidResponses[1];
  const asked = /^bytes=(\d+)-$/.exec(resumed?.request().headers().range ?? '');
  const from = Number(asked?.[1]);
  expect(from).toBeGreaterThanOrEqual(kept ?? 1);
  expect(resumed?.request().headers()['if-range']).toMatch(/^"[0-9a-f]{64}"$/);
  const paidTotal = Number((await resumed?.headerValue('content-length')) ?? 0) + from;
  expect(await resumed?.headerValue('content-range')).toBe(
    `bytes ${from}-${paidTotal - 1}/${paidTotal}`,
  );
  expect(await resumed?.headerValue('etag')).toBe(resumed?.request().headers()['if-range']);

  // Offline for good. The service worker must control the page for a reload to work offline.
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, {
    timeout: 20_000,
  });
  await context.setOffline(true);
  try {
    await page.getByTestId('purchase-start-review').click();
    await expect(page).toHaveURL(/\/review$/);
    const firstPaid = await studyOneCard(page);
    expect(freeLemmas.has(firstPaid), `${firstPaid} should be a paid-only word`).toBe(false);

    await page.reload();
    await page.goto('/');
    await expect(page.getByText(`از ${faCount(PAID_WORDS)} کلمه فتح‌شده`)).toBeVisible();
    await page.goto('/settings');
    await expect(page.getByTestId('settings-entitlement')).toHaveText('نسخهٔ کامل');
    await expect(page.getByTestId('settings-download-status')).toHaveAttribute(
      'data-state',
      'installed',
    );
    await page.goto('/review');
    const secondPaid = await studyOneCard(page);
    expect(freeLemmas.has(secondPaid), `${secondPaid} should be a paid-only word`).toBe(false);
    expect(secondPaid).not.toBe(firstPaid);
  } finally {
    await context.setOffline(false);
  }
});

test('a 100 % code grants without the gateway and downloads the paid package', async ({
  page,
  context,
}) => {
  await ownClientAddress(context);
  const gateway: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/pay/callback') gateway.push(request.url());
  });

  await page.goto('/');
  await seedProfile(page);
  await page.goto('/checkout');
  await expect(page).toHaveURL(/\/login\?next=%2Fcheckout$/);
  await logInWithConsoleOtp(page);
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByTestId('checkout')).toHaveAttribute('data-state', 'ready');

  await page.getByTestId('checkout-code').fill('E2EFREE');
  await page.getByTestId('checkout-apply').click();
  await expect(page.getByTestId('checkout-code-status')).toHaveAttribute('data-code-status', 'ok');
  await expect(page.getByTestId('checkout-payable')).toHaveText(faToman(0));

  await page.getByTestId('checkout-pay').click();
  await expect(page).toHaveURL(/\/purchase\/result\?status=ok&paymentId=\w+$/);
  await expect(page.getByTestId('purchase-result')).toHaveAttribute('data-state', 'entitled');
  await expect(page.getByTestId('purchase-download-status')).toHaveAttribute(
    'data-state',
    'installed',
    { timeout: 30_000 },
  );
  expect(gateway).toEqual([]);

  await page.goto('/settings');
  await expect(page.getByTestId('settings-entitlement')).toHaveText('نسخهٔ کامل');
});

function faCount(n: number): string {
  return faToman(n).replace(' تومان', '');
}
