import { describe, expect, it } from 'vitest';
import { canonicalJson, sha256Hex } from './hash.ts';

describe('canonicalJson', () => {
  it('sorts object keys recursively', () => {
    const a = { b: 1, a: { d: 2, c: 3 } };
    const b = { a: { c: 3, d: 2 }, b: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(canonicalJson(a)).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it('keeps array order — arrays are data, not a bag of keys', () => {
    expect(canonicalJson([{ b: 1, a: 2 }, { c: 3 }])).toBe('[{"a":2,"b":1},{"c":3}]');
  });

  it('produces no whitespace', () => {
    expect(canonicalJson({ a: 1, b: [1, 2] })).not.toMatch(/\s/);
  });
});

describe('sha256Hex', () => {
  it('is deterministic', () => {
    expect(sha256Hex('hello')).toBe(sha256Hex('hello'));
  });

  it('matches a known sha256 vector', () => {
    // echo -n "" | sha256sum
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('changes when the canonical JSON changes', () => {
    const h1 = sha256Hex(canonicalJson({ a: 1 }));
    const h2 = sha256Hex(canonicalJson({ a: 2 }));
    expect(h1).not.toBe(h2);
  });
});
