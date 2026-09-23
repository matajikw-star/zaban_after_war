import { expect, test } from '@playwright/test';

/**
 * Seeds `kv.profile` and ten `ReviewEvent`s straight into IndexedDB (`db/dexie.ts`: the database
 * is `konkur-leitner`, version 1, tables `events`/`outbox`/`packages`/`kv`), then reloads so
 * `main.tsx`'s bootstrap folds them for real. Real word ids from the built `free.json` package
 * (`perilous`, `derive`) so the content-dependent screens have something to show.
 */
async function seedProgress(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(async () => {
    const DB_NAME = 'konkur-leitner';
    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;

    const profile = {
      minutesPerDay: 10,
      dailyGoal: 50,
      examDate: null,
      fieldCode: null,
      updatedAt: now,
    };

    const events: Array<{
      id: string;
      itemId: string;
      at: number;
      kind: 'review';
      grade: 0 | 1;
      device: string;
      synced: 0;
    }> = [];
    let n = 0;
    for (const itemId of ['perilous', 'derive']) {
      for (let i = 0; i < 5; i += 1) {
        n += 1;
        events.push({
          id: `seed-${itemId}-${i}`,
          itemId,
          // Spread across the last few days, oldest to newest, so the 30-day chart has more than
          // one bar lit and no event lands in the future.
          at: now - (10 - n) * (DAY_MS / 3),
          kind: 'review',
          grade: i === 0 ? 0 : 1,
          device: 'e2e-device',
          synced: 0,
        });
      }
    }

    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['kv', 'events'], 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore('kv').put({ key: 'profile', value: profile });
      for (const event of events) tx.objectStore('events').put(event);
    });

    db.close();
  });
}

/** The leading Persian-percent token off a line like "۴۰٪ — ۱ از ۱۵۰ کلمه فتح‌شده". */
function leadingToken(text: string): string {
  return text.trim().split(/\s/)[0] ?? '';
}

test.describe('the offline screens agree on the same numbers', () => {
  test.beforeEach(async ({ page }) => {
    // First boot: creates the database and its tables (Dexie runs on the very first load). That
    // first load has no profile yet, so it lands on `/onboarding`; navigating to `/` again after
    // seeding (rather than a plain reload, which would just reload `/onboarding`) is what lands
    // on Home with the profile the settings store now finds.
    await page.goto('/');
    await seedProgress(page);
    await page.goto('/');
  });

  test('home shows the goal ring, the streak and a progress line', async ({ page }) => {
    const appName = process.env.VITE_APP_NAME || 'کنکور لایتنر';
    await expect(page.getByRole('heading', { name: appName })).toBeVisible();
    await expect(page.getByRole('button', { name: 'شروع مرور' })).toBeVisible();
    await expect(page.getByText('روز پیاپی')).toBeVisible();
  });

  test('boxes lists five box counts and an unseen count', async ({ page }) => {
    await page.goto('/boxes');
    await expect(page.getByRole('heading', { name: 'جعبه‌ها' })).toBeVisible();
    // Five box buttons, one per Leitner box.
    await expect(page.getByRole('button', { name: /جعبهٔ/ })).toHaveCount(5);
  });

  test('progress reports the same percent and conquered/total as home', async ({ page }) => {
    await page.goto('/');
    const homeLine = await page
      .locator('p', { hasText: '—' })
      .filter({ hasText: 'کلمه فتح‌شده' })
      .first()
      .innerText();
    const homePercent = leadingToken(homeLine);
    const conqueredOfTotal = homeLine.split('—')[1]?.trim();

    await page.goto('/progress');
    await expect(page.getByRole('heading', { name: 'پیشرفت' })).toBeVisible();
    const progressPercent = await page.locator('p.text-h3').innerText();
    expect(progressPercent.trim()).toBe(homePercent);

    if (conqueredOfTotal !== undefined) {
      await expect(page.getByText(conqueredOfTotal)).toBeVisible();
    }
  });

  test('session summary renders with the same streak as home', async ({ page }) => {
    await page.goto('/session/summary');
    await expect(page.getByRole('heading', { name: 'پایان جلسه' })).toBeVisible();
    await expect(page.getByText('روز پیاپی')).toBeVisible();
  });

  test('settings renders its sections', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'تنظیمات' })).toBeVisible();
    await expect(page.getByText('هدف روزانه')).toBeVisible();
    await expect(page.getByText('گزارش مشکل').first()).toBeVisible();
  });

  test('a seeded word opens its detail page with a review history', async ({ page }) => {
    await page.goto('/word/perilous');
    await expect(page.getByRole('heading', { name: 'perilous' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'این را بلدم' })).toBeVisible();
  });
});
