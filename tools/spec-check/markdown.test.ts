import { describe, expect, it } from 'vitest';
import { backtickTokens, extractSection, findTable, parseMarkdownTables } from './markdown.ts';

describe('extractSection', () => {
  const md = [
    '## 1. First',
    '',
    'first body',
    '',
    '### 1.1 Sub',
    '',
    'sub body',
    '',
    '## 2. Second',
    '',
    'second body',
  ].join('\n');

  it('returns the body up to the next heading of the same level', () => {
    expect(extractSection(md, /^## 1\. /)).toContain('first body');
    expect(extractSection(md, /^## 1\. /)).toContain('sub body');
    expect(extractSection(md, /^## 1\. /)).not.toContain('second body');
  });

  it('a subsection stops at the next heading of the same or a shallower level', () => {
    const section = extractSection(md, /^### 1\.1 /);
    expect(section).toContain('sub body');
    expect(section).not.toContain('second body');
  });

  it('runs to the end of the file when there is no following heading', () => {
    expect(extractSection(md, /^## 2\. /)).toContain('second body');
  });

  it('throws when nothing matches', () => {
    expect(() => extractSection(md, /^## 9\. /)).toThrow();
  });
});

describe('parseMarkdownTables', () => {
  it('splits two tables separated by prose into two entries, dropping separator rows', () => {
    const section = [
      'prose',
      '| A | B |',
      '|---|---|',
      '| a1 | b1 |',
      'more prose',
      '| C | D |',
      '| :-- | --: |',
      '| c1 | d1 |',
    ].join('\n');
    const tables = parseMarkdownTables(section);
    expect(tables).toHaveLength(2);
    expect(tables[0]).toEqual([
      ['A', 'B'],
      ['a1', 'b1'],
    ]);
    expect(tables[1]).toEqual([
      ['C', 'D'],
      ['c1', 'd1'],
    ]);
  });
});

describe('findTable', () => {
  it('finds the table whose header starts with the given cell', () => {
    const tables = [[['X', 'Y']], [['Route', 'Auth']]];
    expect(findTable(tables, 'Route')).toEqual([['Route', 'Auth']]);
  });

  it('throws when no table matches', () => {
    expect(() => findTable([[['X', 'Y']]], 'Route')).toThrow();
  });
});

describe('backtickTokens', () => {
  it('returns only tokens matching the whole pattern', () => {
    const text = 'a `first_open`, `Reviews10`, and `season_shown` happen.';
    expect(backtickTokens(text, /[a-z][a-z0-9_]*/)).toEqual(['first_open', 'season_shown']);
  });
});
