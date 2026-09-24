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

/**
 * Writes one `kv` record — the theme choice (`kv.theme`, the value the settings screen writes),
 * a once-only flag, anything keyed. Same contract as `seedProfile`: the database must exist, and
 * the page must navigate afterwards for the stores to read it.
 */
export async function seedKv(page: Page, key: string, value: unknown): Promise<void> {
  await page.evaluate(
    async (record) => {
      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('konkur-leitner');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('kv', 'readwrite');
          tx.objectStore('kv').put(record);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      });
    },
    { key, value },
  );
}

/**
 * Seeds `kv.profile` and ten `ReviewEvent`s straight into IndexedDB (`db/dexie.ts`: the database
 * is `konkur-leitner`, version 1, tables `events`/`outbox`/`packages`/`kv`); the caller then navigates so
 * `main.tsx`'s bootstrap folds them for real. Real word ids from the built `free.json` package
 * (`perilous`, `derive`) so the content-dependent screens have something to show.
 */
export async function seedProgress(page: Page): Promise<void> {
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
