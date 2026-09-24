import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import { seedKv, seedProgress } from './helpers.ts';

/**
 * The design pass's record (ticket dev-web/06, `what.md` §7.9): every screen of §7.8 that is
 * reachable offline without paying, at 360 and 430 px, in the light and the dark theme, written to
 * `e2e/__screenshots__/<screen>-<width>-<theme>.png`.
 *
 * A recording tool, not an assertion. It is skipped unless `KL_SCREENSHOTS=1`, because a PNG
 * rendered on one OS never matches one rendered on another (fonts, hinting), so CI would only
 * ever produce noise. Run it locally after a visual change and look at the images:
 *
 *   pnpm build && KL_E2E_CHANNEL=msedge KL_SCREENSHOTS=1 pnpm e2e design-screens
 *
 * The theme is forced the way the app forces it: `kv.theme` is the value the settings screen
 * writes, and the root layout turns it into `data-theme` on `<html>`. The emulated colour scheme
 * is set to match, so `prefers-color-scheme` agrees with the override rather than fighting it.
 * Shots are taken at a device scale of 1 to keep the committed images small.
 */

const RECORDING = process.env.KL_SCREENSHOTS === '1';
const OUT_DIR = fileURLToPath(new URL('./__screenshots__/', import.meta.url));

const WIDTHS = [
  { width: 360, height: 780 },
  { width: 430, height: 932 },
] as const;
const THEMES = ['light', 'dark'] as const;

type Theme = (typeof THEMES)[number];

/** Creates the database (first load), writes the theme, and optionally the seeded progress. */
async function boot(page: Page, theme: Theme, withProgress: boolean): Promise<void> {
  await page.goto('/');
  await seedKv(page, 'theme', theme);
  if (withProgress) await seedProgress(page);
}

for (const size of WIDTHS) {
  for (const theme of THEMES) {
    test.describe(`screens at ${size.width}px, ${theme}`, () => {
      test.skip(!RECORDING, 'recording tool — set KL_SCREENSHOTS=1 to write the PNGs');
      test.use({
        viewport: size,
        deviceScaleFactor: 1,
        colorScheme: theme,
        reducedMotion: 'reduce',
      });

      async function shoot(page: Page, screen: string): Promise<void> {
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await page.evaluate(() => document.fonts.ready);
        mkdirSync(OUT_DIR, { recursive: true });
        await page.screenshot({
          path: `${OUT_DIR}${screen}-${size.width}-${theme}.png`,
          fullPage: true,
        });
      }

      test('onboarding, every step', async ({ page }) => {
        await boot(page, theme, false);
        await page.goto('/onboarding');
        const next = page.getByTestId('onboarding-next');
        const skip = page.getByTestId('onboarding-skip');

        await shoot(page, 'onboarding-1-slide1');
        await next.click();
        await shoot(page, 'onboarding-2-slide2');
        await next.click();
        await shoot(page, 'onboarding-3-slide3');
        await next.click();
        await shoot(page, 'onboarding-4-minutes');
        await next.click();
        await shoot(page, 'onboarding-5-exam-date');
        await skip.click();
        await shoot(page, 'onboarding-6-field');
        await skip.click();
        await expect(page.getByTestId('placement-word')).toBeVisible();
        await shoot(page, 'onboarding-7-placement');
        await skip.click();
        await shoot(page, 'onboarding-8-install');
      });

      test('the review loop: front, back opened, feedback, summary', async ({ page }) => {
        // A fake clock that runs at real speed until paused — pausing it is what holds the
        // 900 ms feedback on screen long enough to photograph.
        await page.clock.install();
        await boot(page, theme, true);
        await page.goto('/review');

        await expect(page.getByTestId('review-word')).toBeVisible();
        await shoot(page, 'review-1-front');

        await page.getByTestId('review-reveal').click();
        await expect(page.getByTestId('review-back')).toBeVisible();
        await page
          .getByTestId('review-back')
          .getByRole('button', { name: 'بیشتر', exact: true })
          .click();
        await page
          .getByTestId('review-back')
          .getByRole('button', { name: 'راهنمای یادگیری' })
          .click();
        await shoot(page, 'review-2-back-open');

        await page.clock.pauseAt(new Date(Date.now() + 2_000));
        await page.getByTestId('grade-knew').click();
        await expect(page.getByTestId('review-feedback')).toBeVisible();
        await shoot(page, 'review-3-feedback');
        await page.clock.resume();

        await page.getByTestId('review-feedback').click();
        await expect(page.getByTestId('review-word')).toBeVisible();
        await page.getByTestId('review-overflow').click();
        await page.getByTestId('review-flag').click();
        await expect(page.getByTestId('flag-translation')).toBeVisible();
        await shoot(page, 'review-4-flag-sheet');
        await page.keyboard.press('Escape');

        await page.getByTestId('review-end').click();
        await expect(page).toHaveURL(/\/session\/summary$/);
        await shoot(page, 'session-summary');
      });

      test('the offline screens with progress', async ({ page }) => {
        await boot(page, theme, true);

        await page.goto('/');
        await expect(page.getByRole('button', { name: 'شروع مرور' })).toBeVisible();
        await shoot(page, 'home');

        await page.goto('/boxes');
        // Open the first box that holds a word, so the inline list is in the picture.
        for (const box of [1, 2, 3, 4, 5]) {
          const count = page.getByTestId(`box-count-${box}`);
          if ((await count.innerText()).trim() !== '۰') {
            await count.click();
            break;
          }
        }
        await shoot(page, 'boxes');

        await page.goto('/word/perilous');
        await expect(page.getByRole('heading', { name: 'perilous' })).toBeVisible();
        await shoot(page, 'word-detail');

        await page.goto('/progress');
        await shoot(page, 'progress');

        await page.goto('/settings');
        await shoot(page, 'settings');

        await page.goto('/season');
        await shoot(page, 'season');

        await page.goto('/paywall');
        await shoot(page, 'paywall');

        await page.goto('/login');
        await shoot(page, 'login-phone');

        await page.goto('/no-such-page');
        await shoot(page, 'not-found');
      });
    });
  }
}
