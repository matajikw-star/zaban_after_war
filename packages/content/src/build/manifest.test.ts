import { describe, expect, it } from 'vitest';
import { buildManifest, nextVersion } from './manifest.ts';

const day1 = new Date('2026-09-18T10:00:00Z');
const day2 = new Date('2026-09-19T10:00:00Z');

describe('nextVersion', () => {
  it('mints "YYYY-MM-DD.1" the first time there is no previous version', () => {
    expect(nextVersion(undefined, 'hash-a', day1)).toBe('2026-09-18.1');
  });

  it('keeps the previous version when the hash has not changed', () => {
    const previous = { version: '2026-09-18.1', hash: 'hash-a' };
    expect(nextVersion(previous, 'hash-a', day2)).toBe('2026-09-18.1');
  });

  it('increments N when the hash changes again the same day', () => {
    const previous = { version: '2026-09-18.1', hash: 'hash-a' };
    expect(nextVersion(previous, 'hash-b', day1)).toBe('2026-09-18.2');
  });

  it('starts a fresh "N=1" when the hash changes on a new day', () => {
    const previous = { version: '2026-09-18.3', hash: 'hash-a' };
    expect(nextVersion(previous, 'hash-b', day2)).toBe('2026-09-19.1');
  });
});

describe('buildManifest', () => {
  it('carries version, hash and bytes through for both packages', () => {
    const manifest = buildManifest(
      { version: '2026-09-18.1', hash: 'free-hash', bytes: 100 },
      { version: '2026-09-18.1', hash: 'paid-hash', bytes: 900 },
    );
    expect(manifest).toEqual({
      free: { version: '2026-09-18.1', hash: 'free-hash', bytes: 100 },
      paid: { version: '2026-09-18.1', hash: 'paid-hash', bytes: 900 },
    });
  });
});
