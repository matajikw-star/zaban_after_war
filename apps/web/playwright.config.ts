import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright's own Chromium build is downloaded from `cdn.playwright.dev`, which answers 403
 * from Iran — the same filtering the product is designed around. CI (GitHub, outside Iran)
 * downloads it normally; a developer here sets `KL_E2E_CHANNEL=msedge` (or `chrome`) and the
 * run uses the browser already installed on the machine. Chromium either way.
 */
const channel = process.env.KL_E2E_CHANNEL;

/** E2E runs against the built app on an Android-sized viewport (what.md §16.2). */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // One worker in CI so the single preview server is not contended (exactOptionalPropertyTypes
  // forbids an explicit `undefined`, so the local default is expressed as 50 %).
  workers: process.env.CI ? 1 : '50%',
  reporter: [['html', { outputFolder: 'playwright-report', open: 'never' }], ['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'android', use: { ...devices['Pixel 7'], ...(channel ? { channel } : {}) } }],
  webServer: {
    command: 'pnpm preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
