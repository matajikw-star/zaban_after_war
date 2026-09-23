import type { Page } from '@playwright/test';

/**
 * Shared e2e setup (`what.md` §7.8 onboarding row): onboarding now guards `/` for a device
 * without a profile (`screens/onboarding/redirect.ts`), so every spec that is not testing
 * onboarding itself needs one before it can reach the screen under test.
 */

export interface Profile {
  readonly minutesPerDay: number;
  readonly dailyGoal: number;
  readonly examDate: number | null;
  readonly fieldCode: string | null;
  readonly updatedAt: number;
}

export const DEFAULT_E2E_PROFILE: Profile = {
  minutesPerDay: 20,
  // `goalFromMinutes(20)`. Well above what a short test session racks up, so the goal sheet
  // stays shut and does not interfere with whatever the spec is actually asserting.
  dailyGoal: 200,
  examDate: null,
  fieldCode: null,
  updatedAt: 1_700_000_000_000,
};

/**
 * Writes `kv.profile` straight into IndexedDB — the same record `/onboarding`'s finish handler
 * writes, in the same table, so the app cannot tell the difference. The database must already
 * exist (one `page.goto` first, so Dexie has created its tables) and the page must be reloaded
 * or re-navigated afterwards for the settings store to pick it up.
 */
export async function seedProfile(
  page: Page,
  profile: Profile = DEFAULT_E2E_PROFILE,
): Promise<void> {
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
