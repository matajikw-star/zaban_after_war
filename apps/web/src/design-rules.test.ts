/**
 * The design rules that can be checked by reading the source (`what.md` §7.9, §17.5, ADR-0020).
 *
 * Two rules, each a plain scan of `src/**\/*.{ts,tsx}` (tests excluded):
 *
 * 1. Persian text lives in `strings.ts` and nowhere else. A comment may quote the copy it talks
 *    about; code may not hold it.
 * 2. The palette is monochrome. No Tailwind palette colour but `neutral`, no arbitrary colour in a
 *    class, and the two accent colours (`--success`, `--danger`) only where §7.9 allows them: the
 *    grading buttons and destructive confirmations.
 *
 * An exception is a line in an allowlist below, keyed by file, with the reason next to it. A new
 * entry is a design decision and belongs in the ticket that makes it.
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = path.dirname(fileURLToPath(import.meta.url));

/** Files allowed to hold Persian characters outside a comment, and why. */
const PERSIAN_ALLOWLIST: Record<string, string> = {
  'strings.ts': 'the one home of Persian copy (what.md §17.5)',
  'ui/format.ts':
    'the Persian percent sign «٪» is number formatting, the same job Intl does for the digits',
};

/** Files allowed to use the two accent colours, and why. */
const ACCENT_ALLOWLIST: Record<string, string> = {
  'ui/Button.tsx': 'defines the `success` and `danger` variants the allowed callers use',
  'screens/review/GradeBar.tsx': 'the two grading buttons «بلد بودم» / «بلد نبودم» (§7.9)',
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\.(ts|tsx)$/.test(entry.name)) return [];
    return [full];
  });
}

interface Line {
  readonly file: string;
  readonly number: number;
  readonly text: string;
}

/**
 * Every line that is not a comment. Deliberately simple: a line is a comment when it starts with
 * `//`, `/*`, `*` or `{/*`, or sits inside a `/* … *\/` block. A trailing `// …` after code is cut
 * off. Good enough for a codebase formatted by Biome, which never puts code after `*\/`.
 */
function codeLines(): Line[] {
  const lines: Line[] = [];
  for (const full of sourceFiles(SRC)) {
    const file = path.relative(SRC, full).split(path.sep).join('/');
    let inBlock = false;
    readFileSync(full, 'utf8')
      .split('\n')
      .forEach((raw, index) => {
        const trimmed = raw.trim();
        if (inBlock) {
          if (trimmed.includes('*/')) inBlock = false;
          return;
        }
        if (trimmed.startsWith('/*') || trimmed.startsWith('{/*')) {
          if (!trimmed.includes('*/')) inBlock = true;
          return;
        }
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
        const text = raw.replace(/\s\/\/\s.*$/, '');
        lines.push({ file, number: index + 1, text });
      });
  }
  return lines;
}

function describeLine(line: Line): string {
  return `${line.file}:${line.number}: ${line.text.trim()}`;
}

const PERSIAN = /[؀-ۿ]/;

/** Tailwind's palette names, minus `neutral` — the one gray this product uses. */
const PALETTE =
  'red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|stone';
const COLOR_UTILITY =
  'bg|text|border|border-[trblxyse]|ring|ring-offset|outline|fill|stroke|from|via|to|divide|decoration|accent|caret|shadow|placeholder';
const PALETTE_CLASS = new RegExp(`\\b(?:${COLOR_UTILITY})-(?:${PALETTE})-\\d{2,3}\\b`);
/** `bg-[#fff]`, `text-[rgb(…)]`, `border-[hsl(…)]` — a colour smuggled in as an arbitrary value. */
const ARBITRARY_COLOR = /-\[(?:#|rgba?\(|hsla?\(|oklch\(|color:)/;
/** The accent colours in any spelling a component could reach for. */
const ACCENT =
  /--success|--danger|\b(?:bg|text|border|ring|fill|stroke)-(?:success|danger)\b|variant="(?:success|danger)"/;

describe('design rules (what.md §7.9, §17.5)', () => {
  const lines = codeLines();

  it('finds the source it is meant to scan', () => {
    expect(lines.some((line) => line.file === 'strings.ts')).toBe(true);
    expect(lines.some((line) => line.file === 'screens/review/Review.tsx')).toBe(true);
  });

  it('keeps Persian text in strings.ts', () => {
    const offending = lines
      .filter((line) => PERSIAN_ALLOWLIST[line.file] === undefined && PERSIAN.test(line.text))
      .map(describeLine);
    expect(offending).toEqual([]);
  });

  it('uses no palette colour but the neutral scale', () => {
    const offending = lines
      .filter((line) => PALETTE_CLASS.test(line.text) || ARBITRARY_COLOR.test(line.text))
      .map(describeLine);
    expect(offending).toEqual([]);
  });

  it('keeps green and red on the grading buttons and destructive confirmations only', () => {
    const offending = lines
      .filter((line) => ACCENT_ALLOWLIST[line.file] === undefined && ACCENT.test(line.text))
      .map(describeLine);
    expect(offending).toEqual([]);
  });

  it('has a reason for every allowlist entry', () => {
    for (const reason of [
      ...Object.values(PERSIAN_ALLOWLIST),
      ...Object.values(ACCENT_ALLOWLIST),
    ]) {
      expect(reason.length).toBeGreaterThan(10);
    }
  });
});
