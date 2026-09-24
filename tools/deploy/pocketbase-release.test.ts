import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  binaryChecksumLine,
  checksumFor,
  linuxAssetName,
  releaseUrl,
  sha256Hex,
  verifyZip,
} from './pocketbase-release.ts';

const read = (file: string) =>
  readFileSync(new URL(`../../server/${file}`, import.meta.url), 'utf8');

// An excerpt of the real v0.40.2 checksums.txt.
const CHECKSUMS = [
  '532ab77b20a9eb1705bac17e23544656a461238ac6bfc756f5a17b36118d1adc  pocketbase_0.40.2_darwin_amd64.zip',
  'dd86b424a07f2bb5ac2b8ba8cdf013a37400a9cf56bd1f92e560981f7dd24244  pocketbase_0.40.2_linux_amd64.zip',
  '5746a6ff9bcd88022e44108d61e3f72508d41164915201a7641137683b9416f0  pocketbase_0.40.2_linux_arm64.zip',
].join('\n');

describe('pocketbase release', () => {
  it('names the linux_amd64 asset and its URL from the version', () => {
    expect(linuxAssetName('0.40.2')).toBe('pocketbase_0.40.2_linux_amd64.zip');
    expect(releaseUrl('0.40.2', 'checksums.txt')).toBe(
      'https://github.com/pocketbase/pocketbase/releases/download/v0.40.2/checksums.txt',
    );
  });

  it('finds the asset line in a checksums list, and refuses a list without it', () => {
    expect(checksumFor(CHECKSUMS, 'pocketbase_0.40.2_linux_amd64.zip')).toBe(
      'dd86b424a07f2bb5ac2b8ba8cdf013a37400a9cf56bd1f92e560981f7dd24244',
    );
    expect(() => checksumFor(CHECKSUMS, 'pocketbase_0.40.2_linux_armv7.zip')).toThrow(
      /no sha256 for pocketbase_0.40.2_linux_armv7.zip/,
    );
  });

  it('pins a hash for exactly the version POCKETBASE_VERSION names (bump both together)', () => {
    const version = read('POCKETBASE_VERSION').trim();
    const pinned = checksumFor(read('POCKETBASE_SHA256'), linuxAssetName(version));
    expect(pinned).toMatch(/^[0-9a-f]{64}$/);
  });

  it('accepts a zip only when it matches both checksums.txt and the pin', () => {
    const good = 'a'.repeat(64);
    const bad = 'b'.repeat(64);
    expect(() => verifyZip(good, good, good, 'x.zip')).not.toThrow();
    expect(() => verifyZip(bad, good, good, 'x.zip')).toThrow(/PB_CHECKSUM_MISMATCH/);
    // checksums.txt and the zip can both be swapped at the source; the pin still catches it
    expect(() => verifyZip(bad, bad, good, 'x.zip')).toThrow(/PB_CHECKSUM_MISMATCH/);
    expect(() => verifyZip(good, bad, good, 'x.zip')).toThrow(/PB_CHECKSUM_MISMATCH/);
  });

  it('writes a sha256sum -c line for the extracted binary', () => {
    const hash = sha256Hex(new TextEncoder().encode('abc'));
    expect(hash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(binaryChecksumLine(hash)).toBe(`${hash}  pocketbase\n`);
  });
});
