import { defineConfig } from 'vitest/config';
import pkg from './package.json' with { type: 'json' };

/**
 * The app's unit tests. Unlike `packages/core`, this code talks to IndexedDB, the DOM and
 * `fetch`, so it needs a browser-shaped environment: `happy-dom` supplies the DOM and
 * `fake-indexeddb` the database (see `docs/spec/how-why.md` §5 for why those two).
 *
 * The Playwright suite under `e2e/` is a different thing entirely and is excluded here; it runs
 * against the built app through `pnpm e2e`.
 */
export default defineConfig({
  // `version.ts` reads two constants that `vite.config.ts` injects at build time; a test run is
  // not a build, so they are supplied here too. The sha is a literal: nothing under test asserts
  // on it, and shelling out to git for every `vitest` run would be a cost for no reader.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_SHA__: JSON.stringify('test'),
  },
  test: {
    name: 'web',
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
    environment: 'happy-dom',
    setupFiles: ['./vitest.setup.ts'],
  },
});
