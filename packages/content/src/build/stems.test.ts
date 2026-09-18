import { describe, expect, it } from 'vitest';
import type { ExamFile, LexiconEntry } from './raw.ts';
import { joinStems, normalizeBlank } from './stems.ts';

describe('normalizeBlank', () => {
  it('leaves a dot blank alone', () => {
    expect(normalizeBlank('The cat sat on the ..... .')).toBe('The cat sat on the ..... .');
  });

  it('normalizes a run of hyphens to five dots', () => {
    expect(normalizeBlank('It happened ---------- last year.')).toBe(
      'It happened ..... last year.',
    );
  });

  it('normalizes hyphen runs of any length', () => {
    expect(normalizeBlank('a --- b ----------------- c')).toBe('a ..... b ..... c');
  });
});

const exam: ExamFile = {
  paperId: 'p01',
  year: 1400,
  questions: [
    {
      no: 1,
      part: 'vocabulary',
      stem: 'The scientist ..... the discovery to luck.',
      options: ['attributed', 'distributed'],
      key: 0,
      testedWord: 'attribute',
    },
    {
      no: 2,
      part: 'vocabulary',
      stem: 'It happened ---------- last year.',
      options: ['suddenly', 'rarely'],
      key: 0,
      testedWord: 'suddenly',
    },
  ],
};
const examsById = new Map([[exam.paperId, exam]]);

function entryWithOccurrences(occurrences: LexiconEntry['occurrences']): LexiconEntry {
  return {
    id: 'x',
    lemma: 'x',
    level: 'B1',
    senses: [],
    confusables: [],
    homograph: { suspected: false, note: null },
    occurrences,
    stats: {
      byYear: {},
      answersByYear: {},
      distinctYears: 0,
      firstYear: null,
      lastYear: null,
      priority: 0,
      timesAsAnswer: 0,
      timesAsContext: 0,
      timesAsDistractor: 0,
      timesTested: 0,
    },
    status: 'draft',
  };
}

describe('joinStems', () => {
  it('joins a tested occurrence to its question, normalizing the blank', () => {
    const entry = entryWithOccurrences([
      {
        occurrenceType: 'tested',
        paperId: 'p01',
        part: 'vocabulary',
        questionNo: 2,
        optionIndex: 0,
        isAnswer: true,
        reach: 1,
        surface: 'suddenly',
        year: 1400,
      },
    ]);

    expect(joinStems(entry, examsById)).toEqual([
      {
        paperId: 'p01',
        year: 1400,
        questionNo: 2,
        stem: 'It happened ..... last year.',
        options: ['suddenly', 'rarely'],
        key: 0,
        isAnswer: true,
      },
    ]);
  });

  it('skips context occurrences', () => {
    const entry = entryWithOccurrences([
      {
        occurrenceType: 'context',
        paperId: 'p01',
        part: 'vocabulary',
        questionNo: 1,
        reach: 1,
        surface: 'x',
        year: 1400,
      },
    ]);
    expect(joinStems(entry, examsById)).toEqual([]);
  });

  it('preserves occurrence order', () => {
    const entry = entryWithOccurrences([
      {
        occurrenceType: 'tested',
        paperId: 'p01',
        part: 'vocabulary',
        questionNo: 2,
        optionIndex: 0,
        isAnswer: true,
        reach: 1,
        surface: 'suddenly',
        year: 1400,
      },
      {
        occurrenceType: 'tested',
        paperId: 'p01',
        part: 'vocabulary',
        questionNo: 1,
        optionIndex: 0,
        isAnswer: true,
        reach: 1,
        surface: 'attribute',
        year: 1400,
      },
    ]);
    expect(joinStems(entry, examsById).map((s) => s.questionNo)).toEqual([2, 1]);
  });

  it('throws when an occurrence points to an unknown paper', () => {
    const entry = entryWithOccurrences([
      {
        occurrenceType: 'tested',
        paperId: 'missing',
        part: 'vocabulary',
        questionNo: 1,
        optionIndex: 0,
        isAnswer: true,
        reach: 1,
        surface: 'x',
        year: 1400,
      },
    ]);
    expect(() => joinStems(entry, examsById)).toThrow(/unknown paper/);
  });

  it('throws when an occurrence points to an unknown question', () => {
    const entry = entryWithOccurrences([
      {
        occurrenceType: 'tested',
        paperId: 'p01',
        part: 'vocabulary',
        questionNo: 99,
        optionIndex: 0,
        isAnswer: true,
        reach: 1,
        surface: 'x',
        year: 1400,
      },
    ]);
    expect(() => joinStems(entry, examsById)).toThrow(/unknown question/);
  });
});
