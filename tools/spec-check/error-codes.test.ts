import { describe, expect, it } from 'vitest';
import { parseServerErrorCodes, parseWhatServerErrorCodes } from './error-codes.ts';

describe('parseWhatServerErrorCodes', () => {
  it('reads the SCREAMING_CASE codes between the anchor and "A few errors carry"', () => {
    const section =
      'answers `{ error: { code, message } }` with a stable `code` — one of `BAD_INPUT`, ' +
      '`UNAUTHORIZED`, and for OTP `PHONE_INVALID`. A few errors carry one extra value: ' +
      '`retryAfter` on every 429.';
    expect(parseWhatServerErrorCodes(section)).toEqual([
      'BAD_INPUT',
      'UNAUTHORIZED',
      'PHONE_INVALID',
    ]);
  });

  it('throws when the anchor text is not found', () => {
    expect(() => parseWhatServerErrorCodes('no code list here')).toThrow();
  });
});

describe('parseServerErrorCodes', () => {
  it('reads the keys of the CODES object, skipping comment lines', () => {
    const content = `
const CODES = {
  BAD_INPUT: 'BAD_INPUT',
  // OTP codes
  PHONE_INVALID: 'PHONE_INVALID',
};
`;
    expect(parseServerErrorCodes(content)).toEqual(['BAD_INPUT', 'PHONE_INVALID']);
  });
});
