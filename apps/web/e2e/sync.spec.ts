import { type Browser, devices, expect, type Page, test } from '@playwright/test';
import { seedProfile } from './helpers.ts';

/**
 * Backup and restore end to end (`what.md` §7.4, §9.3; ticket dev-server/03), against the real
 * PocketBase the second Playwright webServer runs with SMS_PROVIDER=mock (code 123456).
 *
 * Study ten cards on one device, log in, let the backup run, then open a brand-new browser
 * context — a fresh device, its own IndexedDB — log in with the same phone, and find the same ten
 * reviews folded into the same boxes.
 */

function randomPhone(): string {
  return `0912${String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0')}`;
}

function readIdb<T>(page: Page, store: 'events' | 'kv', op: 'count' | string): Promise<T> {
  return page.evaluate(
    async ({ store, op }) =>
      new Promise<T>((resolve, reject) => {
        const open = indexedDB.open('konkur-leitner');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const objects = db.transaction(store, 'readonly').objectStore(store);
          const request = op === 'count' ? objects.count() : objects.get(op);
          request.onsuccess = () => {
            db.close();
            const result = request.result as { value?: unknown } | number | undefined;
            resolve((op === 'count' ? result : (result as { value?: unknown })?.value) as T);
          };
          request.onerror = () => reject(request.error);
        };
      }),
    { store, op },
  );
}

const eventCount = (page: Page) => readIdb<number>(page, 'events', 'count');

async function unsyncedCount(page: Page): Promise<number> {
  return page.evaluate(
    async () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('konkur-leitner');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const request = db
            .transaction('events', 'readonly')
            .objectStore('events')
            .index('synced')
            .count(IDBKeyRange.only(0));
          request.onsuccess = () => {
            db.close();
            resolve(request.result);
          };
          request.onerror = () => reject(request.error);
        };
      }),
  );
}

async function studyTen(page: Page): Promise<void> {
  const reveal = page.getByTestId('review-reveal');
  const feedback = page.getByTestId('review-feedback');
  for (let i = 0; i < 10; i += 1) {
    await expect(page.getByTestId('review-word')).toBeVisible();
    await reveal.click();
    await page.getByTestId(i % 2 === 0 ? 'grade-knew' : 'grade-forgot').click();
    await expect(feedback).toBeVisible();
    await feedback.click();
  }
}

async function login(page: Page, phone: string): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('login-phone').fill(phone);
  await page.getByTestId('login-send').click();
  const code = page.getByTestId('login-code');
  await expect(code).toBeVisible();
  await code.fill('123456');
  await page.getByTestId('login-verify').click();
  await expect(page).toHaveURL(/127\.0\.0\.1:4173\/$/);
}

async function boxCounts(page: Page): Promise<string[]> {
  await page.goto('/boxes');
  const counts: string[] = [];
  for (const box of [1, 2, 3, 4, 5]) {
    counts.push(await page.getByTestId(`box-count-${box}`).innerText());
  }
  return counts;
}

async function freshDevice(browser: Browser) {
  // Its own context: its own IndexedDB, service worker and storage — a second phone.
  const context = await browser.newContext({ ...devices['Pixel 7'] });
  return { context, page: await context.newPage() };
}

test('ten reviews backed up on one device come back on a fresh one', async ({ page, browser }) => {
  const phone = randomPhone();

  // --- device A: study anonymously, then log in ---------------------------------------------
  await page.goto('/');
  await seedProfile(page);
  await page.goto('/review');
  await studyTen(page);
  expect(await eventCount(page)).toBe(10);
  expect(await unsyncedCount(page)).toBe(10);

  const before = await boxCounts(page);
  expect(before.some((count) => count !== '۰')).toBe(true);

  await login(page, phone);

  // The login merge fires the backup; every event ends up synced, and the server has all ten.
  await expect.poll(() => unsyncedCount(page), { timeout: 15_000 }).toBe(0);
  const auth = await readIdb<{ token: string }>(page, 'kv', 'auth');
  const pulled = await page.request.get('/api/sync/pull', {
    headers: { Authorization: auth.token },
  });
  expect(pulled.status()).toBe(200);
  const body = (await pulled.json()) as { events: unknown[]; more: boolean };
  expect(body.events).toHaveLength(10);
  expect(body.more).toBe(false);

  // Settings reports the backup quietly, with a time.
  await page.goto('/settings');
  await expect(page.getByTestId('backup-last')).toContainText('آخرین پشتیبان‌گیری');
  // A manual backup with nothing new sends nothing twice: the server still holds ten.
  await page.getByTestId('backup-now').click();
  await expect(page.getByTestId('backup-status')).toContainText('به‌روز');
  const again = await page.request.get('/api/sync/pull', {
    headers: { Authorization: auth.token },
  });
  expect(((await again.json()) as { events: unknown[] }).events).toHaveLength(10);

  // --- device B: nothing local, log in with the same phone -----------------------------------
  const b = await freshDevice(browser);
  try {
    await b.page.goto('/');
    // A fresh device has no profile: it lands on onboarding, whose «قبلاً حساب داشتم» is /login.
    await expect(b.page).toHaveURL(/\/onboarding$/);
    expect(await eventCount(b.page)).toBe(0);

    await login(b.page, phone);

    // Restore: the pull brings the ten back, and the fold puts them in the same boxes.
    await expect.poll(() => eventCount(b.page), { timeout: 15_000 }).toBe(10);
    expect(await unsyncedCount(b.page)).toBe(0);
    expect(await boxCounts(b.page)).toEqual(before);

    // And it survives a reload: the restored events are in IndexedDB, not only in memory.
    await b.page.reload();
    expect(await boxCounts(b.page)).toEqual(before);
  } finally {
    await b.context.close();
  }
});
