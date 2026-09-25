import { describe, expect, it } from 'vitest';
import { stemSimilarity } from './duplicates.ts';

describe('stemSimilarity', () => {
  it('scores one question transcribed twice as identical, whatever the blank and the case', () => {
    expect(
      stemSimilarity(
        'The plan is to our ..... advantage; we will all benefit.',
        'the plan is to our ____ advantage, we will all benefit',
      ),
    ).toBe(1);
  });

  it('scores two different questions low', () => {
    expect(
      stemSimilarity(
        'It had not rained on the prairie for several months.',
        'Can you please ..... this last part of the lesson for me?',
      ),
    ).toBeLessThan(0.2);
  });

  it('is the share of distinct words the two stems have in common', () => {
    // {a, b, c} vs {a, b, d}: 2 shared of 4 distinct.
    expect(stemSimilarity('a b c', 'a b d')).toBe(0.5);
  });
});
