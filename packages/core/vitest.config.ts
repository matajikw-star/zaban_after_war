import { defineConfig } from 'vitest/config';

/**
 * Used by `pnpm --filter @kl/core run coverage`. The repo-root config runs the whole suite; this
 * one exists so the coverage report is scoped to the engine, which is the package that has a
 * 100 %-lines bar (`what.md` §16.1). No threshold is configured: coverage informs, it never
 * fails the build.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // types.ts declares no runtime code, so there is nothing in it to execute.
      exclude: ['src/types.ts'],
      reporter: ['text', 'json-summary'],
    },
  },
});
