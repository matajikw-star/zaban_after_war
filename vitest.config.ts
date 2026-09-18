import { defineConfig } from 'vitest/config';

/**
 * The root suite is a set of projects rather than one include glob, because the engine and the
 * app need different environments: `packages/*` is pure TypeScript and runs in `node`, while
 * `apps/web` needs a DOM and an IndexedDB (see `apps/web/vitest.config.ts`).
 *
 * `pnpm test` at the root therefore runs both. The Playwright suite under `apps/web/e2e` is not
 * part of this and is run by `pnpm e2e`.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'packages',
          root: './packages',
          include: ['*/src/**/*.test.ts'],
          exclude: ['**/node_modules/**', '**/dist/**'],
          environment: 'node',
        },
      },
      './apps/web/vitest.config.ts',
    ],
  },
});
