import { expect, type Page, test } from '@playwright/test';
import { seedProfile } from './helpers.ts';

/**
 * Login end to end against a real PocketBase (`what.md` §7.8 `/login` row, §16.2; ticket
 * dev-server/02). The second Playwright webServer runs it with SMS_PROVIDER=mock, so the code is
 * always 123456, and `vite preview` proxies /api to it same-origin, as Caddy will.
 *
 * Each run uses its own random phone: a locally reused PocketBase keeps its rate-limit history.
 */

function randomPhone(): string {
  return `0912${String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0')}`;
}

/** `kv.auth` exactly as `stores/auth.ts` wrote it, or null. */
async function storedAuth(
  page: Page,
): Promise<{ userId: string; phone: string; token: string } | null> {
  return page.evaluate(async () => {
    return new Promise<{ userId: string; phone: string; token: string } | null>(
      (resolve, reject) => {
        const open = indexedDB.open('konkur-leitner');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const request = db.transaction('kv', 'readonly').objectStore('kv').get('auth');
          request.onsuccess = () => {
            db.close();
            resolve((request.result?.value as never) ?? null);
          };
          request.onerror = () => reject(request.error);
        };
      },
    );
  });
}

test('logs in with the mock code, lands home, and the token survives a reload', async ({
  page,
}) => {
  const phone = randomPhone();
  const e164 = `+98${phone.slice(1)}`;

  await page.goto('/');
  await seedProfile(page);
  await page.goto('/login');

  await page.getByTestId('login-phone').fill(phone);
  await page.getByTestId('login-send').click();

  const code = page.getByTestId('login-code');
  await expect(code).toBeVisible();
  await code.fill('123456');
  await page.getByTestId('login-verify').click();

  // A device with a profile goes home (machine.ts destinationAfterLogin).
  await expect(page).toHaveURL(/127\.0\.0\.1:4173\/$/);

  const auth = await storedAuth(page);
  expect(auth?.phone).toBe(e164);
  expect(auth?.userId).toMatch(/^[a-z0-9]{15}$/);
  expect(auth?.token.split('.')).toHaveLength(3);

  // The token works against the real server.
  const me = await page.request.get('/api/me', { headers: { Authorization: auth?.token ?? '' } });
  expect(me.status()).toBe(200);
  expect((await me.json()).user.phone).toBe(e164);

  await page.reload();
  expect(await storedAuth(page)).toEqual(auth);

  // Settings reads the store that bootstrap loaded from kv: the account row shows the number.
  await page.goto('/settings');
  await expect(page.getByText(e164)).toBeVisible();
});

test('a wrong code says how many tries are left', async ({ page }) => {
  await page.goto('/');
  await seedProfile(page);
  await page.goto('/login');

  await page.getByTestId('login-phone').fill(randomPhone());
  await page.getByTestId('login-send').click();
  await page.getByTestId('login-code').fill('654321');
  await page.getByTestId('login-verify').click();

  await expect(page.getByTestId('login-error')).toContainText('۴');
  expect(await storedAuth(page)).toBeNull();
});

test('offline, the login screen explains itself instead of crashing', async ({ page, context }) => {
  await page.goto('/');
  await seedProfile(page);
  await page.goto('/login');

  await context.setOffline(true);
  await page.getByTestId('login-phone').fill(randomPhone());
  await page.getByTestId('login-send').click();

  await expect(page.getByTestId('login-error')).toContainText('اینترنت');
  await expect(page.getByTestId('login-retry')).toBeVisible();
  await context.setOffline(false);
});
