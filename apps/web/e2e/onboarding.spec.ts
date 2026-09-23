import { expect, test } from '@playwright/test';

/**
 * Onboarding end to end (`what.md` §7.8 onboarding row, ticket 02): a fresh device with no
 * profile lands on `/onboarding` rather than Home, walks the slides, picks 10 minutes/day,
 * skips every skippable step, and finishing writes the profile, queues `onboarding_done`, and
 * lands on Home — which a reload confirms by staying there rather than bouncing back.
 */

/** Whether the outbox holds a queued `onboarding_done` beacon — the finish handler's own write,
 *  read back the same honest way `review.spec.ts` reads the flag outbox. */
async function hasOnboardingDoneBeacon(page: import('@playwright/test').Page): Promise<boolean> {
  return page.evaluate(async () => {
    return new Promise<boolean>((resolve, reject) => {
      const open = indexedDB.open('konkur-leitner');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const request = db.transaction('outbox', 'readonly').objectStore('outbox').getAll();
        request.onsuccess = () => {
          const rows = request.result as {
            kind: string;
            payload: { events?: { name: string }[] };
          }[];
          db.close();
          resolve(
            rows.some(
              (row) =>
                row.kind === 'beacon' &&
                (row.payload.events ?? []).some((event) => event.name === 'onboarding_done'),
            ),
          );
        };
        request.onerror = () => reject(request.error);
      };
    });
  });
}

test('a fresh device completes onboarding at 10 minutes/day, skipping the rest, and stays on home after a reload', async ({
  page,
}) => {
  await page.goto('/');

  // No profile yet: redirected off Home onto onboarding.
  await expect(page).toHaveURL(/\/onboarding$/);

  const next = page.getByTestId('onboarding-next');
  const skip = page.getByTestId('onboarding-skip');

  // slide-1 -> slide-2 -> slide-3 -> minutes
  await next.click();
  await next.click();
  await next.click();

  await expect(page.getByRole('heading', { name: 'چقدر وقت برای مطالعه دارید؟' })).toBeVisible();
  await page.getByRole('button', { name: '۱۰ دقیقه' }).click();
  await next.click();

  // exam-date, field and placement are all skippable — skip every one.
  await expect(skip).toBeVisible();
  await skip.click(); // exam-date -> field
  await expect(skip).toBeVisible();
  await skip.click(); // field -> placement
  await expect(skip).toBeVisible();
  await skip.click(); // placement -> install

  await expect(page.getByRole('heading', { name: 'برنامه را نصب کنید' })).toBeVisible();
  await next.click(); // install -> done -> finish() -> home

  // Lands on home.
  const appName = process.env.VITE_APP_NAME || 'کنکور لایتنر';
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: appName })).toBeVisible();
  await expect(page.getByRole('button', { name: 'شروع مرور' })).toBeVisible();
  // `goalFromMinutes(10) = max(50, 10 * 10) = 100` — the profile that was actually written.
  await expect(page.getByText('از ۱۰۰')).toBeVisible();

  expect(await hasOnboardingDoneBeacon(page)).toBe(true);

  // Reload: a returning user (profile now exists) never sees onboarding again.
  await page.reload();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: appName })).toBeVisible();
});

test('«قبلاً حساب داشتم» on the first slide routes to /login', async ({ page }) => {
  await page.goto('/onboarding');

  await page.getByRole('button', { name: 'قبلاً حساب داشتم' }).click();

  await expect(page).toHaveURL(/\/login$/);
});
