import { describe, expect, it } from 'vitest';
import type { DedupPaper } from './duplicates.ts';
import {
  chooseKept,
  duplicatePaperFindings,
  MAX_SHARED_STEMS,
  retiredOccurrenceFindings,
  sharedStemCount,
  stemSimilarity,
} from './duplicates.ts';

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
    const b = {
      questions: [q(1, STEMS[0] as string), q(2, 'Something else entirely, nothing alike.')],
    };
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

/** Four distinct stems, then one: two papers built from `FOUR` share 4 stems. */
const FOUR = STEMS.slice(0, 4);
const OTHER = [
  'The committee will ..... the proposal before the vote next week.',
  'Her ..... remarks offended nearly everyone at the dinner table.',
  'Scientists have long ..... the origins of the universe with telescopes.',
  'The treaty was ..... by both governments after years of negotiation.',
];
const built = (stems: readonly string[]) => stems.map((s, i) => q(i + 1, s));

describe('duplicatePaperFindings — check 15, two live papers of a year sharing stems', () => {
  it('fails when two live papers of one year share more than MAX_SHARED_STEMS stems', () => {
    const findings = duplicatePaperFindings([
      paper('arshad-1400-p01', { questions: built(FOUR), bookletCount: 40 }),
      paper('arshad-1400-p02', { questions: built(FOUR) }),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: 'blocking', check: '15' });
    expect(findings[0]?.message).toContain('share 4 of 4 stems');
    // It says what the kept-paper rule would do, so the fix is mechanical.
    expect(findings[0]?.message).toContain('keep arshad-1400-p01');
    expect(findings[0]?.message).toContain('"duplicateOf": "arshad-1400-p01"');
  });

  it('names one kept paper for a whole group, whichever pair a finding is about', () => {
    const findings = duplicatePaperFindings([
      paper('arshad-1400-p01', { questions: built(FOUR) }),
      paper('arshad-1400-p02', { questions: built(FOUR) }),
      paper('arshad-1400-p03', { questions: built(FOUR), bookletCount: 9 }),
    ]);
    expect(findings).toHaveLength(3);
    for (const finding of findings) {
      expect(finding.message).toContain('keep arshad-1400-p03');
      expect(finding.message).toContain('give arshad-1400-p01, arshad-1400-p02');
    }
  });

  it(`passes at MAX_SHARED_STEMS (${MAX_SHARED_STEMS}) shared stems`, () => {
    const findings = duplicatePaperFindings([
      paper('arshad-1400-p01', { questions: built(FOUR) }),
      paper('arshad-1400-p02', { questions: built([...FOUR.slice(0, 3), ...OTHER]) }),
    ]);
    expect(findings).toEqual([]);
  });

  it('never compares papers of different years — a question reused next year is real', () => {
    const findings = duplicatePaperFindings([
      paper('arshad-1399-p01', { year: 1399, questions: built(FOUR) }),
      paper('arshad-1400-p01', { questions: built(FOUR) }),
    ]);
    expect(findings).toEqual([]);
  });

  it('accepts a retired paper and the paper it duplicates', () => {
    const findings = duplicatePaperFindings([
      paper('arshad-1400-p01', { questions: built(FOUR) }),
      paper('arshad-1400-p02', {
        questions: built(FOUR),
        duplicateOf: 'arshad-1400-p01',
        duplicateReason: '4/4 stems match',
      }),
    ]);
    expect(findings).toEqual([]);
  });
});

