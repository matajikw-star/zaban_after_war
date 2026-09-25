import { describe, expect, it } from 'vitest';
import { diffSides, formatMismatch } from './compare.ts';

describe('diffSides', () => {
  it('is empty when both sides hold the same set', () => {
    expect(
      diffSides('t', { names: ['a', 'b'], label: 'left' }, { names: ['b', 'a'], label: 'right' }),
    ).toEqual([]);
  });

  it('reports a name only side A has as missing from side B', () => {
    const mismatches = diffSides(
      't',
      { names: ['a', 'b'], label: 'left' },
      { names: ['a'], label: 'right' },
    );
    expect(mismatches).toEqual([{ table: 't', name: 'b', missingFrom: 'right' }]);
  });

  it('reports a name only side B has as missing from side A', () => {
    const mismatches = diffSides(
      't',
      { names: ['a'], label: 'left' },
      { names: ['a', 'c'], label: 'right' },
    );
    expect(mismatches).toEqual([{ table: 't', name: 'c', missingFrom: 'left' }]);
  });

  it('reports both directions at once when each side has something unique', () => {
    const mismatches = diffSides(
      't',
      { names: ['a', 'b'], label: 'left' },
      { names: ['a', 'c'], label: 'right' },
    );
    expect(mismatches).toEqual([
      { table: 't', name: 'b', missingFrom: 'right' },
      { table: 't', name: 'c', missingFrom: 'left' },
    ]);
  });
});

describe('formatMismatch', () => {
  it('names the table, the name and the missing side on one line', () => {
    const line = formatMismatch({ table: 'collections', name: 'foo', missingFrom: 'x.ts' });
    expect(line).toContain('collections');
    expect(line).toContain('foo');
    expect(line).toContain('x.ts');
    expect(line.split('\n')).toHaveLength(1);
  });
});

// One mismatch in each direction, per table (ticket dev-foundation/04's "Done when"), exercised
// through the same diffSides() every check in index.ts uses — the per-table parsers already have
// their own tests; this proves the comparison itself catches drift for each of the five tables.
describe('one mismatch per direction, for each of the five tables', () => {
  const cases: Array<{ table: string; whatOnly: string; codeOnly: string }> = [
    { table: 'collections', whatOnly: 'review_events', codeOnly: 'extra_table' },
    { table: 'routes', whatOnly: 'GET /api/config', codeOnly: 'POST /api/extra' },
    { table: 'beacons (client)', whatOnly: 'first_open', codeOnly: 'extra_beacon' },
    { table: 'error codes', whatOnly: 'BAD_INPUT', codeOnly: 'EXTRA_CODE' },
    { table: 'env vars', whatOnly: 'SMS_PROVIDER', codeOnly: 'EXTRA_VAR' },
  ];

  for (const { table, whatOnly, codeOnly } of cases) {
    it(`${table}: a name only in what.md is reported missing from the code`, () => {
      const mismatches = diffSides(
        table,
        { names: [whatOnly], label: 'what.md' },
        { names: [], label: 'code' },
      );
      expect(mismatches).toEqual([{ table, name: whatOnly, missingFrom: 'code' }]);
    });

    it(`${table}: a name only in the code is reported missing from what.md`, () => {
      const mismatches = diffSides(
        table,
        { names: [], label: 'what.md' },
        { names: [codeOnly], label: 'code' },
      );
      expect(mismatches).toEqual([{ table, name: codeOnly, missingFrom: 'what.md' }]);
    });
  }
});
