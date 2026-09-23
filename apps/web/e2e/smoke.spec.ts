import { expect, test } from '@playwright/test';
import { seedProfile } from './helpers.ts';

test('the shell paints right-to-left and names the app', async ({ page }) => {
  // First boot: creates the database and its tables (Dexie runs on the very first load). Then a
  // profile, or a fresh device without one would be redirected to `/onboarding` instead of Home.
  await page.goto('/');
  await seedProfile(page);
  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fa');

  const appName = process.env.VITE_APP_NAME || 'کنکور لایتنر';
  await expect(page.getByRole('heading', { name: appName })).toBeVisible();
});