describe('duplicatePaperFindings — check 16, a duplicateOf claim must hold', () => {
  const retired = (overrides: Partial<DedupPaper>) =>
    paper('arshad-1400-p02', {
      questions: built(FOUR),
      duplicateOf: 'arshad-1400-p01',
      duplicateReason: '4/4 stems match',
      ...overrides,
    });
  const kept = paper('arshad-1400-p01', { questions: built(FOUR) });
  const check16 = (papers: DedupPaper[]) =>
    duplicatePaperFindings(papers).filter((f) => f.check === '16');

  it('fails when duplicateOf names no paper', () => {
    const findings = check16([kept, retired({ duplicateOf: 'arshad-1400-p09' })]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('blocking');
  });

  it('fails when duplicateOf names a paper that is itself retired', () => {
    const middle = retired({ duplicateOf: 'arshad-1400-p01' });
    const last = paper('arshad-1400-p03', {
      questions: built(FOUR),
      duplicateOf: 'arshad-1400-p02',
      duplicateReason: '4/4 stems match',
    });
    const findings = check16([kept, middle, last]);
    expect(findings.map((f) => f.file)).toEqual(['content/exams/arshad-1400-p03.json']);
  });

  it('fails when duplicateOf names a paper of another year, or the paper itself', () => {
    const otherYear = paper('arshad-1399-p01', { year: 1399, questions: built(FOUR) });
    expect(check16([otherYear, retired({ duplicateOf: 'arshad-1399-p01' })])).toHaveLength(1);
    expect(check16([kept, retired({ duplicateOf: 'arshad-1400-p02' })])).toHaveLength(1);
  });

  it('fails when the reason is missing', () => {
    expect(check16([kept, retired({ duplicateReason: '' })])).toHaveLength(1);
  });

  it('fails when the two papers do not actually share stems', () => {
    expect(check16([kept, retired({ questions: built(OTHER) })])).toHaveLength(1);
  });
});

describe('retiredOccurrenceFindings — check 18, nothing counts a retired paper', () => {
  const papers = [
    paper('arshad-1400-p01', { questions: built(FOUR) }),
    paper('arshad-1400-p02', {
      questions: built(FOUR),
      duplicateOf: 'arshad-1400-p01',
      duplicateReason: '4/4 stems match',
    }),
  ];
  const entry = (id: string, paperId: string) => ({
    id,
    occurrences: [{ occurrenceType: 'tested', paperId, questionNo: 1 }],
  });

  it('blocks a shipping word with an occurrence on a retired paper — its card would overcount', () => {
    const findings = retiredOccurrenceFindings(
      [entry('arid', 'arshad-1400-p02'), entry('rigid', 'arshad-1400-p01')],
      papers,
      new Set(['arid', 'rigid']),
    );
    expect(findings).toEqual([
      {
        severity: 'blocking',
        check: '18',
        file: 'content/lexicon/arid.json',
        message: expect.stringContaining('arshad-1400-p02#1'),
      },
    ]);
  });

  it('only warns for a word that does not ship', () => {
    const findings = retiredOccurrenceFindings(
      [entry('bibliographic', 'arshad-1400-p02')],
      papers,
      new Set(),
    );
    expect(findings.map((f) => f.severity)).toEqual(['warning']);
  });
});

describe('duplicatePaperFindings — check 17, a retired question that disagrees with its kept one', () => {
  it('warns when a retired question reads its options differently from the kept paper', () => {
    const kept = paper('arshad-1400-p01', { questions: built(FOUR) });
    const misread = built(FOUR).map((question) =>
      question.no === 2 ? { ...question, options: ['a', 'b', 'c', 'bibliographics'] } : question,
    );
    const findings = duplicatePaperFindings([
      kept,
      paper('arshad-1400-p02', {
        questions: misread,
        duplicateOf: 'arshad-1400-p01',
        duplicateReason: '4/4 stems match',
      }),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: 'warning', check: '17' });
    expect(findings[0]?.message).toContain('question 2');
  });

  it('ignores case and spacing in the options', () => {
    const kept = paper('arshad-1400-p01', { questions: built(FOUR) });
    const shouted = built(FOUR).map((question) => ({
      ...question,
      options: ['A', ' b', 'C', 'd'],
    }));
    const findings = duplicatePaperFindings([
      kept,
      paper('arshad-1400-p02', {
        questions: shouted,
        duplicateOf: 'arshad-1400-p01',
        duplicateReason: '4/4 stems match',
      }),
    ]);
    expect(findings).toEqual([]);
  });
});
