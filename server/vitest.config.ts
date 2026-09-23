import { defineConfig } from 'vitest/config';

/**
 * The API suite (what.md §16.3). Run with `pnpm test:server`, never by the root `pnpm test` —
 * the root suite must stay runnable without the PocketBase binary.
 *
 * Each test file starts its own PocketBase against its own empty temp pb_data, so the files run
 * in sequence: several binaries at once on one laptop is slower than running them in a row, and
 * a shared `_logs` table would make the log assertions flaky.
 */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    // Downloading the binary on a cold machine happens inside the first beforeAll.
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
