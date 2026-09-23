import type { WordCard, WordSense } from '@kl/content';
import { DEFAULT_PARAMS } from '@kl/core';
import { describe, expect, it } from 'vitest';
import {
  boxLabel,
  examBadge,
  examBadgeText,
  nextDueText,
  orderedSenses,
  primarySentence,
  sentenceParts,
} from './card-content.ts';

function sense(patch: Partial<WordSense> = {}): WordSense {
  return {
    pos: 'verb',
    ipa: '/test/',
    definition: 'to test',
    translations: ['آزمودن'],
    synonyms: [],
    antonyms: [],
    examples: [],
    ...patch,
  };
}

function card(patch: Partial<WordCard> = {}): WordCard {
  return {
    id: 'abandon',
    lemma: 'abandon',
    rank: 1,
    weight: 3,
    level: 'B1',
    senses: [sense()],
    confusables: [],
    homograph: { suspected: false, note: null },
    hint: null,
    exam: { timesTested: 0, timesAsAnswer: 0, years: [], lastYear: null, stems: [] },
    ...patch,
  };
}

function stem(patch: Partial<WordCard['exam']['stems'][number]> = {}) {
  return {
    paperId: 'arshad-1400-p01',
    year: 1400,
    questionNo: 5,
    stem: 'They had to ..... the ship.',
    options: ['abandon', 'abolish', 'absorb', 'accuse'],
    key: 0,
    isAnswer: true,
    ...patch,
  };
}

describe('primarySentence', () => {
  it('prefers the exam stem the word answered over the authored example', () => {
    const subject = card({
      senses: [sense({ examples: [{ en: 'An authored example.', fa: 'یک مثال.' }] })],
      exam: {
        timesTested: 1,
        timesAsAnswer: 1,
        years: [1400],
        lastYear: 1400,
        stems: [stem()],
      },
    });

    const result = primarySentence(subject);

    expect(result?.source).toBe('exam');
    expect(result?.text).toBe('They had to ..... the ship.');
    expect(result?.year).toBe(1400);
  });

  it('takes the most recent year when several stems have the word as the answer', () => {
    const subject = card({
      exam: {
        timesTested: 3,
        timesAsAnswer: 3,
        years: [1398, 1402, 1400],
        lastYear: 1402,
        stems: [
          stem({ year: 1398, stem: 'oldest .....' }),
          stem({ year: 1402, stem: 'newest .....' }),
          stem({ year: 1400, stem: 'middle .....' }),
        ],
      },
    });

    expect(primarySentence(subject)?.text).toBe('newest .....');
  });

  it('ignores a stem the word only appeared in as a distractor', () => {
    const subject = card({
      senses: [sense({ examples: [{ en: 'An authored example.', fa: 'یک مثال.' }] })],
      exam: {
        timesTested: 1,
        timesAsAnswer: 0,
        years: [1402],
        lastYear: 1402,
        stems: [stem({ isAnswer: false, year: 1402 })],
      },
    });

    const result = primarySentence(subject);

    expect(result?.source).toBe('example');
    expect(result?.text).toBe('An authored example.');
    expect(result?.fa).toBe('یک مثال.');
  });

  it('breaks a same-year tie on paperId then questionNo, so the card never shifts', () => {
    const subject = card({
      exam: {
        timesTested: 2,
        timesAsAnswer: 2,
        years: [1402],
        lastYear: 1402,
        stems: [
          stem({ year: 1402, paperId: 'arshad-1402-p02', questionNo: 1, stem: 'p02 .....' }),
          stem({ year: 1402, paperId: 'arshad-1402-p01', questionNo: 9, stem: 'p01 .....' }),
        ],
      },
    });

    expect(primarySentence(subject)?.text).toBe('p01 .....');
  });

  it('is null when the card has neither an answered stem nor an example', () => {
    expect(primarySentence(card())).toBeNull();
  });

  it('falls through to a later sense when the first has no example', () => {
    const subject = card({
      senses: [
        sense({ examples: [] }),
        sense({ pos: 'noun', examples: [{ en: 'Second sense.', fa: 'دوم.' }] }),
      ],
    });

    expect(primarySentence(subject)?.text).toBe('Second sense.');
  });
});

