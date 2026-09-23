import { expect, test } from '@playwright/test';
import { seedProfile } from './helpers.ts';

/**
 * The whole point of the service worker (`what.md` §7.7): the app shell, fonts and the free
 * package are precached at build time, so a device with no connection at all still opens to a
 * working Home screen. This is the one spec that actually cuts the network, the way every other
 * spec in this suite implicitly assumes never happens.
 *
 * `devOptions.enabled: false` (`vite.config.ts`) means there is no service worker under `vite
 * dev`, only under the built app `playwright.config.ts`'s `webServer` serves via `pnpm preview` -
 * so this spec, like the rest of the suite, only ever runs against a real production build.
 */
test('home still renders from the precache with the free package while offline', async ({
  page,
  context,
}) => {
  // First load: creates the database (Dexie's first run) and registers the service worker. A
  // fresh registration installs and activates but does not yet control this already-open page -
  // that only starts on the next navigation (no `clients.claim()`; see `vite.config.ts`'s
  // generated `sw.js`, which calls `skipWaiting` only in response to the update chip's own
  // message, never automatically).
  await page.goto('/');
  await seedProfile(page);

  // `navigator.serviceWorker.ready` resolves once the registration has an *active* worker,
  // regardless of whether it controls this particular page yet - exactly the wait this needs
  // before the reload below can be answered by it.
  await page.evaluate(() => navigator.serviceWorker.ready);

  // This navigation is the first one made after the worker went active, so it is the first one
  // the worker actually controls.
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, {
    timeout: 20_000,
  });

  // Cuts the network at the browser's own network stack - same as DevTools' "offline" toggle.
  // A response the service worker answers from its cache never reaches that layer, so this is
  // the real test of the precache, not a mock.
  await context.setOffline(true);
  try {
    await page.reload();

    const appName = process.env.VITE_APP_NAME || 'کنکور لایتنر';
    await expect(page.getByRole('heading', { name: appName })).toBeVisible();
    await expect(page.getByRole('button', { name: 'شروع مرور' })).toBeVisible();
    // The free package's own word count (150; `content:build`'s `free: 150 words`) shows up in
    // the progress line only if `content/free.json` itself was served from the precache, not
    // just the shell around it.
    await expect(page.getByText('از ۱۵۰ کلمه فتح‌شده')).toBeVisible();
  } finally {
    // However the assertions above turn out, the context must not leak into later tests/specs
    // sharing this worker.
    await context.setOffline(false);
  }
});
