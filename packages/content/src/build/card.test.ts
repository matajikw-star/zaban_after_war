import { describe, expect, it } from 'vitest';
import { buildWordCard, isShippable } from './card.ts';
import type { ExamFile, LexiconEntry } from './raw.ts';

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
  ],
};
const examsById = new Map([[exam.paperId, exam]]);

function baseEntry(overrides: Partial<LexiconEntry> = {}): LexiconEntry {
  return {
    id: 'attribute',
    lemma: 'attribute',
    level: 'B2',
    senses: [
      {
        pos: 'v',
        ipa: '/əˈtrɪbjuːt/',
        definition: 'to say something is caused by something else',
        translations: ['نسبت دادن'],
        synonyms: ['ascribe'],
        antonyms: [],
        examples: [{ en: 'Scientists attribute the rise to warming.', fa: '...' }],
        testedIn: [{ paperId: 'p01', questionNo: 1 }],
      },
    ],
    confusables: [{ word: 'contribute', note: 'شباهت ظاهری' }],
    homograph: { suspected: true, note: 'stress differs' },
    occurrences: [
      {
        occurrenceType: 'tested',
        paperId: 'p01',
        part: 'vocabulary',
        questionNo: 1,
        optionIndex: 0,
        isAnswer: true,
        reach: 1,
        surface: 'attributed',
        year: 1400,
      },
    ],
    stats: {
      byYear: { '1400': 1 },
      answersByYear: { '1400': 1 },
      distinctYears: 1,
      firstYear: 1400,
      lastYear: 1400,
      priority: 10,
      timesAsAnswer: 1,
      timesAsContext: 0,
      timesAsDistractor: 0,
      timesTested: 1,
    },
    status: 'draft',
    ...overrides,
  };
}

describe('isShippable', () => {
  it('ships a word with senses that is not excluded', () => {
    expect(isShippable(baseEntry(), new Set())).toBe(true);
  });

  it('never ships a word with empty senses', () => {
    expect(isShippable(baseEntry({ senses: [] }), new Set())).toBe(false);
  });

  it('never ships an excluded id, even with senses', () => {
    expect(isShippable(baseEntry(), new Set(['attribute']))).toBe(false);
  });
});

describe('buildWordCard', () => {
  it('builds the WordCard shape, weight = timesTested, hint carried through as given', () => {
    const card = buildWordCard(baseEntry(), 7, examsById, null);
    expect(card).toEqual({
      id: 'attribute',
      lemma: 'attribute',
      rank: 7,
      weight: 1,
      level: 'B2',
      senses: [
        {
          pos: 'v',
          ipa: '/əˈtrɪbjuːt/',
          definition: 'to say something is caused by something else',
          translations: ['نسبت دادن'],
          synonyms: ['ascribe'],
          antonyms: [],
          examples: [{ en: 'Scientists attribute the rise to warming.', fa: '...' }],
        },
      ],
      confusables: [{ word: 'contribute', note: 'شباهت ظاهری' }],
      homograph: { suspected: true, note: 'stress differs' },
      hint: null,
      exam: {
        timesTested: 1,
        timesAsAnswer: 1,
        years: [1400],
        lastYear: 1400,
        stems: [
          {
            paperId: 'p01',
            year: 1400,
            questionNo: 1,
            stem: 'The scientist ..... the discovery to luck.',
            options: ['attributed', 'distributed'],
            key: 0,
            isAnswer: true,
          },
        ],
      },
    });
  });

  it('carries the hint through when given one', () => {
    const hint = { template: 'طنز' as const, association: 'x', sentence: 'y' };
    const card = buildWordCard(baseEntry(), 1, examsById, hint);
    expect(card.hint).toEqual(hint);
  });

  it('gives a context-only word an empty years array and null lastYear', () => {
    const entry = baseEntry({
      occurrences: [
        {
          occurrenceType: 'context',
          paperId: 'p01',
          part: 'vocabulary',
          questionNo: 1,
          reach: 1,
          surface: 'attribute',
          year: 1400,
        },
      ],
      stats: {
        byYear: {},
        answersByYear: {},
        distinctYears: 0,
        firstYear: null,
        lastYear: null,
        priority: 0,
        timesAsAnswer: 0,
        timesAsContext: 1,
        timesAsDistractor: 0,
        timesTested: 0,
      },
    });
    const card = buildWordCard(entry, 1, examsById, null);
    expect(card.weight).toBe(0);
    expect(card.exam.years).toEqual([]);
    expect(card.exam.lastYear).toBeNull();
    expect(card.exam.stems).toEqual([]);
  });

  it('throws when a shippable entry has no level', () => {
    const entry = baseEntry({ level: null });
    expect(() => buildWordCard(entry, 1, examsById, null)).toThrow(/no level/);
  });
});
