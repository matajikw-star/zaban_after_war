import { describe, expect, it } from 'vitest';
import type { DedupPaper } from './duplicates.ts';
import { chooseKept, sharedStemCount, stemSimilarity } from './duplicates.ts';

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

const q = (no: number, stem: string, options = ['a', 'b', 'c', 'd']) => ({
  no,
  part: 'vocabulary',
  stem,
  options,
  key: 0,
  testedWord: null,
});

const STEMS = [
  'It had not rained on the prairie for several months.',
  'Can you please ..... this last part of the lesson for me?',
  'The world coal oil and gas ..... are finite.',
  'Gerry dissatisfaction with our work was ..... in his expression.',
  'Deserted for six months, the property began to look like a jungle.',
];

describe('sharedStemCount', () => {
  it('counts the questions of one paper that are also in the other', () => {
    const a = { questions: STEMS.map((stem, i) => q(i + 1, stem)) };
    const b = { questions: [q(1, STEMS[0] as string), q(2, 'Something else entirely, nothing alike.')] };
    expect(sharedStemCount(a, b)).toBe(1);
  });

  it('gives the same count whichever paper comes first', () => {
    const a = { questions: STEMS.map((stem, i) => q(i + 1, stem)) };
    const b = { questions: STEMS.slice(0, 4).map((stem, i) => q(i + 1, stem)) };
    expect(sharedStemCount(a, b)).toBe(4);
    expect(sharedStemCount(b, a)).toBe(4);
  });
});

const paper = (paperId: string, overrides: Partial<DedupPaper> = {}): DedupPaper => ({
  paperId,
  year: 1400,
  bookletCount: 1,
  questions: STEMS.map((stem, i) => q(i + 1, stem)),
  ...overrides,
});

describe('chooseKept', () => {
  it('keeps the paper with the most questions', () => {
    const short = paper('arshad-1400-p01', {
      questions: STEMS.slice(0, 4).map((s, i) => q(i + 1, s)),
    });
    const full = paper('arshad-1400-p02');
    expect(chooseKept([short, full]).paperId).toBe('arshad-1400-p02');
  });

  it("on equal questions, keeps the one with fewer uncertain notes, its questions' included", () => {
    const noted = paper('arshad-1400-p01', {
      bookletCount: 40,
      questions: STEMS.map((s, i) => ({ ...q(i + 1, s), uncertain: i === 0 ? ['faint'] : [] })),
    });
    const clean = paper('arshad-1400-p02');
    expect(chooseKept([noted, clean]).paperId).toBe('arshad-1400-p02');
  });

  it('then keeps the one that reached more booklets, then the lowest paper id', () => {
    const small = paper('arshad-1400-p01', { bookletCount: 2 });
    const big = paper('arshad-1400-p05', { bookletCount: 30 });
    const twin = paper('arshad-1400-p03', { bookletCount: 30 });
    expect(chooseKept([small, big, twin]).paperId).toBe('arshad-1400-p03');
  });
});
