import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit tests only. The Playwright suite under apps/web/e2e is run by `pnpm e2e`.
    include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
    environment: 'node',
  },
});
