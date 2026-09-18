// Bundle budget: the app shell must stay under 300 KB gzipped (ADR-0005, what.md §16.2).
// Counts every .js and .css Vite emitted into apps/web/dist/assets. Sourcemaps and the
// content packages are excluded: neither is part of the shell a user downloads to start.

import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const LIMIT_BYTES = 300 * 1024;
const root = fileURLToPath(new URL('../../', import.meta.url));
const assetsDir = join(root, 'apps/web/dist/assets');

/** @param {string} p @returns {string} the path with forward slashes, on Windows too. */
const posix = (p) => p.split(sep).join('/');

/** @param {string} dir @returns {Promise<string[]>} */
async function walk(dir) {
  /** @type {string[]} */
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

const files = (await walk(assetsDir))
  .filter((f) => /\.(js|css)$/.test(f))
  .filter((f) => !f.endsWith('.map'))
  .filter((f) => !posix(relative(assetsDir, f)).startsWith('content/'))
  .sort();

if (files.length === 0) {
  console.error(`budget: no assets in ${assetsDir} — run \`pnpm build\` first`);
  process.exit(1);
}

let total = 0;
/** @type {[string, number][]} */
const rows = [];
for (const file of files) {
  const size = gzipSync(await readFile(file), { level: 9 }).byteLength;
  total += size;
  rows.push([posix(relative(assetsDir, file)), size]);
}

/** @param {number} n @returns {string} */
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

for (const [name, size] of rows) console.log(`  ${kb(size).padStart(9)}  ${name}`);
console.log(`  ${'-'.repeat(9)}`);
console.log(`  ${kb(total).padStart(9)}  total gzipped (limit ${kb(LIMIT_BYTES)})`);

if (total > LIMIT_BYTES) {
  console.error(`budget: over by ${kb(total - LIMIT_BYTES)}. See ADR-0005.`);
  process.exit(1);
}
console.log(`budget: ok, ${kb(LIMIT_BYTES - total)} to spare`);
