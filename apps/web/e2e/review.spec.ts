import { expect, type Page, test } from '@playwright/test';

/**
 * The review loop end to end, against the built app (`what.md` §7.8).
 *
 * Onboarding is still a placeholder, so the profile is written straight into `kv` — the same
 * record `/onboarding` will write, in the same table, so the app cannot tell the difference.
 * Everything after that is the real screen: the real queue, the real event log, the real fold.
 */

interface Profile {
  readonly minutesPerDay: number;
  readonly dailyGoal: number;
  readonly examDate: number | null;
  readonly fieldCode: string | null;
  readonly updatedAt: number;
}

const PROFILE: Profile = {
  minutesPerDay: 20,
  // `goalFromMinutes(20)`. Well above the ten answers below, so the goal sheet stays shut and
  // the loop under test is the loop being asserted on.
  dailyGoal: 200,
  examDate: null,
  fieldCode: null,
  updatedAt: 1_700_000_000_000,
};

async function seedProfile(page: Page, profile: Profile): Promise<void> {
  await page.evaluate(async (value) => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('konkur-leitner');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put({ key: 'profile', value });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, profile);
}

async function countEvents(page: Page): Promise<number> {
  return page.evaluate(async () => {
    return new Promise<number>((resolve, reject) => {
      const open = indexedDB.open('konkur-leitner');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const request = db.transaction('events', 'readonly').objectStore('events').count();
        request.onsuccess = () => {
          const total = request.result;
          db.close();
          resolve(total);
        };
        request.onerror = () => reject(request.error);
      };
    });
  });
}

test('ten reviews are graded, fed back, and still in the log after a reload', async ({ page }) => {
  // The first load is what creates the database; the profile goes in behind it.
  await page.goto('/');
  await seedProfile(page, PROFILE);

  await page.goto('/review');

  const word = page.getByTestId('review-word');
  const reveal = page.getByTestId('review-reveal');
  const back = page.getByTestId('review-back');
  const feedback = page.getByTestId('review-feedback');
  const nextDue = page.getByTestId('review-next-due');

  const seen: string[] = [];

  for (let i = 0; i < 10; i += 1) {
    await expect(word).toBeVisible();
    const lemma = await word.innerText();
    seen.push(lemma);

    await reveal.click();
    await expect(back).toBeVisible();

    // Alternating, so both grading paths run: box 1 → box 2, and box n → box 1.
    await page.getByTestId(i % 2 === 0 ? 'grade-knew' : 'grade-forgot').click();

    await expect(feedback).toBeVisible();
    await expect(nextDue).toContainText('دفعهٔ بعد');
    await expect(feedback).toContainText(i % 2 === 0 ? 'جعبهٔ ۲' : 'جعبهٔ ۱');

    // Tap to move on rather than waiting out the 900 ms — the spec offers both.
    await feedback.click();
  }

  expect(seen).toHaveLength(10);
  // §5.4's suppression window is 8, so at worst the ninth draw may repeat the first.
  expect(new Set(seen).size).toBeGreaterThanOrEqual(8);
  expect(await countEvents(page)).toBe(10);

  await page.reload();
  await page.goto('/review');

  await expect(page.getByTestId('review-word')).toBeVisible();
  // The log survived the reload: the fold the new queue is drawn from is the old one.
  expect(await countEvents(page)).toBe(10);
});

test('«این کلمه اشکال دارد» records a flag in the outbox without a network call', async ({
  page,
}) => {
  await page.goto('/');
  await seedProfile(page, PROFILE);
  await page.goto('/review');

  await expect(page.getByTestId('review-word')).toBeVisible();
  await page.getByTestId('review-overflow').click();
  await page.getByTestId('review-flag').click();
  await page.getByTestId('flag-translation').click();

  await expect(page.getByTestId('review-toast')).toContainText('ثبت شد');

  const flags = await page.evaluate(async () => {
    return new Promise<number>((resolve, reject) => {
      const open = indexedDB.open('konkur-leitner');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const request = db.transaction('outbox', 'readonly').objectStore('outbox').getAll();
        request.onsuccess = () => {
          const rows = request.result as { kind: string }[];
          db.close();
          resolve(rows.filter((row) => row.kind === 'flag').length);
        };
        request.onerror = () => reject(request.error);
      };
    });
  });

  expect(flags).toBe(1);
});
