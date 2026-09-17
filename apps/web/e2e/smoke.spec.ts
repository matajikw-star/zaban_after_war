import { expect, test } from '@playwright/test';

test('the shell paints right-to-left and names the app', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fa');

  const appName = process.env.VITE_APP_NAME || 'کنکور لایتنر';
  await expect(page.getByRole('heading', { name: appName })).toBeVisible();
});
