/**
 * Verifying a downloaded paid package (`what.md` §6.1, §7.5): the bytes must parse as a
 * `ContentPackage` and the sha256 of the canonical JSON of its `items` must equal the manifest's
 * `paid.hash`. Only then may it replace anything on the device.
 *
 * `canonicalJson` is the browser twin of `packages/content/src/build/hash.ts` — the same
 * recursive key sort and whitespace-free `JSON.stringify` — which cannot be imported here because
 * it hashes with `node:crypto`. `package-hash.test.ts` checks the two agree byte for byte, so the
 * builder and the client can never drift apart silently.
 */

import type { ContentPackage } from '@kl/content';
import { AppError } from '../errors.ts';

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      sorted[key] = sortKeysDeep(source[key]);
    }
    return sorted;
  }
  return value;
}

/** Recursively sorts object keys, then `JSON.stringify`s with no whitespace. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

/** sha256 hex of a UTF-8 string, through WebCrypto (a secure context: https or 127.0.0.1). */
export async function sha256Hex(input: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle === undefined) {
    throw new AppError('DOWNLOAD_NO_CRYPTO', 'WebCrypto is unavailable in this context');
  }
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(input));
  let hex = '';
  for (const byte of new Uint8Array(digest)) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

/**
 * Bytes → a verified paid package, or an `AppError`:
 *
 * - `DOWNLOAD_CORRUPT` — not UTF-8, not JSON, or not shaped like a paid package.
 * - `HASH_MISMATCH` — well-formed, but not the package the manifest describes.
 */
export async function verifyPaidPackage(
  bytes: Uint8Array,
  expectedHash: string,
): Promise<ContentPackage> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (err) {
    throw new AppError('DOWNLOAD_CORRUPT', 'the paid package is not valid UTF-8 JSON', {
      bytes: bytes.length,
      cause: String(err),
    });
  }

  const pkg = parsed as Partial<ContentPackage> | null;
  if (
    pkg === null ||
    typeof pkg !== 'object' ||
    pkg.packageId !== 'paid' ||
    typeof pkg.version !== 'string' ||
    !Array.isArray(pkg.items)
  ) {
    throw new AppError('DOWNLOAD_CORRUPT', 'the paid package is not shaped like one', {
      bytes: bytes.length,
    });
  }

  const actual = await sha256Hex(canonicalJson(pkg.items));
  if (actual !== expectedHash) {
    throw new AppError('HASH_MISMATCH', 'the paid package does not match the manifest hash', {
      expected: expectedHash,
      actual,
      bytes: bytes.length,
    });
  }
  // The hash we checked, not the file's claim: the installed record's hash is what the next "up to
  // date" check compares with the manifest, so a wrong `hash` field would redownload every launch.
  return { ...(pkg as ContentPackage), hash: actual };
}
