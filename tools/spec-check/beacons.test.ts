import { describe, expect, it } from 'vitest';
import { parseClientBeacons, parseServerBeacons, parseWhatBeacons } from './beacons.ts';

describe('parseWhatBeacons', () => {
  it('reads every backtick-quoted name from the prose list', () => {
    const section =
      '`first_open`, `onboarding_done`, `season_shown`. Adding a name changes this file too.';
    expect(parseWhatBeacons(section)).toEqual(['first_open', 'onboarding_done', 'season_shown']);
  });
});

describe('parseClientBeacons', () => {
  it('reads the members of the BeaconName union', () => {
    const content = `
export type BeaconName =
  | 'first_open'
  | 'onboarding_done'
  | 'season_shown';

export interface BeaconEvent {}
`;
    expect(parseClientBeacons(content)).toEqual(['first_open', 'onboarding_done', 'season_shown']);
  });

  it('throws when the union is not found', () => {
    expect(() => parseClientBeacons('export const x = 1;')).toThrow();
  });
});

describe('parseServerBeacons', () => {
  it('reads the entries of the BEACON_NAMES array', () => {
    const content = `
const BEACON_NAMES = [
  'first_open',
  'onboarding_done',
  'season_shown',
];
`;
    expect(parseServerBeacons(content)).toEqual(['first_open', 'onboarding_done', 'season_shown']);
  });
});
