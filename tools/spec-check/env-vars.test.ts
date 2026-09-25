import { describe, expect, it } from 'vitest';
import { parseEnvExample, parseWhatEnvVars } from './env-vars.ts';

describe('parseWhatEnvVars', () => {
  it('reads SCREAMING_CASE names and ignores lowercase enum values', () => {
    const section =
      'Server: `SMS_PROVIDER` (`kavenegar`|`console`|`mock`), `SMS_API_KEY`. Build: `VITE_APP_NAME`.';
    expect(parseWhatEnvVars(section)).toEqual(['SMS_PROVIDER', 'SMS_API_KEY', 'VITE_APP_NAME']);
  });
});

describe('parseEnvExample', () => {
  it('reads the name on the left of a NAME= line and ignores comments', () => {
    const content = [
      '# a comment, not a var: FAKE_VAR=1',
      'SMS_PROVIDER=kavenegar',
      'SMS_API_KEY=                      # inline comment',
      '',
      'VITE_APP_NAME=some value',
    ].join('\n');
    expect(parseEnvExample(content)).toEqual(['SMS_PROVIDER', 'SMS_API_KEY', 'VITE_APP_NAME']);
  });
});
