import { expect, type Page, test } from '@playwright/test';
import { seedProfile } from './helpers.ts';

/**
 * Payment while the server's mock-SMS gate is on (`what.md` §8.2, §7.8; ticket dev-payment/01
 * part A). The e2e PocketBase runs `SMS_PROVIDER=mock`, exactly like staging, so every
 * `/api/pay/*` route answers 503 `PAYMENT_DISABLED_MOCK_SMS`. The paywall and checkout must say
 * «پرداخت به‌زودی فعال می‌شود» calmly — no error screen, no purchase button — and «بعداً» must
 * still return to study. The full purchase journey (a gate-free server, the mock gateway) is
 * part B's.
 */

function randomPhone(): string {
  return `0912${String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0')}`;
}

async function logIn(page: Page): Promise<void> {
  await page.getByTestId('login-phone').fill(randomPhone());
  await page.getByTestId('login-send').click();
  await page.getByTestId('login-code').fill('123456');
  await page.getByTestId('login-verify').click();
}

test('anonymous paywall on a gated server: calm message, no buy button, «بعداً» studies', async ({
  page,
}) => {
  await page.goto('/');
  await seedProfile(page);
  await page.goto('/paywall');

  await expect(page.getByTestId('paywall')).toHaveAttribute('data-state', 'disabled');
  await expect(page.getByTestId('payment-soon')).toBeVisible();
  await expect(page.getByTestId('paywall-buy')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);

  await page.getByTestId('paywall-later').click();
  await expect(page).toHaveURL(/\/review$/);
});

test('checkout asks for login first, comes back, and is calm on a gated server', async ({
  page,
}) => {
  await page.goto('/');
  await seedProfile(page);
  await page.goto('/checkout');

  // Login is required before checkout (§7.8), and it returns here afterwards.
  await expect(page).toHaveURL(/\/login\?next=%2Fcheckout$/);
  await logIn(page);
  await expect(page).toHaveURL(/\/checkout$/);

  await expect(page.getByTestId('checkout')).toHaveAttribute('data-state', 'disabled');
  await expect(page.getByTestId('payment-soon')).toBeVisible();
  await expect(page.getByTestId('checkout-pay')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);

  await page.getByTestId('checkout-later').click();
  await expect(page).toHaveURL(/\/review$/);
});

test('settings shows the free version and no download to do', async ({ page }) => {
  await page.goto('/');
  await seedProfile(page);
  await page.goto('/settings');
  await expect(page.getByTestId('settings-download-status')).toHaveAttribute('data-state', 'none');
  await expect(page.getByTestId('settings-buy')).toBeVisible();
});
