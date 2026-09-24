import { describe, expect, it } from 'vitest';
// The builder's own implementation — the one that wrote `manifest.paid.hash`. Test-only import:
// it hashes with `node:crypto`, which never reaches the browser bundle.
import {
  canonicalJson as builderCanonicalJson,
  sha256Hex as builderSha256Hex,
} from '../../../../packages/content/src/build/hash.ts';
import { isAppError } from '../errors.ts';
import { canonicalJson, sha256Hex, verifyPaidPackage } from './package-hash.ts';

const ITEMS = [
  {
    rank: 1,
    id: 'perilous',
    lemma: 'perilous',
    senses: [{ translations: ['خطرناک', 'پرمخاطره'], pos: 'adj', ipa: null }],
    exam: { years: [1402, 1399], timesTested: 2 },
    weight: 2.5,
    hint: null,
  },
  { id: 'derive', rank: 2, lemma: 'derive', weight: 1, note: 'quote " and \\ and   and 😀' },
];

function encode(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value, null, 2));
}

async function paid(items: unknown = ITEMS) {
  const hash = builderSha256Hex(builderCanonicalJson(items));
  return { hash, pkg: { packageId: 'paid', version: '2026-09-30.1', hash, items } };
}

describe('canonicalJson', () => {
  it('is byte-identical to the content builder', () => {
    expect(canonicalJson(ITEMS)).toBe(builderCanonicalJson(ITEMS));
  });

  it('ignores key order', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });
});

describe('sha256Hex', () => {
  it('matches the builder on Persian text', async () => {
    const text = canonicalJson(ITEMS);
    expect(await sha256Hex(text)).toBe(builderSha256Hex(text));
  });

  it('matches the known empty-string vector', async () => {
    expect(await sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });
});

describe('verifyPaidPackage', () => {
  it('accepts the package the manifest describes, however it is formatted', async () => {
    const { hash, pkg } = await paid();
    const verified = await verifyPaidPackage(encode(pkg), hash);
    expect(verified.version).toBe('2026-09-30.1');
    expect(verified.items).toHaveLength(2);
  });

  it('refuses a package whose items differ from the hash: HASH_MISMATCH', async () => {
    const { hash, pkg } = await paid();
    const tampered = { ...pkg, items: [ITEMS[0]] };
    const err = await verifyPaidPackage(encode(tampered), hash).catch((e: unknown) => e);
    expect(isAppError(err) && err.code).toBe('HASH_MISMATCH');
  });

  it('refuses bytes cut short: DOWNLOAD_CORRUPT', async () => {
    const { hash, pkg } = await paid();
    const bytes = encode(pkg);
    const err = await verifyPaidPackage(bytes.slice(0, bytes.length - 10), hash).catch(
      (e: unknown) => e,
    );
    expect(isAppError(err) && err.code).toBe('DOWNLOAD_CORRUPT');
  });

  it('refuses a UTF-8 sequence split mid-character: DOWNLOAD_CORRUPT', async () => {
    const bytes = new Uint8Array([0x22, 0xd8]); // `"` then half of an Arabic-block letter
    const err = await verifyPaidPackage(bytes, 'x').catch((e: unknown) => e);
    expect(isAppError(err) && err.code).toBe('DOWNLOAD_CORRUPT');
  });

  it('refuses the free package even with a matching hash', async () => {
    const { hash, pkg } = await paid();
    const err = await verifyPaidPackage(encode({ ...pkg, packageId: 'free' }), hash).catch(
      (e: unknown) => e,
    );
    expect(isAppError(err) && err.code).toBe('DOWNLOAD_CORRUPT');
  });
});