describe('sentenceParts', () => {
  it('fills the blank with the word', () => {
    expect(sentenceParts('They had to ..... the ship.', 'abandon')).toEqual([
      { kind: 'text', text: 'They had to ' },
      { kind: 'gap', word: 'abandon' },
      { kind: 'text', text: ' the ship.' },
    ]);
  });

  it('fills only the first blank of a two-blank question', () => {
    const parts = sentenceParts('A ..... and a ..... .', 'abandon');
    const gaps = parts.filter((part) => part.kind === 'gap');

    expect(gaps).toEqual([
      { kind: 'gap', word: 'abandon' },
      { kind: 'gap', word: null },
    ]);
  });

  it('leaves a sentence with no blank as one text part', () => {
    expect(sentenceParts('No blank here.', 'abandon')).toEqual([
      { kind: 'text', text: 'No blank here.' },
    ]);
  });

  it('does not treat a two-dot run as a blank', () => {
    expect(sentenceParts('Wait.. really?', 'abandon')).toEqual([
      { kind: 'text', text: 'Wait.. really?' },
    ]);
  });

  it('keeps no empty text part when the sentence opens with a blank', () => {
    expect(sentenceParts('..... is the answer.', 'abandon')).toEqual([
      { kind: 'gap', word: 'abandon' },
      { kind: 'text', text: ' is the answer.' },
    ]);
  });
});

describe('orderedSenses', () => {
  it('keeps package order when every sense is translated', () => {
    const subject = card({
      senses: [sense({ pos: 'verb' }), sense({ pos: 'noun' })],
    });

    expect(orderedSenses(subject).map((s) => s.pos)).toEqual(['verb', 'noun']);
  });

  it('sinks an untranslated sense so the back never leads with an empty one', () => {
    const subject = card({
      senses: [sense({ pos: 'noun', translations: [] }), sense({ pos: 'verb' })],
    });

    expect(orderedSenses(subject).map((s) => s.pos)).toEqual(['verb', 'noun']);
  });
});

describe('examBadge', () => {
  it('is null for a word that was never tested', () => {
    expect(examBadge(card())).toBeNull();
  });

  it('carries the count and the last year', () => {
    const subject = card({
      exam: { timesTested: 2, timesAsAnswer: 1, years: [1399, 1402], lastYear: 1402, stems: [] },
    });

    expect(examBadge(subject)).toEqual({ times: 2, lastYear: 1402 });
    expect(examBadgeText({ times: 2, lastYear: 1402 })).toBe('۲ بار در کنکور، آخرین بار ۱۴۰۲');
  });

  it('prints a year without a thousands separator', () => {
    expect(examBadgeText({ times: 1, lastYear: 1402 })).toContain('۱۴۰۲');
    expect(examBadgeText({ times: 1, lastYear: 1402 })).not.toContain('٬');
  });

  it('drops the year clause when no year is known', () => {
    expect(examBadgeText({ times: 3, lastYear: null })).toBe('۳ بار در کنکور');
  });
});

describe('nextDueText', () => {
  it('reads in minutes for box 1', () => {
    expect(nextDueText(1, DEFAULT_PARAMS)).toBe('دفعهٔ بعد: ۱۰ دقیقه دیگر');
  });

  it('reads in days for the higher boxes', () => {
    expect(nextDueText(2, DEFAULT_PARAMS)).toBe('دفعهٔ بعد: ۱ روز دیگر');
    expect(nextDueText(3, DEFAULT_PARAMS)).toBe('دفعهٔ بعد: ۲ روز دیگر');
    expect(nextDueText(5, DEFAULT_PARAMS)).toBe('دفعهٔ بعد: ۸ روز دیگر');
  });

  it('reads in hours when a tuned interval falls between', () => {
    const params = {
      ...DEFAULT_PARAMS,
      intervalsMs: { ...DEFAULT_PARAMS.intervalsMs, 1: 3 * 60 * 60 * 1000 },
    };

    expect(nextDueText(1, params)).toBe('دفعهٔ بعد: ۳ ساعت دیگر');
  });
});

describe('boxLabel', () => {
  it('names the box in Persian digits', () => {
    expect(boxLabel(2)).toBe('جعبهٔ ۲');
  });

  it('calls a word the fold has never seen «تازه»', () => {
    expect(boxLabel(null)).toBe('تازه');
  });
});
