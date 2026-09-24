import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright's own Chromium build is downloaded from `cdn.playwright.dev`, which answers 403
 * from Iran — the same filtering the product is designed around. CI (GitHub, outside Iran)
 * downloads it normally; a developer here sets `KL_E2E_CHANNEL=msedge` (or `chrome`) and the
 * run uses the browser already installed on the machine. Chromium either way.
 */
const channel = process.env.KL_E2E_CHANNEL;

/**
 * `errors.spec.ts` (ticket dev-server/04) proves `tools/errors` symbolicates a real stack against
 * a real build: the e2e PocketBase needs `SOURCEMAP_DIR` pointing at a copy of the just-built
 * app's `*.map` files, laid out the way a real deploy lays them out — `<dir>/<buildSha>/<file>`
 * (what.md §14.4). `apps/web/dist` only exists once `pnpm build` has run, which every verification
 * order in this repo does before `pnpm e2e`; if it somehow has not, the copy is skipped and that
 * one spec fails with a clear "no source map" rather than every other spec failing to boot.
 *
 * Playwright loads this config once per worker process, so this runs several times over,
 * concurrently, against the same destination — every copy is skip-if-already-there and wrapped
 * in its own try/catch: another worker finishing the same copy a moment earlier, or mid-flight,
 * is success, not a failure, and must not take the whole config load (and every spec with it)
 * down over a Windows file lock.
 */
function buildSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'dev';
  }
}

const e2eSourcemapDir = path.join(tmpdir(), 'kl-e2e-sourcemaps');
const distAssetsDir = fileURLToPath(new URL('./dist/assets', import.meta.url));
if (existsSync(distAssetsDir)) {
  const dest = path.join(e2eSourcemapDir, buildSha());
  try {
    mkdirSync(dest, { recursive: true });
    for (const name of readdirSync(distAssetsDir)) {
      if (!name.endsWith('.map')) continue;
      const from = path.join(distAssetsDir, name);
      const to = path.join(dest, name);
      try {
        if (existsSync(to) && statSync(to).size === statSync(from).size) continue;
        cpSync(from, to);
      } catch {
        // Another worker is writing (or just wrote) this exact file — fine either way.
      }
    }
  } catch {
    // Same race, one level up (the mkdir itself, or a readdir racing a sibling worker).
  }
}

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
    // IPv4 explicitly — see the matching comment in `vite.config.ts`.
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'android', use: { ...devices['Pixel 7'], ...(channel ? { channel } : {}) } }],
  webServer: [
    {
      command: 'pnpm preview',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // A real PocketBase with this repo's hooks and migrations, SMS_PROVIDER=mock (code 123456),
      // on a throwaway pb_data (server/scripts/e2e.mjs). `vite preview` proxies /api to it, so the
      // app talks same-origin exactly as it will behind Caddy (what.md §16.2).
      command: 'pnpm --filter @kl/server pb:e2e',
      url: 'http://127.0.0.1:8091/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: { SOURCEMAP_DIR: e2eSourcemapDir },
    },
  ],
});
