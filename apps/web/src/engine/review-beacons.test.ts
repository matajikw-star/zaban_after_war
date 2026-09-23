import { describe, expect, it } from 'vitest';
import { beaconsCrossed, REVIEW_BEACON_THRESHOLDS } from './review-beacons.ts';

describe('beaconsCrossed', () => {
  it('fires first_review on the very first answer', () => {
    expect(beaconsCrossed(0, 1)).toEqual(['first_review']);
  });

  it('fires nothing for an ordinary answer in between', () => {
    expect(beaconsCrossed(4, 5)).toEqual([]);
  });

  it('fires reviews_10 and reviews_100 on the answers that reach them', () => {
    expect(beaconsCrossed(9, 10)).toEqual(['reviews_10']);
    expect(beaconsCrossed(99, 100)).toEqual(['reviews_100']);
  });

  it('fires each threshold exactly once across a hundred answers', () => {
    const fired: string[] = [];
    for (let i = 0; i < 120; i += 1) fired.push(...beaconsCrossed(i, i + 1));

    expect(fired).toEqual(['first_review', 'reviews_10', 'reviews_100']);
  });

  it('fires every threshold a restored backup jumped over', () => {
    expect(beaconsCrossed(0, 400)).toEqual(['first_review', 'reviews_10', 'reviews_100']);
  });

  it('fires nothing when the total did not move', () => {
    expect(beaconsCrossed(50, 50)).toEqual([]);
    expect(beaconsCrossed(50, 3)).toEqual([]);
  });

  it('keeps the §8.4 names, which the server allow-lists', () => {
    expect(REVIEW_BEACON_THRESHOLDS.map((t) => t.name)).toEqual([
      'first_review',
      'reviews_10',
      'reviews_100',
    ]);
  });
});
