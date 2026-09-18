#!/usr/bin/env node
// Builds free.json and paid.json plus the manifest from content/ (what.md §6.2).
// The transforms live in packages/content/src/build/; this is only the fs paths + real clock.

import { fileURLToPath } from 'node:url';
// `tools/` is not a pnpm workspace member (no node_modules of its own), so this reaches the
// package by relative path rather than the `@kl/content` specifier `apps/web` and `server/`
// would use.
import { buildPackages } from '../../packages/content/src/index.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));

const result = await buildPackages({
  contentDir: `${root}content`,
  configDir: `${root}packages/content`,
  outDir: {
    free: `${root}apps/web/public/content/free.json`,
    paid: `${root}server/content/paid.json`,
    manifest: `${root}server/content/manifest.json`,
  },
  now: new Date(),
});

console.log(`shipping ${result.shippingWords} of ${result.totalWords} words`);
console.log(
  `free:  ${result.freeCount} words, version ${result.free.version}, ${result.free.bytes} bytes${result.free.changed ? '' : ' (unchanged)'}`,
);
console.log(
  `paid:  ${result.paidCount} words, version ${result.paid.version}, ${result.paid.bytes} bytes${result.paid.changed ? '' : ' (unchanged)'}`,
);
if (result.ranksAdded > 0) {
  console.log(`ranks: ${result.ranksAdded} new id(s) appended to packages/content/ranks.json`);
}
